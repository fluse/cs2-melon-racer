// The user menu's camera "sliders": step <-> value math, and that the
// panorama layout has exactly one clickable notch per step (a missing one
// can't be clicked, an extra one does nothing).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    CameraDistanceStepFor,
    CameraDistanceForStep,
    CameraHeightStepFor,
    CameraHeightForStep,
} from "../src/melon_drive/logic/camera-steps.js";
import {
    CAMERA_DISTANCE_MIN,
    CAMERA_DISTANCE_MAX,
    CAMERA_DISTANCE_DEFAULT,
    CAMERA_DISTANCE_STEPS,
    CAMERA_HEIGHT_MIN,
    CAMERA_HEIGHT_MAX,
    CAMERA_HEIGHT_DEFAULT,
    CAMERA_HEIGHT_STEPS,
} from "../src/melon_drive/constants.js";

const layout = readFileSync(new URL("../panorama/layout/custom_game/speedometer.xml", import.meta.url), "utf8");

const sliders = [
    { name: "distance", prefix: "camdist_seg_", min: CAMERA_DISTANCE_MIN, max: CAMERA_DISTANCE_MAX, def: CAMERA_DISTANCE_DEFAULT, steps: CAMERA_DISTANCE_STEPS, stepFor: CameraDistanceStepFor, forStep: CameraDistanceForStep },
    { name: "height", prefix: "camheight_seg_", min: CAMERA_HEIGHT_MIN, max: CAMERA_HEIGHT_MAX, def: CAMERA_HEIGHT_DEFAULT, steps: CAMERA_HEIGHT_STEPS, stepFor: CameraHeightStepFor, forStep: CameraHeightForStep },
];

for (const s of sliders) {
    test(`${s.name}: first notch is the minimum, last is the maximum`, () => {
        assert.equal(s.forStep(0), s.min);
        assert.equal(s.forStep(s.steps - 1), s.max);
    });

    test(`${s.name}: every notch maps back to itself`, () => {
        for (let step = 0; step < s.steps; step++) {
            assert.equal(s.stepFor(s.forStep(step)), step);
        }
    });

    test(`${s.name}: notches get strictly larger`, () => {
        for (let step = 1; step < s.steps; step++) {
            assert.ok(s.forStep(step) > s.forStep(step - 1));
        }
    });

    test(`${s.name}: default and out-of-range values still land on a real notch`, () => {
        for (const value of [s.def, s.min - 100, s.max + 100]) {
            const step = s.stepFor(value);
            assert.ok(Number.isInteger(step) && step >= 0 && step < s.steps, `${value} -> step ${step}`);
        }
    });

    test(`${s.name}: speedometer.xml has exactly one notch button per step`, () => {
        const ids = [...layout.matchAll(new RegExp(`id="${s.prefix}(\\d+)"`, "g"))].map((m) => Number(m[1]));
        assert.deepEqual(ids.sort((a, b) => a - b), Array.from({ length: s.steps }, (_, i) => i));
    });
}
