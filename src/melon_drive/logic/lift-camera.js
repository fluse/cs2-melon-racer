// Pure rules for the lift-zone camera zoom — no cs_script import, so it's
// unit-testable in Node (see test/lift-camera.test.mjs). camera.js applies
// the resulting offset.
import { LIFT_CAMERA_EXTRA_DISTANCE, LIFT_CAMERA_EXTRA_HEIGHT, LIFT_CAMERA_EASE_SECONDS } from "../constants/index.js";

/**
 * How far the lift camera is zoomed out after `dt` more seconds, 0 (normal)
 * to 1 (fully out): moves linearly towards 1 inside a lift zone and towards
 * 0 outside, taking LIFT_CAMERA_EASE_SECONDS for the whole way.
 * @param {number} blend current value @param {boolean} inLiftZone @param {number} dt
 */
export function LiftCameraBlend(blend, inLiftZone, dt) {
    const step = LIFT_CAMERA_EASE_SECONDS > 0 ? Math.max(0, dt) / LIFT_CAMERA_EASE_SECONDS : 1;
    return inLiftZone ? Math.min(1, blend + step) : Math.max(0, blend - step);
}

/**
 * The chase camera offset with the lift zoom applied: further back (x is
 * forward, negative = behind) and higher up, eased in and out (smoothstep)
 * so it doesn't start or stop with a jolt.
 * @param {{ x: number, y: number, z: number }} base the player's normal offset @param {number} blend see LiftCameraBlend
 */
export function LiftCameraOffset(base, blend) {
    const t = Math.max(0, Math.min(1, blend));
    const eased = t * t * (3 - 2 * t);
    return {
        x: base.x - LIFT_CAMERA_EXTRA_DISTANCE * eased,
        y: base.y,
        z: base.z + LIFT_CAMERA_EXTRA_HEIGHT * eased,
    };
}
