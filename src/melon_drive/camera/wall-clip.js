// The chase camera's wall pull-in, done by the script instead of the engine
// (CAMERA_WALL_* in constants.js): the engine's clipCameraOffset pulls in
// instantly, this eases both ways. The math is in wall-clip-logic.js.
import { TraceLine } from "../core/trace.js";
import { RotateCameraOffset, WallClipScale, StepWallClipScale } from "./wall-clip-logic.js";
import { FOLLOW_OFFSET } from "../constants/index.js";

/**
 * `offset` pulled in towards the melon as far as a wall in between needs it,
 * eased over `dt` (kart.cameraWallScale keeps the current pull-in). The
 * trace runs from the camera's pivot (the melon + FOLLOW_OFFSET) to where
 * the camera would be, skipping the melon itself and players.
 * @param {import("../core/kart-registry.js").Kart} kart
 * @param {{ x: number, y: number, z: number }} offset @param {number} dt
 */
export function WallClippedOffset(kart, offset, dt) {
    const origin = kart.melon.GetAbsOrigin();
    const pivot = { x: origin.x + FOLLOW_OFFSET.x, y: origin.y + FOLLOW_OFFSET.y, z: origin.z + FOLLOW_OFFSET.z };
    const toCamera = RotateCameraOffset(offset, kart.pawn.GetEyeAngles());
    const length = Math.hypot(toCamera.x, toCamera.y, toCamera.z);
    let target = 1;
    if (length > 0) {
        const trace = TraceLine({
            start: pivot,
            end: { x: pivot.x + toCamera.x, y: pivot.y + toCamera.y, z: pivot.z + toCamera.z },
            ignoreEntity: kart.melon,
            ignorePlayers: true,
        });
        target = trace.startedInSolid ? 1 : WallClipScale(trace.didHit, trace.fraction, length);
    }
    kart.cameraWallScale = StepWallClipScale(kart.cameraWallScale, target, dt);
    const scale = kart.cameraWallScale;
    return { x: offset.x * scale, y: offset.y * scale, z: offset.z * scale };
}
