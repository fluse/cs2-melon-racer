import { test } from "node:test";
import assert from "node:assert/strict";
import {
    CameraZoneFromName,
    NO_CAMERA_ZONE,
    StepZoneCamera,
    ZoneCameraClips,
    ZoneCameraExtra,
    ZoneCameraOffset,
    ZoneCameraFront,
} from "../../src/melon_drive/zones/camera-zone/logic.js";
import {
    CAMERA_ZONE_EXTRA_DISTANCE,
    CAMERA_ZONE_EXTRA_HEIGHT,
    CAMERA_ZONE_EASE_SECONDS,
    CAMERA_ZONE_MIN_DISTANCE,
    CAMERA_ZONE_FRONT_HEIGHT,
    CAMERA_CLOSEUP_DISTANCE,
    CAMERA_CLOSEUP_HEIGHT,
    CAMERA_CLOSEUP_EASE_SECONDS,
    CAMERA_DISTANCE,
    CAMERA_HEIGHT,
    FOLLOW_OFFSET,
} from "../../src/melon_drive/constants/index.js";

const base = { x: -50, y: 0, z: 10 };
// The real normal offset, what front zones are measured against.
const normal = { x: -CAMERA_DISTANCE, y: 0, z: CAMERA_HEIGHT };

test("camera zone values come from the trigger name", () => {
    assert.deepEqual(CameraZoneFromName("camera_zone_250_40"), { distance: 250, height: 40, clip: true, front: false });
    assert.deepEqual(CameraZoneFromName("camera_zone_-30_-5"), { distance: -30, height: -5, clip: true, front: false });
    assert.deepEqual(CameraZoneFromName("camera_zone_120"), { distance: 120, height: 0, clip: true, front: false });
    assert.deepEqual(CameraZoneFromName("camera_zone_noclip_300_20"), { distance: 300, height: 20, clip: false, front: false });
    assert.deepEqual(CameraZoneFromName("some_trigger"), {
        distance: CAMERA_ZONE_EXTRA_DISTANCE,
        height: CAMERA_ZONE_EXTRA_HEIGHT,
        clip: true,
        front: false,
    });
    assert.equal(CameraZoneFromName("camera_zone_front_40_0").front, true);
    assert.equal(CameraZoneFromName("camera_zone_noclip_front_40_0").clip, false);
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

test("front zone: camera ends up <ahead> in front of and <height> above the melon's center", () => {
    const at = (name) => {
        const state = StepZoneCamera(undefined, CameraZoneFromName(name), CAMERA_ZONE_EASE_SECONDS);
        const offset = ZoneCameraOffset(normal, state);
        return { ahead: offset.x, above: offset.z + FOLLOW_OFFSET.z };
    };
    assert.deepEqual(at("camera_zone_front_40_3"), { ahead: 40, above: 3 });
    assert.deepEqual(at("camera_zone_front_40"), { ahead: 40, above: CAMERA_ZONE_FRONT_HEIGHT });
});

test("front zone: no min-distance stop while easing in or back out, so no jump", () => {
    const zone = CameraZoneFromName("camera_zone_front_40_0");
    let state = StepZoneCamera(undefined, zone, CAMERA_ZONE_EASE_SECONDS / 2);
    assert.equal(ZoneCameraFront(state), true);
    const half = ZoneCameraOffset(normal, state).x;
    assert.equal(half, normal.x - zone.distance / 2);
    state = StepZoneCamera(state, zone, CAMERA_ZONE_EASE_SECONDS);
    state = StepZoneCamera(state, NO_CAMERA_ZONE, CAMERA_ZONE_EASE_SECONDS / 2);
    assert.equal(ZoneCameraFront(state), true, "still easing back from the front");
    assert.equal(ZoneCameraOffset(normal, state).x, half);
    assert.equal(StepZoneCamera(state, NO_CAMERA_ZONE, CAMERA_ZONE_EASE_SECONDS), undefined);
});

test("close-up zone: camera ends up <behind> behind and <height> above the melon's center, defaults without values", () => {
    const at = (name) => {
        const zone = CameraZoneFromName(name);
        const state = StepZoneCamera(undefined, zone, zone.ease ?? CAMERA_ZONE_EASE_SECONDS);
        const offset = ZoneCameraOffset(normal, state);
        return { behind: -offset.x, above: offset.z + FOLLOW_OFFSET.z };
    };
    assert.deepEqual(at("camera_zone_close_12_2"), { behind: 12, above: 2 });
    assert.deepEqual(at("camera_zone_close_12"), { behind: 12, above: CAMERA_CLOSEUP_HEIGHT });
    assert.deepEqual(at("camera_zone_close"), { behind: CAMERA_CLOSEUP_DISTANCE, above: CAMERA_CLOSEUP_HEIGHT });
    assert.equal(CameraZoneFromName("camera_zone_noclip_close_15_3").clip, false);
    assert.equal(CameraZoneFromName("camera_zone_close").clip, true);
});

test("close-up zone: eases in and back out over CAMERA_CLOSEUP_EASE_SECONDS", () => {
    const zone = CameraZoneFromName("camera_zone_close");
    let state = StepZoneCamera(undefined, zone, CAMERA_CLOSEUP_EASE_SECONDS / 2);
    assert.ok(state && Math.abs(state.t - 0.5) < 1e-9, `halfway in (${state?.t})`);
    state = StepZoneCamera(state, zone, CAMERA_CLOSEUP_EASE_SECONDS / 2);
    assert.equal(state?.t, 1);
    state = StepZoneCamera(state, NO_CAMERA_ZONE, CAMERA_CLOSEUP_EASE_SECONDS / 2);
    assert.ok(state && Math.abs(state.t - 0.5) < 1e-9, `halfway out (${state?.t})`);
    // ...while a plain zone keeps CAMERA_ZONE_EASE_SECONDS.
    const plain = StepZoneCamera(undefined, CameraZoneFromName("camera_zone_-30_0"), CAMERA_ZONE_EASE_SECONDS);
    assert.equal(plain?.t, 1);
});
