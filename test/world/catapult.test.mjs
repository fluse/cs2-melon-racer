// Catapults: the pure rules (world/catapult/logic.js) and a melon getting
// in, held in the bucket and thrown, against the fake engine
// (world/catapult/catapult.js, from UpdateKart).
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const {
    IsCatapultBaseModel, IsCatapultArmModel, CatapultLaunchFromName, ArmAngle, NextPhase, ArmInputs,
    RELEASE_SECONDS, SeatOffset, ToWorld, ToLocal, IsInBucket, LaunchVelocity,
} = await import("../../src/melon_drive/world/catapult/logic.js");
const { catapults, UpdateCatapults, ResetCatapults } = await import("../../src/melon_drive/world/catapult/catapult.js");
const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../../src/melon_drive/movement/index.js");
const C = await import("../../src/melon_drive/constants/index.js");

const DT = 1 / 64;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("the models are told apart, whatever their spelling", () => {
    assert.equal(IsCatapultBaseModel(`${C.CATAPULT_BASE_MODEL.toUpperCase()}_c`), true);
    assert.equal(IsCatapultArmModel(C.CATAPULT_ARM_MODEL.replace(/\//g, "\\")), true);
    assert.equal(IsCatapultBaseModel(C.CATAPULT_ARM_MODEL), false);
    assert.equal(IsCatapultArmModel(C.CATAPULT_BASE_MODEL), false);
});

test("the name sets the throw, else the defaults", () => {
    assert.deepEqual(CatapultLaunchFromName("catapult_1500_400"), { forward: 1500, up: 400 });
    assert.deepEqual(CatapultLaunchFromName(""), { forward: C.CATAPULT_LAUNCH_FORWARD, up: C.CATAPULT_LAUNCH_UP });
    assert.deepEqual(CatapultLaunchFromName("catapult_hub"), { forward: C.CATAPULT_LAUNCH_FORWARD, up: C.CATAPULT_LAUNCH_UP });
});

test("the arm swings from rest to the crossbar, passing the release angle at RELEASE_SECONDS, and winds back", () => {
    assert.equal(ArmAngle("loaded", 5), C.CATAPULT_REST_ANGLE);
    assert.equal(ArmAngle("firing", 0), C.CATAPULT_REST_ANGLE);
    assert.ok(close(ArmAngle("firing", RELEASE_SECONDS), C.CATAPULT_RELEASE_ANGLE));
    assert.equal(ArmAngle("firing", C.CATAPULT_FIRE_SECONDS), C.CATAPULT_FIRE_ANGLE);
    assert.ok(ArmAngle("firing", C.CATAPULT_FIRE_SECONDS / 4) - C.CATAPULT_REST_ANGLE < (C.CATAPULT_FIRE_ANGLE - C.CATAPULT_REST_ANGLE) / 4, "speeding up");
    assert.equal(ArmAngle("fired", 0), C.CATAPULT_FIRE_ANGLE);
    assert.equal(ArmAngle("reloading", C.CATAPULT_RELOAD_SECONDS), C.CATAPULT_REST_ANGLE);
});

test("firing runs on by the clock: fired, reloading, ready", () => {
    assert.deepEqual(NextPhase("firing", 0.1), { phase: "firing", t: 0.1 });
    assert.equal(NextPhase("firing", C.CATAPULT_FIRE_SECONDS).phase, "fired");
    assert.equal(NextPhase("firing", C.CATAPULT_FIRE_SECONDS + C.CATAPULT_FIRED_SECONDS + 1e-9).phase, "reloading");
    assert.equal(NextPhase("firing", C.CATAPULT_FIRE_SECONDS + C.CATAPULT_FIRED_SECONDS + C.CATAPULT_RELOAD_SECONDS + 1e-9).phase, "ready");
    assert.deepEqual(NextPhase("loaded", 99), { phase: "loaded", t: 99 });
});

test("the arm shows the throw and the wind-down; paired, it rests", () => {
    assert.deepEqual(ArmInputs("loaded", "firing"), [["SetAnimationNotLooping", "fire"], ["SetIdleAnimationLooping", "fired"]]);
    assert.deepEqual(ArmInputs("fired", "reloading"), [["SetAnimationNotLooping", "reload"], ["SetIdleAnimationLooping", "idle"]]);
    assert.deepEqual(ArmInputs(undefined, "ready"), [["SetAnimationLooping", "idle"], ["SetIdleAnimationLooping", "idle"]]);
    assert.deepEqual(ArmInputs("firing", "fired"), []);
});

test("the seat follows the arm: behind and low at rest, up over the pivot at the crossbar", () => {
    const rest = SeatOffset(C.CATAPULT_REST_ANGLE), up = SeatOffset(C.CATAPULT_FIRE_ANGLE);
    assert.ok(rest.x < C.CATAPULT_PIVOT.x - C.CATAPULT_ARM_LENGTH / 2);
    assert.ok(up.z > rest.z + C.CATAPULT_ARM_LENGTH / 2 && Math.abs(up.x - C.CATAPULT_PIVOT.x) < C.CATAPULT_ARM_LENGTH / 2);
    const turned = ToWorld({ x: 100, y: 0, z: 0 }, { pitch: 0, yaw: 90, roll: 0 }, { x: 10, y: 0, z: 5 });
    assert.ok(close(turned.x, 100) && close(turned.y, 10) && close(turned.z, 5), "turned with the base");
});

test("only inside the bucket counts as getting in — not behind it, below it or over it", () => {
    const seat = SeatOffset(C.CATAPULT_REST_ANGLE);
    const At = (dx, dy, dz) => ({ x: seat.x + dx, y: seat.y + dy, z: seat.z + dz });
    assert.equal(IsInBucket(seat), true);
    assert.equal(IsInBucket(At(C.CATAPULT_SEAT_HALF_WIDTH - 1, -(C.CATAPULT_SEAT_HALF_WIDTH - 1), C.CATAPULT_SEAT_ABOVE - 1)), true, "dropping into a corner");
    assert.equal(IsInBucket(At(C.CATAPULT_SEAT_HALF_WIDTH + 2, 0, 0)), false, "in front of it");
    assert.equal(IsInBucket(At(-(C.CATAPULT_SEAT_HALF_WIDTH + 2), 0, -C.CATAPULT_SEAT_BELOW)), false, "behind it, coming over the winch");
    assert.equal(IsInBucket(At(0, 0, -C.CATAPULT_SEAT_BELOW - 2)), false, "under the bucket");
    assert.equal(IsInBucket(At(0, 0, C.CATAPULT_SEAT_ABOVE + 2)), false, "flying over it");
    const origin = { x: 100, y: -50, z: 8 }, angles = { pitch: 5, yaw: 135, roll: -3 };
    const back = ToLocal(origin, angles, ToWorld(origin, angles, { x: 3, y: -4, z: 5 }));
    assert.ok(close(back.x, 3) && close(back.y, -4) && close(back.z, 5), "ToLocal undoes ToWorld");
});

test("the throw goes the way the catapult faces, plus its own motion", () => {
    const v = LaunchVelocity({ pitch: 10, yaw: 90, roll: 0 }, { forward: 1000, up: 600 }, { x: 50, y: 0, z: -20 });
    assert.ok(close(v.x, 50) && close(v.y, 1000) && v.z === 600);
});

// --- Against the fake engine ---

/** @type {any} */ let kart;
/** @type {any} */ let pawn;
/** @type {any} */ let base;
/** @type {any} */ let arm;

beforeEach(() => {
    world.reset();
    karts.clear();
    ResetCatapults();
    world.time = 100;
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 30 } }));
    pawn = world.add(new CSPlayerPawn({ slot: 0 }));
    kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    base = world.add(new Entity({ name: "catapult_1200_500", className: "prop_physics", origin: { x: 500, y: 0, z: 0 }, angles: { pitch: 0, yaw: 90, roll: 0 } }));
    base.SetModel(C.CATAPULT_BASE_MODEL);
    arm = world.add(new Entity({ className: "prop_dynamic", origin: { x: 502, y: 0, z: 0 } }));
    arm.SetModel(C.CATAPULT_ARM_MODEL);
});

/** One tick: the kart, then the world (as in core/think.js). */
function Tick(justPressed = []) {
    pawn.justPressed = new Set(justPressed);
    world.time += DT;
    UpdateKart(0, kart, DT);
    UpdateCatapults(world.time, DT);
    pawn.justPressed = new Set();
}

test("a melon at the seat gets in, is held there, fires on jump and is thrown the way the catapult faces", () => {
    UpdateCatapults(world.time, DT);
    const catapult = catapults.get(base);
    assert.equal(catapult.arm, arm, "the arm is paired with its base");
    assert.deepEqual(arm.GetAbsOrigin(), base.GetAbsOrigin(), "and kept on it");

    const seat = ToWorld(base.GetAbsOrigin(), base.GetAbsAngles(), SeatOffset(C.CATAPULT_REST_ANGLE));
    kart.melon.Teleport({ position: { x: seat.x + 3, y: seat.y, z: seat.z + 4 }, velocity: { x: 0, y: 0, z: -200 } });
    Tick();
    assert.equal(kart.catapult?.base, base, "got in");
    assert.equal(catapult.phase, "loaded");

    Tick(["JUMP"]);
    assert.equal(catapult.phase, "loaded", "the press that jumped it in doesn't fire");
    const held = kart.melon.GetAbsOrigin();
    assert.ok(close(held.x, seat.x, 1e-3) && close(held.z, seat.z, 1e-3), "held at the seat");

    for (let t = 0; t < C.CATAPULT_SEAT_SETTLE_SECONDS; t += DT) Tick();
    world.fired = [];
    Tick(["JUMP"]);
    assert.equal(catapult.phase, "firing");
    assert.ok(world.fired.some(f => f.target === arm && f.input === "SetAnimationNotLooping" && f.value === "fire"), "the arm throws");

    while (kart.catapult) Tick();
    const v = kart.melon.GetAbsVelocity();
    assert.ok(close(v.y, 1200, 1e-6) && close(v.x, 0, 1e-6) && v.z === 500, `thrown along the base's facing (+Y): ${JSON.stringify(v)}`);
    assert.ok(kart.padFlight, "no damage in flight, like a jump pad launch");
    assert.equal(catapult.rider, undefined);

    for (let t = 0; t < C.CATAPULT_FIRE_SECONDS + C.CATAPULT_FIRED_SECONDS + C.CATAPULT_RELOAD_SECONDS + 0.1; t += DT) UpdateCatapults((world.time += DT), DT);
    assert.equal(catapult.phase, "ready", "wound back down, ready for the next");
});

test("a teleport takes the melon out; the bucket is free again", () => {
    UpdateCatapults(world.time, DT);
    const seat = ToWorld(base.GetAbsOrigin(), base.GetAbsAngles(), SeatOffset(C.CATAPULT_REST_ANGLE));
    kart.melon.Teleport({ position: seat });
    Tick();
    assert.equal(catapults.get(base).phase, "loaded");
    kart.catapult = undefined; // what TeleportKartTo/RespawnKartAtCheckpoint do, the melon moved away
    kart.melon.Teleport({ position: { x: 0, y: 0, z: 30 } });
    Tick();
    assert.equal(catapults.get(base).phase, "ready");
    assert.equal(catapults.get(base).rider, undefined);
});
