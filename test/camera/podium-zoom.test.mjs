// The podium camera zoom's rules (camera/podium-zoom/logic.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PodiumCameraBlend, PodiumCameraOffset } from "../../src/melon_drive/camera/podium-zoom/logic.js";
import { PODIUM_CAMERA_EXTRA_DISTANCE, PODIUM_CAMERA_EXTRA_HEIGHT, PODIUM_CAMERA_EASE_SECONDS } from "../../src/melon_drive/constants/index.js";

test("the blend eases out over PODIUM_CAMERA_EASE_SECONDS on the podium and back after", () => {
    assert.equal(PodiumCameraBlend(0, true, PODIUM_CAMERA_EASE_SECONDS / 2), 0.5);
    assert.equal(PodiumCameraBlend(0.9, true, PODIUM_CAMERA_EASE_SECONDS), 1);
    assert.equal(PodiumCameraBlend(0.2, false, PODIUM_CAMERA_EASE_SECONDS), 0);
});

test("fully out: further back and higher by the extra amounts; at 0 unchanged", () => {
    const base = { x: -100, y: 0, z: 20 };
    assert.deepEqual(PodiumCameraOffset(base, 0), base);
    assert.deepEqual(PodiumCameraOffset(base, 1), { x: base.x - PODIUM_CAMERA_EXTRA_DISTANCE, y: 0, z: base.z + PODIUM_CAMERA_EXTRA_HEIGHT });
});
