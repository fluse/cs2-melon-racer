// Pure rules for the user menu's camera tuning page — no cs_script import,
// so it's unit-testable in Node (test/dev/camera-tuning.test.mjs).
// camera-tuning.js next to it keeps the values on the kart and drives the HUD.
import { CAMERA_TUNING_MIN, CAMERA_TUNING_MAX, CAMERA_TUNING_SCALE_STEP } from "../constants/index.js";

/** A value kept on the scale, CAMERA_TUNING_MIN..CAMERA_TUNING_MAX. @param {number} value */
export function ClampCameraTuning(value) {
    return Math.max(CAMERA_TUNING_MIN, Math.min(CAMERA_TUNING_MAX, value));
}

/** How many segments the scale has (one per CAMERA_TUNING_SCALE_STEP, both ends included). */
export function CameraTuningSegmentCount() {
    return Math.floor((CAMERA_TUNING_MAX - CAMERA_TUNING_MIN) / CAMERA_TUNING_SCALE_STEP) + 1;
}

/** The value segment `index` stands for (0 = CAMERA_TUNING_MIN). @param {number} index */
export function CameraTuningSegmentValue(index) {
    return ClampCameraTuning(CAMERA_TUNING_MIN + index * CAMERA_TUNING_SCALE_STEP);
}

/**
 * Whether segment `index` is lit for `value`: the scale fills up from its
 * low end to the value, like a bar.
 * @param {number} index @param {number} value
 */
export function IsCameraTuningSegmentLit(index, value) {
    return CameraTuningSegmentValue(index) <= value;
}
