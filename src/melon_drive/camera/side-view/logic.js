// Pure rules for the side-view camera — no cs_script import, so it's
// unit-testable in Node (see test/camera/side-view.test.mjs). side-view.js
// next to it places the camera.
import {
    SIDE_VIEW_EASE_SECONDS,
    SIDE_VIEW_TELEPORT_DISTANCE,
    SIDE_VIEW_TELEPORT_CUT_SECONDS,
    SIDE_VIEW_CAMERA_SMOOTH_SECONDS,
    SIDE_VIEW_CAMERA_HEIGHT_SMOOTH_SECONDS,
} from "../../constants/index.js";
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
 * One axis of a critically damped spring (like Unity's SmoothDamp): moves
 * `current` towards `target` over about `smoothTime` seconds without
 * overshooting a still target, keeping its own speed — so a target that
 * stops dead or turns round is followed smoothly, not with a jerk.
 * @param {number} current @param {number} target @param {number} speed the axis's speed so far
 * @param {number} smoothTime @param {number} dt @returns {{ value: number, speed: number }}
 */
export function SmoothDamp(current, target, speed, smoothTime, dt) {
    const omega = 2 / Math.max(1e-4, smoothTime);
    const x = omega * Math.max(0, dt);
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = current - target;
    const temp = (speed + omega * change) * dt;
    return { value: target + (change + temp) * decay, speed: (speed - omega * temp) * decay };
}

/** @typedef {{ point: { x: number, y: number, z: number }, speed: { x: number, y: number, z: number } }} SideViewFocus where the side camera aims, and how fast that moves */

/**
 * Where the side camera aims after `dt` more seconds: on a damped spring
 * towards the melon (SIDE_VIEW_CAMERA_SMOOTH_SECONDS), ahead of it by its
 * horizontal speed times that (a damped follow trails by about that much,
 * so a steady melon stays centered), and its height on a softer spring
 * without aiming ahead (SIDE_VIEW_CAMERA_HEIGHT_SMOOTH_SECONDS). No previous
 * focus (just entered, teleported): right at the melon, moving with it.
 * @param {SideViewFocus | undefined} previous
 * @param {{ x: number, y: number, z: number }} origin the melon's center @param {{ x: number, y: number, z: number }} velocity its velocity
 * @param {number} dt @returns {SideViewFocus}
 */
export function StepSideViewFocus(previous, origin, velocity, dt) {
    const lead = SIDE_VIEW_CAMERA_SMOOTH_SECONDS;
    const target = { x: origin.x + velocity.x * lead, y: origin.y + velocity.y * lead, z: origin.z };
    if (!previous) {
        return { point: { ...origin }, speed: { x: velocity.x, y: velocity.y, z: 0 } };
    }
    const x = SmoothDamp(previous.point.x, target.x, previous.speed.x, lead, dt);
    const y = SmoothDamp(previous.point.y, target.y, previous.speed.y, lead, dt);
    const z = SmoothDamp(previous.point.z, target.z, previous.speed.z, SIDE_VIEW_CAMERA_HEIGHT_SMOOTH_SECONDS, dt);
    return { point: { x: x.value, y: y.value, z: z.value }, speed: { x: x.speed, y: y.speed, z: z.speed } };
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
