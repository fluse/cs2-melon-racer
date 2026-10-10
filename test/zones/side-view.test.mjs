// Side-view zones (zones/side-view/, camera/side-view/): the pure rules, then
// the real UpdateKart and side camera against the fake engine — only A/D drive
// along the screen axis whatever the mouse does, the melon stays on its
// plane, and the camera swings to the side and back.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { SideViewFromName, SideViewAxes, InitialFacing, SideViewInput, SideViewDepthInput, KeepOnPlane } from "../../src/melon_drive/zones/side-view/logic.js";
import { StepSideViewBlend, SideViewPose, StepSideViewFocus, ChaseCameraPose, BlendPose, IsTeleportJump, CutsSideViewExit } from "../../src/melon_drive/camera/side-view/logic.js";
import {
    SIDE_VIEW_DEFAULT_YAW,
    SIDE_VIEW_DISTANCE,
    SIDE_VIEW_HEIGHT,
    SIDE_VIEW_PLANE_PULL,
    SIDE_VIEW_PLANE_MAX_SPEED,
    SIDE_VIEW_EASE_SECONDS,
    SIDE_VIEW_TELEPORT_DISTANCE,
    SIDE_VIEW_TELEPORT_CUT_SECONDS,
    SIDE_VIEW_CAMERA_SMOOTH_SECONDS,
    MELON_TEMPLATE_NAME,
    HUB_SPAWN_NAME,
} from "../../src/melon_drive/constants/index.js";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../../src/melon_drive/movement/index.js");
const { UpdateSideViewCamera, UpdateFollowCamera } = await import("../../src/melon_drive/camera/index.js");
await import("../../src/melon_drive/index.js"); // registers the script inputs

const close = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 1e-6;

test("side view from the name: yaw, distance and height, defaults for the rest", () => {
    assert.deepEqual(SideViewFromName("side_view_90_400_60"), { yaw: 90, distance: 400, height: 60 });
    assert.deepEqual(SideViewFromName("side_view_-90_250"), { yaw: -90, distance: 250, height: SIDE_VIEW_HEIGHT });
    assert.deepEqual(SideViewFromName("side_view_180"), { yaw: 180, distance: SIDE_VIEW_DISTANCE, height: SIDE_VIEW_HEIGHT });
    assert.deepEqual(SideViewFromName("2d_section"), { yaw: SIDE_VIEW_DEFAULT_YAW, distance: SIDE_VIEW_DISTANCE, height: SIDE_VIEW_HEIGHT });
});

test("looking north (yaw 90), screen right is east", () => {
    const { view, right } = SideViewAxes(90);
    assert.ok(close(view.x, 0) && close(view.y, 1));
    assert.ok(close(right.x, 1) && close(right.y, 0));
});

test("only A/D drive and turn the melon on screen; W/S only drive in a depth zone", () => {
    assert.deepEqual(SideViewInput(1, -1), { axis: 1, facing: 1 });
    assert.deepEqual(SideViewInput(-1, 1), { axis: -1, facing: -1 });
    assert.deepEqual(SideViewInput(0, -1), { axis: 0, facing: -1 });
    assert.equal(SideViewDepthInput(1, false), 0);
    assert.equal(SideViewDepthInput(-1, false), 0);
    assert.equal(SideViewDepthInput(1, true), 1);
    assert.equal(SideViewDepthInput(-1, true), -1);
    assert.equal(InitialFacing({ x: -100, y: 0 }, { x: 1, y: 0 }), -1);
    assert.equal(InitialFacing({ x: 0, y: 0 }, { x: 1, y: 0 }), 1);
});

test("on the plane: no speed towards the camera, a drift is pulled back, capped", () => {
    const view = { x: 0, y: 1 };
    assert.deepEqual(KeepOnPlane({ x: 300, y: 120 }, view, 0), { x: 300, y: 0 });
    assert.ok(close(KeepOnPlane({ x: 300, y: 0 }, view, 10).y, 10 * SIDE_VIEW_PLANE_PULL));
    assert.equal(KeepOnPlane({ x: 0, y: 0 }, view, -1e6).y, -SIDE_VIEW_PLANE_MAX_SPEED);
});

test("side camera: distance back against the view, height up, looking down at the melon", () => {
    const pose = SideViewPose({ x: 0, y: 0, z: 0 }, { yaw: 90, distance: 300, height: 300 });
    assert.ok(close(pose.position.x, 0) && close(pose.position.y, -300) && pose.position.z === 300);
    assert.ok(close(pose.angles.pitch, 45));
    assert.equal(pose.angles.yaw, 90);
});

test("the side camera follows on a damped spring: centered at a steady speed, no dead stop at a wall", () => {
    const dt = 1 / 64;
    const v = { x: 600, y: 0, z: 0 };
    let origin = { x: 0, y: 0, z: 0 };
    let focus = StepSideViewFocus(undefined, origin, v, dt);
    assert.deepEqual(focus.point, origin, "starts right at the melon");
    for (let i = 0; i < 128; i++) {
        origin = { x: origin.x + v.x * dt, y: 0, z: 0 };
        focus = StepSideViewFocus(focus, origin, v, dt);
    }
    assert.ok(Math.abs(focus.point.x - origin.x) < 0.1 * v.x * SIDE_VIEW_CAMERA_SMOOTH_SECONDS, `steady speed: about centered, ${focus.point.x - origin.x} off`);
    // The melon hits a wall and stops dead: the camera glides on and settles back.
    const before = focus.point.x;
    focus = StepSideViewFocus(focus, origin, { x: 0, y: 0, z: 0 }, dt);
    assert.ok(focus.point.x > before, "still moving the tick the melon stopped");
    assert.ok(focus.speed.x < v.x, "but slowing down");
    for (let i = 0; i < 64 * 10 * SIDE_VIEW_CAMERA_SMOOTH_SECONDS; i++) {
        focus = StepSideViewFocus(focus, origin, { x: 0, y: 0, z: 0 }, dt);
    }
    assert.ok(Math.abs(focus.point.x - origin.x) < 1, `settles back on the melon, ${focus.point.x - origin.x} off`);
});

test("the swing to the side eases over SIDE_VIEW_EASE_SECONDS, the yaw the short way round", () => {
    assert.equal(StepSideViewBlend(0, true, SIDE_VIEW_EASE_SECONDS / 2), 0.5);
    assert.equal(StepSideViewBlend(0.5, true, SIDE_VIEW_EASE_SECONDS), 1);
    assert.equal(StepSideViewBlend(1, false, SIDE_VIEW_EASE_SECONDS * 2), 0);
    const from = { position: { x: 0, y: 0, z: 0 }, angles: { pitch: 0, yaw: 170, roll: 0 } };
    const to = { position: { x: 10, y: 0, z: 0 }, angles: { pitch: 0, yaw: -170, roll: 0 } };
    assert.ok(close(BlendPose(from, to, 0.5).angles.yaw, 180));
    assert.ok(close(BlendPose(from, to, 0.5).position.x, 5));
    const chase = ChaseCameraPose({ x: 0, y: 0, z: 20 }, { x: -50, y: 0, z: 0 }, { pitch: 0, yaw: 0 });
    assert.ok(close(chase.position.x, -50) && close(chase.position.z, 20));
});

test("a teleport is a jump beyond SIDE_VIEW_TELEPORT_DISTANCE in one tick; leaving cuts only within SIDE_VIEW_TELEPORT_CUT_SECONDS of it", () => {
    const o = { x: 0, y: 0, z: 0 };
    assert.equal(IsTeleportJump(undefined, o), false);
    assert.equal(IsTeleportJump(o, { x: SIDE_VIEW_TELEPORT_DISTANCE - 1, y: 0, z: 0 }), false);
    assert.equal(IsTeleportJump(o, { x: 0, y: 0, z: SIDE_VIEW_TELEPORT_DISTANCE + 1 }), true);
    assert.equal(CutsSideViewExit(undefined, 10), false);
    assert.equal(CutsSideViewExit(10, 10 + SIDE_VIEW_TELEPORT_CUT_SECONDS), true);
    assert.equal(CutsSideViewExit(10, 10 + SIDE_VIEW_TELEPORT_CUT_SECONDS + 0.01), false);
});

/** @type {CSPlayerPawn} */
let pawn;
/** @type {any} */
let kart;
/** @type {Entity} */
let trigger;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 16 } }));
    pawn = world.add(new CSPlayerPawn({ slot: 0 }));
    kart = SetUpPlayerKart(pawn, GetHubSpawnPoint());
    trigger = world.add(new Entity({ name: "side_view_90_300_0", className: "trigger_multiple" }));
});

/** @param {string} kind */
function ScriptInput(kind) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === kind);
    assert.ok(registration, `${kind} input is registered`);
    return registration[1];
}

/** One tick: the melon rolls on as commanded, `keys` held. @param {string[]} keys */
function Tick(keys) {
    const dt = 1 / 64;
    world.time += dt;
    pawn.pressed = new Set(keys);
    kart.lastVelocity = kart.melon.GetAbsVelocity();
    UpdateKart(0, kart, dt);
    UpdateSideViewCamera(kart, dt);
    UpdateFollowCamera(kart, dt);
}

test("in a side view, D drives screen right (east) whatever way the player looks, and nothing towards the camera", () => {
    pawn.eyeAngles = { pitch: 0, yaw: 90, roll: 0 }; // looking north, into the screen
    kart.melon.velocity = { x: 0, y: 80, z: 0 };
    ScriptInput("side_view_enter")({ caller: trigger, activator: kart.melon });
    for (let i = 0; i < 10; i++) {
        Tick(["RIGHT"]);
    }
    const v = kart.melon.GetAbsVelocity();
    assert.ok(v.x > 0, `drives east, got ${JSON.stringify(v)}`);
    assert.ok(Math.abs(v.y) < 1e-6, `no speed towards the camera, got ${v.y}`);
});

test("in a side view, W and S do nothing", () => {
    kart.melon.velocity = { x: 0, y: 0, z: 0 };
    ScriptInput("side_view_enter")({ caller: trigger, activator: kart.melon });
    for (const key of ["FORWARD", "BACK"]) {
        for (let i = 0; i < 10; i++) {
            Tick([key]);
        }
        const v = kart.melon.GetAbsVelocity();
        assert.ok(Math.hypot(v.x, v.y) < 1e-6, `${key} doesn't move it, got ${JSON.stringify(v)}`);
    }
});

test("in a depth zone, W drives into the screen and S out of it; leaving, the melon is held on its new plane", () => {
    const depth = world.add(new Entity({ name: "side_view_depth_a", className: "trigger_multiple" }));
    kart.melon.origin = { x: 0, y: 0, z: 10 };
    kart.melon.velocity = { x: 0, y: 0, z: 0 };
    ScriptInput("side_view_enter")({ caller: trigger, activator: kart.melon });
    ScriptInput("side_view_depth_enter")({ caller: depth, activator: kart.melon });
    Tick(["FORWARD"]);
    assert.ok(kart.melon.GetAbsVelocity().y > 0, "W: north, away from the camera (looking north)");
    kart.melon.velocity = { x: 0, y: 0, z: 0 };
    Tick(["BACK"]);
    assert.ok(kart.melon.GetAbsVelocity().y < 0, "S: south, towards the camera");

    kart.melon.origin = { x: 0, y: 120, z: 10 }; // moved in depth
    kart.melon.velocity = { x: 0, y: 0, z: 0 };
    Tick([]);
    ScriptInput("side_view_depth_leave")({ caller: depth, activator: kart.melon });
    Tick(["FORWARD"]);
    assert.ok(Math.abs(kart.melon.GetAbsVelocity().y) < 1e-6, `W does nothing again and no pull back to the old plane, got ${kart.melon.GetAbsVelocity().y}`);
});

test("the camera takes over in CONTROLLED mode at the side and hands back to the chase camera after leaving", () => {
    kart.melon.origin = { x: 100, y: 50, z: 10 };
    ScriptInput("side_view_enter")({ caller: trigger, activator: kart.melon });
    for (let i = 0; i < 64 * SIDE_VIEW_EASE_SECONDS + 2; i++) {
        Tick([]);
    }
    const camera = pawn.GetCustomCamera();
    assert.equal(camera.GetMode(), 1); // CONTROLLED
    const melon = kart.melon.GetAbsOrigin();
    assert.ok(close(camera.pose.position.x, melon.x) && close(camera.pose.position.y, melon.y - 300));
    assert.equal(camera.pose.angles.yaw, 90);

    Tick(["LEFT"]); // facing left on screen (west) when leaving
    ScriptInput("side_view_leave")({ caller: trigger, activator: kart.melon });
    for (let i = 0; i < 64 * SIDE_VIEW_EASE_SECONDS + 2; i++) {
        Tick([]);
    }
    assert.equal(camera.GetMode(), 3); // FOLLOW_POSITION
    assert.ok(close(Math.abs(pawn.GetEyeAngles().yaw), 180), `view turned west, got ${pawn.GetEyeAngles().yaw}`);
});

// Regression: teleported out of a side view (here to the hub), the camera
// swung back from a side view of the hub over SIDE_VIEW_EASE_SECONDS and the
// view was turned along the old 2D track instead of the hub's facing.
test("teleported out of a side view, the camera cuts straight back to the chase camera and the view keeps the destination's facing", () => {
    kart.melon.origin = { x: 5000, y: 50, z: 10 };
    ScriptInput("side_view_enter")({ caller: trigger, activator: kart.melon });
    for (let i = 0; i < 64 * SIDE_VIEW_EASE_SECONDS + 2; i++) {
        Tick(["LEFT"]);
    }
    const camera = pawn.GetCustomCamera();
    assert.equal(camera.GetMode(), 1); // CONTROLLED

    ScriptInput("hub_teleport")({ caller: trigger, activator: kart.melon });
    const hubYaw = pawn.GetEyeAngles().yaw;
    Tick([]); // the teleport seen, the zone's OnEndTouch not yet in
    ScriptInput("side_view_leave")({ caller: trigger, activator: kart.melon });
    Tick([]);
    assert.equal(camera.GetMode(), 3); // FOLLOW_POSITION at once, no swing
    assert.equal(kart.sideViewBlend, 0);
    assert.ok(close(pawn.GetEyeAngles().yaw, hubYaw), `view kept the hub's facing ${hubYaw}, got ${pawn.GetEyeAngles().yaw}`);
});
