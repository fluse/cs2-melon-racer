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
 *   runStartTime?: number, // game time this kart's timed run started (unset: no run) — see race/time-trial/time-trial.js
 *   lastRun?: { trackId: number, time: number, newBest: boolean, at: number }, // last finished run, for the HUD
 *   breaking: boolean, breakTime?: number, // game time BreakMelon ran, for the break camera zoom
 *   paintColor: { r: number, g: number, b: number, a: number }, userMenuOpen: boolean, hubModalOpen: boolean,
 *   settled: boolean,
 *   pawnAnchor: any, // where the frozen pawn is held — see HoldPawn
 *   teleportGen: number, // bumped by every race-flow teleport (BeginHeat/ReturnAllToHub) — see ScheduleRespawnAfterBreak
 *   speedCap?: number, // current horizontal speed limit; above the momentum top speed only while a wall-bounce/attack boost decays — unset means that top speed
 *   momentum?: import("../movement/momentum/logic.js").MomentumState, // top-speed steps earned by repeatedly reaching it (unset: none) — see MOMENTUM_*
 *   boostTrail?: { melon: any, entities: any[] }, // the boost trail running on this melon (unset: none) — see fx/boost-trail/boost-trail.js
 *   nextBounceTime?: number, lastBounceTime?: number, // wall-bounce timing, see UpdateKart
 *   lastBounceInfo?: { angle: number, angleFactor: number, jumpFactor: number }, // last bounce's result, for the HUD
 *   lastJumpPressTime?: number, lastIdleJumpPressTime?: number, wallTimingPressTime?: number, wallTimingLockedUntil?: number, // jump presses (the last one that did nothing: no ground/wall jump) and wall-bounce timing, see RegisterWallTimingPress
 *   floorNormalZ?: number, // this tick's floor trace normal z (undefined: nothing below) — flat landings cost more, see ImpactDamage
 *   lastGroundedTime?: number, // last tick the melon had ground contact — gates jumping, see UpdateGrounded
 *   lastWallContact?: { time: number, normal: { x: number, y: number } }, // last wall touched in the air (probe or bounce) — see UpdateWallContact
 *   lastWallJump?: { time: number, normal: { x: number, y: number } }, // see CanWallJump
 *   bufferedWallJumpTime?: number, // a lift-zone jump press not yet used, fired on the next wall touch — see LIFT_ZONE_JUMP_BUFFER
 *   perfectBounceBoost?: boolean, // its speed above MAX_SPEED is from a PERFECT bounce — no boost trail for that, see fx/boost-trail/boost-trail.js
 *   attackBoosting?: boolean, // the attack boost is on this tick — shows the boost trail, see fx/boost-trail/boost-trail.js
 *   attackGuardUntil?: number, // until when engine pushes from attack are cancelled — see ATTACK_PUSH_GUARD_SECONDS
 *   nextAttackDebugTime?: number, // when dev/attack-debug.js may log this kart's attack state again
 *   jumpDebug?: boolean, // this player's jump debug view is on (user menu toggle) — see dev/jump-debug.js
 *   contactDebug?: import("../dev/jump-debug.js").ContactDebug, // what this tick's probes saw, for that view
 *   prevLastVelocity?: { x: number, y: number, z: number }, prevOrigin?: any, // one tick further back than lastVelocity, for wall-bounce angle measurement
 *   painted?: boolean, // paintColor was chosen (trigger or user menu), not the unpainted default — see kart/look.js
 *   melonGlow?: boolean, // this player's melon has its outline glow (user menu toggle, on by default) — see kart/look.js
 *   predictionLine?: boolean, // this player's prediction line is on (user menu toggle, off by default) — see fx/prediction/prediction.js
 *   predictionDots?: any[], // this kart's prediction-line dot entities, see fx/prediction/prediction.js
 *   pendingBounce?: { time: number, impactSpeed: number, impactDir: { x: number, y: number, z: number }, angle: number, angleFactor: number, jumpFactor: number, speedGain: number }, // damage not yet charged — waits out the jump window, see SettleWallBounceDamage
 *   healZones?: Map<any, number>, // heal triggers the melon is inside -> their rate (health/s), see health/heal/zone.js
 *   liftCameraBlend?: number, // 0..1, how far the camera is zoomed out for a lift zone — see UpdateLiftCamera
 *   liftZones?: Map<any, number>, // lift triggers the melon is inside -> their wall-bounce kick (u/s up), see zones/registry.js
 *   jumpPads?: Map<any, import("../zones/jump-pad/logic.js").JumpPad>, // jump pad triggers the melon is on -> their launch, see zones/registry.js
 *   lastPadLaunchTime?: number, // last jump pad launch — see ShouldPadLaunch
 *   padFlight?: import("../zones/jump-pad/logic.js").PadFlight, // a jump pad launch's damage protection, still on — see zones/jump-pad/jump-pad.js
 *   cameraZones?: Map<any, import("../zones/camera-zone/logic.js").CameraZone>, // camera triggers the melon is inside -> their zoom, see zones/registry.js
 *   zoneCamera?: import("../zones/camera-zone/logic.js").ZoneCameraState, // the camera-zone zoom being eased in/out — see UpdateZoneCamera
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
// core/think.js) — leaving it pointing at a slot nobody occupies. Left unchecked,
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
    for (const entity of kart.boostTrail?.entities ?? []) {
        if (entity.IsValid()) {
            entity.Remove();
        }
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
