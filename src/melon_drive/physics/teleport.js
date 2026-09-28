// Moving a kart's melon on purpose: checkpoint respawn, generic teleports,
// and its paint color (kept across breaks).
import { FacePlayerView } from "../spawn-points.js";
import { RestoreFullHealth } from "../heal/index.js";
import { LeaveZones } from "./zones.js";

/**
 * Teleports a kart's melon back to its last checkpoint and resets it to a
 * fresh, undamaged state — the shared final step of both the automatic
 * post-break respawn and the manual "Respawn at last checkpoint" user menu
 * button.
 * @param {import("../kart-registry.js").Kart} kart
 */
export function RespawnKartAtCheckpoint(kart) {
    kart.melon.Teleport({
        position: kart.checkpointPosition,
        angles: kart.checkpointAngles,
        velocity: { x: 0, y: 0, z: 0 },
    });
    FacePlayerView(kart.pawn, kart.checkpointAngles.yaw);
    kart.lastWallContact = undefined; // that wall is somewhere else now
    RestoreFullHealth(kart);
    // Cleared, not measured against zero: this is our own intentional
    // velocity reset, not a physical impact to react to.
    kart.lastVelocity = undefined;
    kart.settled = false;
    kart.speedCap = undefined;
    kart.pendingBounce = undefined;
    LeaveZones(kart);
}

/**
 * Moves a kart's melon somewhere else mid-drive (a generic teleporter, see
 * the melon_teleport input) without touching its health, respawn point or
 * checkpoint progress. The tracking state that compares against last tick
 * is cleared, so the jump in position/velocity isn't read as a hard impact
 * (damage) or a wall hit. speedCap is kept, so a wall-bounce boost carried
 * through the teleport isn't clamped away.
 * @param {import("../kart-registry.js").Kart} kart @param {any} position @param {any} angles @param {{ x: number, y: number, z: number }} velocity
 */
export function TeleportKartTo(kart, position, angles, velocity) {
    kart.melon.Teleport({ position, angles, velocity, angularVelocity: { x: 0, y: 0, z: 0 } });
    FacePlayerView(kart.pawn, angles.yaw);
    kart.lastWallContact = undefined; // that wall is somewhere else now
    kart.lastVelocity = undefined;
    kart.prevLastVelocity = undefined;
    kart.prevOrigin = undefined;
    kart.settled = false;
    kart.pendingBounce = undefined;
    LeaveZones(kart);
}

/**
 * Sets a kart's melon color and remembers it so it survives a break/respawn
 * (BreakMelon hides the melon entirely while broken, without losing track of
 * the color underneath — see ScheduleRespawnAfterBreak). Used by both the
 * melon_paint map trigger and the user menu's color swatches.
 * @param {import("../kart-registry.js").Kart} kart @param {{ r: number, g: number, b: number, a: number }} color
 */
export function SetKartPaintColor(kart, color) {
    kart.paintColor = color;
    if (!kart.breaking) {
        kart.melon.SetColor(color);
    }
}
