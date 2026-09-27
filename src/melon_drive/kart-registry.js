import { Debug } from "./debug.js";
import { predictionDotSet } from "./trace.js";

/**
 * @typedef {{
 *   pawn: any, melon: any,
 *   wallJumpCharge: number, // 0..1, see WALL_JUMP_CHARGE_COST — the HUD jump bar
 *   lastJumpTime?: number, // last ground jump — the next needs a newer ground contact, see CanGroundJump
 *   health: number, lastVelocity: { x: number, y: number, z: number } | undefined,
 *   trackId: number | undefined, checkpointIndex: number, checkpointPosition: any, checkpointAngles: any,
 *   lapsCompleted: number, inHub: boolean, racing: boolean, finished: boolean, locked: boolean,
 *   breaking: boolean, breakTime?: number, // game time BreakMelon ran, for the break camera zoom
 *   paintColor: { r: number, g: number, b: number, a: number }, userMenuOpen: boolean, hubModalOpen: boolean,
 *   cameraDistance: number, cameraHeight: number, settled: boolean,
 *   pawnAnchor: any, // where the frozen pawn is held — see HoldPawn
 *   teleportGen: number, // bumped by every race-flow teleport (BeginHeat/ReturnAllToHub) — see ScheduleRespawnAfterBreak
 *   speedCap?: number, // current horizontal speed limit; above MAX_SPEED only while a wall-bounce boost decays — unset means MAX_SPEED
 *   nextBounceTime?: number, lastBounceTime?: number, // wall-bounce timing, see UpdateKart
 *   lastBounceInfo?: { angle: number, angleFactor: number, jumpFactor: number }, // last bounce's result, for the HUD
 *   lastJumpPressTime?: number, wallTimingPressTime?: number, wallTimingLockedUntil?: number, // wall-bounce timing presses, see RegisterWallTimingPress
 *   lastGroundedTime?: number, // last tick the melon had ground contact — gates jumping, see UpdateGrounded
 *   lastWallContact?: { time: number, normal: { x: number, y: number } }, // last wall touched in the air (probe or bounce) — see UpdateWallContact
 *   lastWallJump?: { time: number, normal: { x: number, y: number } }, // see CanWallJump
 *   jumpDebug?: boolean, // this player's jump debug view is on (user menu toggle) — see physics/jump-debug.js
 *   contactDebug?: import("./physics/jump-debug.js").ContactDebug, // what this tick's probes saw, for that view
 *   prevLastVelocity?: { x: number, y: number, z: number }, prevOrigin?: any, // one tick further back than lastVelocity, for wall-bounce angle measurement
 *   predictionDots?: any[], // this kart's prediction-line dot entities, see prediction.js
 *   pendingBounce?: { time: number, impactSpeed: number, impactDir: { x: number, y: number, z: number }, angle: number, angleFactor: number, jumpFactor: number, speedGain: number }, // damage not yet charged — waits out the jump window, see SettleWallBounceDamage
 *   lastKnownPosition: any, lastKnownAngles: any, // set once the melon's first seen valid; unset only for a session's very first tick
 * }} Kart
 */
/** @type {Map<number, Kart>} */
export const karts = new Map();

// The first player to get a kart becomes the moderator, who can abort a
// heat that's already running (see "Moderator" in GAMEPLAY.md). If they
// disconnect, the next-oldest remaining player is promoted so there's
// always a moderator whenever anyone is on the map.
/** @type {number | undefined} */
export let moderatorSlot = undefined;

/** @param {number | undefined} slot */
export function SetModeratorSlot(slot) {
    moderatorSlot = slot;
}

// Safety net: moderatorSlot can otherwise go stale without a clean
// OnPlayerDisconnect firing for the old holder — a tools-mode script/map
// reload, or a kart getting pruned by Think's invalid-melon/pawn check (see
// think.js) — leaving it pointing at a slot nobody occupies. Left unchecked,
// that permanently hides the abort button from every remaining player
// (IsModerator never matches), which is exactly what strands a solo
// player unable to abort a heat nobody's actually racing. Called every
// Think tick (after invalid karts are pruned) and on disconnect.
export function EnsureModerator() {
    if (moderatorSlot !== undefined && karts.has(moderatorSlot)) {
        return;
    }
    const next = karts.keys().next();
    const reassigned = next.done ? undefined : next.value;
    if (reassigned !== moderatorSlot) {
        Debug(`EnsureModerator: moderatorSlot ${moderatorSlot} has no live kart, reassigning to ${reassigned}`);
        moderatorSlot = reassigned;
    }
}

/** @param {number | undefined} slot */
export function IsModerator(slot) {
    return slot !== undefined && slot === moderatorSlot;
}

/**
 * Stops tracking a kart and removes its melon from the world with it —
 * otherwise the melon would stay behind as an orphaned physics prop that the
 * player's next melon spawns on top of.
 * @param {number} slot @param {Kart} kart
 */
export function DropKart(slot, kart) {
    if (kart.melon.IsValid()) {
        kart.melon.Remove();
    }
    for (const dot of kart.predictionDots ?? []) {
        predictionDotSet.delete(dot);
        if (dot.IsValid()) {
            dot.Remove();
        }
    }
    karts.delete(slot);
}

/** @param {any} melon */
export function FindKartByMelon(melon) {
    for (const kart of karts.values()) {
        if (kart.melon === melon) {
            return kart;
        }
    }
    return undefined;
}
