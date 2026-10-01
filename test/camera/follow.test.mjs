// The chase camera's follow config: walls pull it in through the script's own,
// eased clipping (camera/wall-clip.js) — never the engine's instant
// clipCameraOffset — except for the break camera, which keeps the engine's.
// Runs against the fake engine in helpers/cs-script-mock.mjs.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn } from "../helpers/cs-script-mock.mjs";

const { ApplyCameraFollow, UpdateFollowCamera, SetFollowOffset, GetCameraOffsetFor } = await import("../../src/melon_drive/camera/follow.js");
const { CAMERA_OFFSET_RETURN_STRENGTH, CAMERA_WALL_MARGIN } = await import("../../src/melon_drive/constants/index.js");

/** @type {any} */
let kart;
/** @type {number | undefined} hit fraction of the next traces, undefined = nothing hit */
let wallAt;

beforeEach(() => {
    world.reset();
    wallAt = undefined;
    world.traceLine = () => (wallAt === undefined
        ? { didHit: false, fraction: 1, startedInSolid: false }
        : { didHit: true, fraction: wallAt, startedInSolid: false });
    kart = { pawn: world.add(new CSPlayerPawn({ slot: 0 })), melon: world.add(new Entity({ className: "prop_physics" })) };
});

const normal = () => GetCameraOffsetFor(kart);
const applied = () => kart.pawn.camera.config;

test("no wall: the normal offset, and the engine's clipping stays off", () => {
    ApplyCameraFollow(kart);
    assert.deepEqual(applied().cameraOffset, normal());
    assert.equal(applied().clipCameraOffset, false);
    assert.equal(applied().followEntity, kart.melon);
});

test("spawning with a wall behind: pulled in at once, CAMERA_WALL_MARGIN short of it", () => {
    wallAt = 0.5;
    ApplyCameraFollow(kart);
    const length = Math.hypot(normal().x, normal().y, normal().z);
    const scale = Math.max(0, (0.5 * length - CAMERA_WALL_MARGIN) / length);
    assert.ok(Math.abs(applied().cameraOffset.x - normal().x * scale) < 1e-9);
});

test("a wall appearing: the camera eases in over several ticks, then back out once it's gone", () => {
    ApplyCameraFollow(kart);
    wallAt = 0.5;
    UpdateFollowCamera(kart, 1 / 64);
    const firstStep = applied().cameraOffset.x;
    assert.ok(firstStep > normal().x && firstStep < 0, "moved in, but not all the way in one tick");
    for (let i = 0; i < 64; i++) UpdateFollowCamera(kart, 1 / 64);
    const pulledIn = applied().cameraOffset.x;
    assert.ok(pulledIn > firstStep, "kept moving in");

    wallAt = undefined;
    UpdateFollowCamera(kart, 1 / 64);
    assert.ok(applied().cameraOffset.x < pulledIn && applied().cameraOffset.x > normal().x, "eases back out, not at once");
    for (let i = 0; i < 64 * 4; i++) UpdateFollowCamera(kart, 1 / 64);
    assert.deepEqual(applied().cameraOffset, normal(), "ends at the normal offset");
});

test("while breaking the follow camera leaves the camera alone (the break camera owns it)", () => {
    ApplyCameraFollow(kart);
    kart.pawn.camera.config = undefined;
    kart.breaking = true;
    wallAt = 0.5;
    UpdateFollowCamera(kart, 1 / 64);
    assert.equal(applied(), undefined);
});

test("the break camera still uses the engine's clipping, with CAMERA_OFFSET_RETURN_STRENGTH", () => {
    SetFollowOffset(kart, { x: -80, y: 0, z: 30 }, true);
    assert.equal(applied().clipCameraOffset, true);
    assert.equal(applied().cameraOffsetReturnStrength, CAMERA_OFFSET_RETURN_STRENGTH);
});
