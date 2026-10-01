// Pure rules for the script's own camera wall clipping — no cs_script import,
// so it's unit-testable in Node (see test/camera/wall-clip.test.mjs).
// wall-clip.js next to it does the trace and applies the result.
import { CAMERA_WALL_PULL_IN_RATE, CAMERA_WALL_RETURN_RATE, CAMERA_WALL_MARGIN } from "../../constants/index.js";

/**
 * A camera offset (x forward, y left, z up — like
 * CameraFollowConfig.cameraOffset) turned into a world-space vector by the
 * player's eye angles (pitch positive = looking down, as in Source).
 * @param {{ x: number, y: number, z: number }} offset @param {{ pitch: number, yaw: number }} angles
 */
export function RotateCameraOffset(offset, angles) {
    const p = (angles.pitch * Math.PI) / 180;
    const y = (angles.yaw * Math.PI) / 180;
    const forward = { x: Math.cos(p) * Math.cos(y), y: Math.cos(p) * Math.sin(y), z: -Math.sin(p) };
    const left = { x: -Math.sin(y), y: Math.cos(y), z: 0 };
    const up = { x: Math.sin(p) * Math.cos(y), y: Math.sin(p) * Math.sin(y), z: Math.cos(p) };
    return {
        x: forward.x * offset.x + left.x * offset.y + up.x * offset.z,
        y: forward.y * offset.x + left.y * offset.y + up.y * offset.z,
        z: forward.z * offset.x + left.z * offset.y + up.z * offset.z,
    };
}

/**
 * How much of the camera offset fits before a wall: 1 = the whole way (no
 * wall), down to 0 = right at the melon. The camera stops
 * CAMERA_WALL_MARGIN short of the wall.
 * @param {boolean} didHit @param {number} fraction the trace's hit fraction @param {number} length the offset's length
 */
export function WallClipScale(didHit, fraction, length) {
    if (!didHit || length <= 0) {
        return 1;
    }
    return Math.max(0, Math.min(1, (fraction * length - CAMERA_WALL_MARGIN) / length));
}

/**
 * Eases the current scale towards `target` over `dt` seconds — fast when
 * pulling in (CAMERA_WALL_PULL_IN_RATE), slower when going back out
 * (CAMERA_WALL_RETURN_RATE). No current value yet (fresh spawn/respawn):
 * straight to the target, so the camera doesn't glide in from somewhere.
 * @param {number | undefined} current @param {number} target @param {number} dt
 */
export function StepWallClipScale(current, target, dt) {
    if (current === undefined) {
        return target;
    }
    const rate = target < current ? CAMERA_WALL_PULL_IN_RATE : CAMERA_WALL_RETURN_RATE;
    const next = target + (current - target) * Math.exp(-rate * Math.max(0, dt));
    return Math.abs(next - target) < 0.001 ? target : next;
}
