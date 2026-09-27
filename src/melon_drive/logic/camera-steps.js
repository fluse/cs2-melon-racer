// Pure step <-> value math for the user menu's camera "sliders" (rows of
// clickable notches, see camera.js / speedometer.xml) — no cs_script
// import, so it's unit-testable in Node (see test/camera-steps.test.mjs).
import {
    CAMERA_DISTANCE_MIN,
    CAMERA_DISTANCE_MAX,
    CAMERA_DISTANCE_STEPS,
    CAMERA_HEIGHT_MIN,
    CAMERA_HEIGHT_MAX,
    CAMERA_HEIGHT_STEPS,
} from "../constants.js";

/** @param {number} value @param {number} min @param {number} max @param {number} steps */
function StepFor(value, min, max, steps) {
    const fraction = (value - min) / (max - min);
    return Math.max(0, Math.min(steps - 1, Math.round(fraction * (steps - 1))));
}

/** @param {number} step @param {number} min @param {number} max @param {number} steps */
function ValueForStep(step, min, max, steps) {
    const fraction = steps > 1 ? step / (steps - 1) : 0;
    return min + fraction * (max - min);
}

/** @param {number} distance */
export function CameraDistanceStepFor(distance) {
    return StepFor(distance, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX, CAMERA_DISTANCE_STEPS);
}

/** @param {number} step */
export function CameraDistanceForStep(step) {
    return ValueForStep(step, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX, CAMERA_DISTANCE_STEPS);
}

/** @param {number} height */
export function CameraHeightStepFor(height) {
    return StepFor(height, CAMERA_HEIGHT_MIN, CAMERA_HEIGHT_MAX, CAMERA_HEIGHT_STEPS);
}

/** @param {number} step */
export function CameraHeightForStep(step) {
    return ValueForStep(step, CAMERA_HEIGHT_MIN, CAMERA_HEIGHT_MAX, CAMERA_HEIGHT_STEPS);
}
