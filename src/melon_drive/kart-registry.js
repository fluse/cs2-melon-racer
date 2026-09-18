import { Debug } from "./debug.js";

/**
 * @typedef {{
 *   pawn: any, melon: any, nextJumpTime: number,
 *   health: number, lastVelocity: { x: number, y: number, z: number } | undefined,
 *   trackId: number | undefined, checkpointIndex: number, checkpointPosition: any, checkpointAngles: any,
 *   lapsCompleted: number, inHub: boolean, racing: boolean, finished: boolean, locked: boolean,
 *   breaking: boolean, paintColor: { r: number, g: number, b: number, a: number }, userMenuOpen: boolean,
 *   cameraDistance: number,
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

/** @param {any} melon */
export function FindKartByMelon(melon) {
    for (const kart of karts.values()) {
        if (kart.melon === melon) {
            return kart;
        }
    }
    return undefined;
}
