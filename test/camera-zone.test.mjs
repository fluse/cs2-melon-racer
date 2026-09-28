import { test } from "node:test";
import assert from "node:assert/strict";
import {
    CameraZoneFromName,
    NO_CAMERA_ZONE,
    StepZoneCamera,
    ZoneCameraClips,
    ZoneCameraExtra,
    ZoneCameraOffset,
} from "../src/melon_drive/logic/camera-zone.js";
import {
    CAMERA_ZONE_EXTRA_DISTANCE,
    CAMERA_ZONE_EXTRA_HEIGHT,
    CAMERA_ZONE_EASE_SECONDS,
    CAMERA_ZONE_MIN_DISTANCE,
} from "../src/melon_drive/constants/index.js";

const base = { x: -50, y: 0, z: 10 };

test("camera zone values come from the trigger name", () => {
    assert.deepEqual(CameraZoneFromName("camera_zone_250_40"), { distance: 250, height: 40, clip: true });
    assert.deepEqual(CameraZoneFromName("camera_zone_-30_-5"), { distance: -30, height: -5, clip: true });
    assert.deepEqual(CameraZoneFromName("camera_zone_120"), { distance: 120, height: 0, clip: true });
    assert.deepEqual(CameraZoneFromName("camera_zone_noclip_300_20"), { distance: 300, height: 20, clip: false });
    assert.deepEqual(CameraZoneFromName("some_trigger"), {
        distance: CAMERA_ZONE_EXTRA_DISTANCE,
        height: CAMERA_ZONE_EXTRA_HEIGHT,
        clip: true,
    });
});

test("camera zone zoom eases in over CAMERA_ZONE_EASE_SECONDS and back out after leaving", () => {
    const zone = { distance: 200, height: 40, clip: true };
    let state = StepZoneCamera(undefined, zone, CAMERA_ZONE_EASE_SECONDS / 2);
    assert.deepEqual(ZoneCameraExtra(state), { distance: 100, height: 20 });
    state = StepZoneCamera(state, zone, CAMERA_ZONE_EASE_SECONDS);
    assert.deepEqual(ZoneCameraExtra(state), { distance: 200, height: 40 });
    assert.equal(StepZoneCamera(state, zone, 0.1), state, "unchanged while fully zoomed");
    state = StepZoneCamera(state, NO_CAMERA_ZONE, CAMERA_ZONE_EASE_SECONDS * 2);
    assert.equal(state, undefined, "back to normal = no state");
    assert.equal(StepZoneCamera(undefined, NO_CAMERA_ZONE, 0.1), undefined);
});

test("switching zones mid-ease continues from the current zoom, no jump", () => {
    let state = StepZoneCamera(undefined, { distance: 200, height: 0, clip: true }, CAMERA_ZONE_EASE_SECONDS / 2);
    const before = ZoneCameraExtra(state).distance;
    state = StepZoneCamera(state, { distance: -40, height: 0, clip: true }, 0);
    assert.equal(ZoneCameraExtra(state).distance, before);
});

test("noclip zones keep wall clipping off until eased fully back", () => {
    const zone = { distance: 300, height: 0, clip: false };
    let state = StepZoneCamera(undefined, zone, CAMERA_ZONE_EASE_SECONDS * 2);
    assert.equal(ZoneCameraClips(state), false);
    state = StepZoneCamera(state, NO_CAMERA_ZONE, CAMERA_ZONE_EASE_SECONDS / 2);
    assert.equal(ZoneCameraClips(state), false);
    assert.equal(ZoneCameraClips(undefined), true);
});

test("zone offset: back/up by the zoom, zooming in stops CAMERA_ZONE_MIN_DISTANCE behind the melon", () => {
    assert.deepEqual(ZoneCameraOffset(base, undefined), base);
    const out = StepZoneCamera(undefined, { distance: 100, height: 30, clip: true }, CAMERA_ZONE_EASE_SECONDS);
    assert.deepEqual(ZoneCameraOffset(base, out), { x: base.x - 100, y: base.y, z: base.z + 30 });
    const tooClose = StepZoneCamera(undefined, { distance: -1000, height: 0, clip: true }, CAMERA_ZONE_EASE_SECONDS);
    assert.equal(ZoneCameraOffset(base, tooClose).x, -CAMERA_ZONE_MIN_DISTANCE);
});
