// Pure rules shared by the user menu's tuning pages (camera-tuning.js,
// physics-tuning.js): a value on a scale with − / + buttons in a big and a
// fine step and a clickable row of segments, filled up to the value. No
// cs_script import — tested in Node (test/dev/tuning-scale.test.mjs);
// tuning-scale.js next to it draws a scale on the HUD.
import {
    CAMERA_TUNING_MIN,
    CAMERA_TUNING_MAX,
    CAMERA_TUNING_STEP,
    CAMERA_TUNING_FINE_STEP,
    CAMERA_TUNING_SCALE_STEP,
    PHYSICS_TUNING_MIN,
    PHYSICS_TUNING_MAX,
    PHYSICS_TUNING_STEP,
    PHYSICS_TUNING_FINE_STEP,
    PHYSICS_TUNING_SCALE_STEP,
} from "../constants/index.js";

/**
 * @typedef {{
 *   min: number, max: number, // the scale's ends
 *   step: number, fineStep: number, // what the outer and inner − / + buttons change a value by
 *   segmentStep: number, // one clickable segment every this much, min..max
 * }} TuningScale
 */

/** The camera page's scale (units). @type {TuningScale} */
export const CAMERA_TUNING_SCALE = {
    min: CAMERA_TUNING_MIN,
    max: CAMERA_TUNING_MAX,
    step: CAMERA_TUNING_STEP,
    fineStep: CAMERA_TUNING_FINE_STEP,
    segmentStep: CAMERA_TUNING_SCALE_STEP,
};

/** The physics page's scale (percent). @type {TuningScale} */
export const PHYSICS_TUNING_SCALE = {
    min: PHYSICS_TUNING_MIN,
    max: PHYSICS_TUNING_MAX,
    step: PHYSICS_TUNING_STEP,
    fineStep: PHYSICS_TUNING_FINE_STEP,
    segmentStep: PHYSICS_TUNING_SCALE_STEP,
};

/** A value kept on the scale. @param {TuningScale} scale @param {number} value */
export function ClampOnScale(scale, value) {
    return Math.max(scale.min, Math.min(scale.max, value));
}

/** How many segments the scale has (both ends included). @param {TuningScale} scale */
export function ScaleSegmentCount(scale) {
    return Math.floor((scale.max - scale.min) / scale.segmentStep) + 1;
}

/** The value segment `index` stands for (0 = the low end). @param {TuningScale} scale @param {number} index */
export function ScaleSegmentValue(scale, index) {
    return ClampOnScale(scale, scale.min + index * scale.segmentStep);
}

/** Whether segment `index` is lit for `value` (filled up from the low end). @param {TuningScale} scale @param {number} index @param {number} value */
export function IsScaleSegmentLit(scale, index, value) {
    return ScaleSegmentValue(scale, index) <= value;
}

/**
 * @typedef {{ row: string, action: "minus" | "plus" | "minus_fine" | "plus_fine" } | { row: string, action: "segment", segment: number }} TuningButton
 */

/**
 * Which row and control a tuning page's button is: its id is
 * `<prefix><row>_minus|plus|minus_fine|plus_fine|seg_<i>` (e.g.
 * "camtune_height_plus_fine", "phytune_jump_seg_12"). undefined for any
 * other id.
 * @param {string} prefix @param {string} buttonId @returns {TuningButton | undefined}
 */
export function ParseTuningButton(prefix, buttonId) {
    if (!buttonId.startsWith(prefix)) {
        return undefined;
    }
    const match = /^([a-z]+)_(minus_fine|plus_fine|minus|plus|seg_(\d+))$/.exec(buttonId.slice(prefix.length));
    if (!match) {
        return undefined;
    }
    if (match[3] !== undefined) {
        return { row: match[1], action: "segment", segment: Number(match[3]) };
    }
    return { row: match[1], action: /** @type {"minus" | "plus" | "minus_fine" | "plus_fine"} */ (match[2]) };
}

/**
 * The value after clicking `button` on a row now at `current`: a step up or
 * down, or straight to a segment's value — kept on the scale.
 * @param {TuningScale} scale @param {number} current @param {TuningButton} button
 */
export function TunedValue(scale, current, button) {
    switch (button.action) {
        case "minus":
            return ClampOnScale(scale, current - scale.step);
        case "plus":
            return ClampOnScale(scale, current + scale.step);
        case "minus_fine":
            return ClampOnScale(scale, current - scale.fineStep);
        case "plus_fine":
            return ClampOnScale(scale, current + scale.fineStep);
        case "segment":
            return ScaleSegmentValue(scale, button.segment);
    }
}
