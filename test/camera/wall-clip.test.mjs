// The script's own camera wall clipping (camera/wall-clip/logic.js): where the
// camera offset points in the world, how much of it fits before a wall, and
// how the pull-in eases — fast in, slower back out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RotateCameraOffset, WallClipScale, StepWallClipScale } from "../../src/melon_drive/camera/wall-clip/logic.js";
import { CAMERA_WALL_MARGIN, CAMERA_WALL_PULL_IN_RATE, CAMERA_WALL_RETURN_RATE } from "../../src/melon_drive/constants/index.js";

/** @param {{ x: number, y: number, z: number }} actual @param {{ x: number, y: number, z: number }} expected */
function AssertVector(actual, expected) {
    for (const axis of /** @type {const} */ (["x", "y", "z"])) {
        assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-9, `${axis}: ${actual[axis]} vs ${expected[axis]}`);
    }
}

test("camera offset is rotated by the eye angles: x forward, y left, z up", () => {
    AssertVector(RotateCameraOffset({ x: -50, y: 0, z: 10 }, { pitch: 0, yaw: 0 }), { x: -50, y: 0, z: 10 });
    AssertVector(RotateCameraOffset({ x: -50, y: 0, z: 0 }, { pitch: 0, yaw: 90 }), { x: 0, y: -50, z: 0 });
    AssertVector(RotateCameraOffset({ x: 0, y: 20, z: 0 }, { pitch: 0, yaw: 0 }), { x: 0, y: 20, z: 0 });
    // Looking straight down (pitch +90): "behind" is straight up.
    AssertVector(RotateCameraOffset({ x: -50, y: 0, z: 0 }, { pitch: 90, yaw: 0 }), { x: 0, y: 0, z: 50 });
});

test("no wall: the whole offset fits", () => {
    assert.equal(WallClipScale(false, 1, 100), 1);
    assert.equal(WallClipScale(true, 0.5, 0), 1, "a zero-length offset never clips");
});

test("a wall in between: the camera stops CAMERA_WALL_MARGIN short of it", () => {
    const length = 200;
    assert.equal(WallClipScale(true, 0.5, length), (0.5 * length - CAMERA_WALL_MARGIN) / length);
    assert.equal(WallClipScale(true, CAMERA_WALL_MARGIN / length / 2, length), 0, "a wall closer than the margin: right at the melon");
});

test("no current scale yet (fresh spawn): straight to the target", () => {
    assert.equal(StepWallClipScale(undefined, 0.3, 1 / 64), 0.3);
});

test("pulling in is faster than going back out", () => {
    assert.ok(CAMERA_WALL_PULL_IN_RATE > CAMERA_WALL_RETURN_RATE, "setup: pull-in rate above return rate");
    const dt = 1 / 64;
    const inStep = 1 - StepWallClipScale(1, 0, dt);
    const outStep = StepWallClipScale(0, 1, dt);
    assert.ok(inStep > 0 && outStep > 0, "both move");
    assert.ok(inStep > outStep, `pull-in ${inStep} vs return ${outStep}`);
});

test("easing never overshoots and ends exactly on the target", () => {
    let scale = 1;
    for (let i = 0; i < 64 * 3; i++) {
        scale = StepWallClipScale(scale, 0.25, 1 / 64);
        assert.ok(scale >= 0.25 && scale <= 1);
    }
    assert.equal(scale, 0.25);
    assert.equal(StepWallClipScale(0.6, 0.6, 1 / 64), 0.6);
});
