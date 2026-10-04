// Pure rules for the side-view camera — no cs_script import, so it's
// unit-testable in Node (see test/camera/side-view.test.mjs). side-view.js
// next to it places the camera.
import { SIDE_VIEW_EASE_SECONDS, SIDE_VIEW_TELEPORT_DISTANCE, SIDE_VIEW_TELEPORT_CUT_SECONDS } from "../../constants/index.js";
import { SideViewAxes } from "../../zones/side-view/logic.js";
import { RotateCameraOffset } from "../wall-clip/logic.js";

/**
 * @typedef {{ position: { x: number, y: number, z: number }, angles: { pitch: number, yaw: number, roll: number } }} CameraPose
 */

/**
 * How far the camera has swung to the side after `dt` more seconds, 0 (chase
 * camera) to 1 (side view): linearly towards 1 inside a side-view zone and
 * towards 0 outside, SIDE_VIEW_EASE_SECONDS for the whole way.
 * @param {number} blend @param {boolean} inSideView @param {number} dt
 */
export function StepSideViewBlend(blend, inSideView, dt) {
    const step = SIDE_VIEW_EASE_SECONDS > 0 ? Math.max(0, dt) / SIDE_VIEW_EASE_SECONDS : 1;
    return inSideView ? Math.min(1, blend + step) : Math.max(0, blend - step);
}

/**
 * Whether the melon got from `previous` to `origin` in one tick only by a
 * teleport (SIDE_VIEW_TELEPORT_DISTANCE).
 * @param {{ x: number, y: number, z: number } | undefined} previous @param {{ x: number, y: number, z: number }} origin
 */
export function IsTeleportJump(previous, origin) {
    if (!previous) {
        return false;
    }
    const dx = origin.x - previous.x;
    const dy = origin.y - previous.y;
    const dz = origin.z - previous.z;
    return dx * dx + dy * dy + dz * dz > SIDE_VIEW_TELEPORT_DISTANCE * SIDE_VIEW_TELEPORT_DISTANCE;
}

/**
 * Whether leaving the side view now cuts straight to the chase camera: the
 * melon was teleported out (a jump at most SIDE_VIEW_TELEPORT_CUT_SECONDS
 * ago) — swinging back from a side view of where it landed, with the view
 * turned along the old 2D track, would only throw the camera around.
 * @param {number | undefined} teleportTime @param {number} now
 */
export function CutsSideViewExit(teleportTime, now) {
    return teleportTime !== undefined && now - teleportTime <= SIDE_VIEW_TELEPORT_CUT_SECONDS;
}

/**
 * The side camera: `distance` back from `target` against the view direction
 * and `height` above it, looking at it.
 * @param {{ x: number, y: number, z: number }} target the melon's center
 * @param {import("../../zones/side-view/logic.js").SideView} sideView @returns {CameraPose}
 */
export function SideViewPose(target, sideView) {
    const { view } = SideViewAxes(sideView.yaw);
    return {
        position: {
            x: target.x - view.x * sideView.distance,
            y: target.y - view.y * sideView.distance,
            z: target.z + sideView.height,
        },
        // Pitch positive = looking down, as in Source.
        angles: { pitch: (Math.atan2(sideView.height, sideView.distance) * 180) / Math.PI, yaw: sideView.yaw, roll: 0 },
    };
}

/**
 * Where the chase camera (FOLLOW_POSITION) is: `offset` from `pivot`, turned
 * by the eye angles, looking along them.
 * @param {{ x: number, y: number, z: number }} pivot the melon + FOLLOW_OFFSET
 * @param {{ x: number, y: number, z: number }} offset @param {{ pitch: number, yaw: number }} eyeAngles
 * @returns {CameraPose}
 */
export function ChaseCameraPose(pivot, offset, eyeAngles) {
    const d = RotateCameraOffset(offset, eyeAngles);
    return {
        position: { x: pivot.x + d.x, y: pivot.y + d.y, z: pivot.z + d.z },
        angles: { pitch: eyeAngles.pitch, yaw: eyeAngles.yaw, roll: 0 },
    };
}

/**
 * `from` -> `to` at `t` (0..1, smoothstep-eased); the yaw turns the short way round.
 * @param {CameraPose} from @param {CameraPose} to @param {number} t @returns {CameraPose}
 */
export function BlendPose(from, to, t) {
    const c = Math.max(0, Math.min(1, t));
    const e = c * c * (3 - 2 * c);
    const lerp = (/** @type {number} */ a, /** @type {number} */ b) => a + (b - a) * e;
    const yawDiff = ((((to.angles.yaw - from.angles.yaw) % 360) + 540) % 360) - 180;
    return {
        position: {
            x: lerp(from.position.x, to.position.x),
            y: lerp(from.position.y, to.position.y),
            z: lerp(from.position.z, to.position.z),
        },
        angles: { pitch: lerp(from.angles.pitch, to.angles.pitch), yaw: from.angles.yaw + yawDiff * e, roll: 0 },
    };
}
