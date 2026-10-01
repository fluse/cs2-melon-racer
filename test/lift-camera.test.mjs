import { test } from "node:test";
import assert from "node:assert/strict";
import { LiftCameraBlend, LiftCameraOffset } from "../src/melon_drive/camera/lift-zoom-logic.js";
import { LIFT_CAMERA_EXTRA_DISTANCE, LIFT_CAMERA_EXTRA_HEIGHT, LIFT_CAMERA_EASE_SECONDS } from "../src/melon_drive/constants/index.js";

const base = { x: -50, y: 0, z: 10 };

test("lift camera zooms out fully after LIFT_CAMERA_EASE_SECONDS in a zone, and back in after leaving", () => {
    assert.equal(LiftCameraBlend(0, true, LIFT_CAMERA_EASE_SECONDS / 2), 0.5);
    assert.equal(LiftCameraBlend(0, true, LIFT_CAMERA_EASE_SECONDS * 2), 1);
    assert.equal(LiftCameraBlend(1, false, LIFT_CAMERA_EASE_SECONDS * 2), 0);
});

test("lift camera offset: normal at 0, fully back and up at 1", () => {
    assert.deepEqual(LiftCameraOffset(base, 0), base);
    assert.deepEqual(LiftCameraOffset(base, 1), {
        x: base.x - LIFT_CAMERA_EXTRA_DISTANCE,
        y: base.y,
        z: base.z + LIFT_CAMERA_EXTRA_HEIGHT,
    });
});

test("lift camera offset is eased: halfway blend = halfway offset, but slow at both ends", () => {
    assert.equal(LiftCameraOffset(base, 0.5).z, base.z + LIFT_CAMERA_EXTRA_HEIGHT / 2);
    assert.ok(LiftCameraOffset(base, 0.1).z - base.z < LIFT_CAMERA_EXTRA_HEIGHT * 0.1);
});
