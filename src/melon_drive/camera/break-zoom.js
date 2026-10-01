// Break camera: pulls back from a broken melon so the burst is visible
// (BREAK_CAMERA_* — the math is BreakCameraOffset in ../logic/break-sequence.js).
import { BreakCameraOffset } from "../health/breaking/logic.js";
import { GetCameraOffsetFor, SetFollowOffset } from "./follow.js";

/**
 * Pulls the chase camera back from a broken melon (still frozen, hidden, at
 * the crash site) so the burst is visible — called every tick while
 * kart.breaking; ApplyCameraFollow restores the normal offset on respawn.
 * @param {import("../core/kart-registry.js").Kart} kart @param {number} elapsed seconds since the break
 */
export function ApplyBreakCameraZoom(kart, elapsed) {
    SetFollowOffset(kart, BreakCameraOffset(GetCameraOffsetFor(kart), elapsed), true);
}
