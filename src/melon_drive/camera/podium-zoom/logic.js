// Pure rules for the podium camera zoom — no cs_script import, so it's
// unit-testable in Node (see test/camera/podium-zoom.test.mjs).
// podium-zoom.js next to it and ../follow/follow.js apply it.
import { PODIUM_CAMERA_EXTRA_DISTANCE, PODIUM_CAMERA_EXTRA_HEIGHT, PODIUM_CAMERA_EASE_SECONDS } from "../../constants/index.js";

/**
 * How far the podium camera is zoomed out after `dt` more seconds, 0
 * (normal) to 1 (fully out): towards 1 while held on the podium, towards 0
 * after, taking PODIUM_CAMERA_EASE_SECONDS for the whole way.
 * @param {number} blend current value @param {boolean} onPodium @param {number} dt
 */
export function PodiumCameraBlend(blend, onPodium, dt) {
    const step = PODIUM_CAMERA_EASE_SECONDS > 0 ? Math.max(0, dt) / PODIUM_CAMERA_EASE_SECONDS : 1;
    return onPodium ? Math.min(1, blend + step) : Math.max(0, blend - step);
}

/**
 * The chase camera offset with the podium zoom on top: further back (x is
 * forward, negative = behind) and higher, eased (smoothstep).
 * @param {{ x: number, y: number, z: number }} base @param {number} blend see PodiumCameraBlend
 */
export function PodiumCameraOffset(base, blend) {
    const t = Math.max(0, Math.min(1, blend));
    const eased = t * t * (3 - 2 * t);
    return {
        x: base.x - PODIUM_CAMERA_EXTRA_DISTANCE * eased,
        y: base.y,
        z: base.z + PODIUM_CAMERA_EXTRA_HEIGHT * eased,
    };
}
