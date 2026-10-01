// Momentum: the rule (movement/momentum/logic.js) and the real UpdateKart applying it
// against the fake engine — reaching the top speed again and again in quick
// succession raises it, dropping below MOMENTUM_MIN_SPEED resets it, and the
// attack boost doesn't count.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { NewMomentum, MomentumMaxSpeed, UpdateMomentum } = await import("../../src/melon_drive/movement/momentum/logic.js");
const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../../src/melon_drive/movement/index.js");
const C = await import("../../src/melon_drive/constants/index.js");

const DT = 1 / 64;
const dipped = (m) => MomentumMaxSpeed(m) * (1 - C.MOMENTUM_REARM_DIP) - 1;

/** Reaches the top speed at `time`, after a dip. */
function Hit(m, time) {
    m = UpdateMomentum(m, dipped(m), time - DT, false);
    return UpdateMomentum(m, MomentumMaxSpeed(m), time, false);
}

test("no steps: plain MAX_SPEED", () => {
    assert.equal(MomentumMaxSpeed(undefined), C.MAX_SPEED);
    assert.equal(MomentumMaxSpeed(NewMomentum()), C.MAX_SPEED);
});

test("the first hit only starts the chain, the next one within the window adds MOMENTUM_STEP", () => {
    let m = Hit(NewMomentum(), 10);
    assert.equal(m.steps, 0);
    m = Hit(m, 10 + C.MOMENTUM_HIT_WINDOW);
    assert.equal(m.steps, 1);
    assert.ok(Math.abs(MomentumMaxSpeed(m) - C.MAX_SPEED * (1 + C.MOMENTUM_STEP)) < 1e-9);
});

test("a hit after a longer gap adds nothing but restarts the chain", () => {
    let m = Hit(Hit(NewMomentum(), 10), 11);
    m = Hit(m, 11 + C.MOMENTUM_HIT_WINDOW + 0.1);
    assert.equal(m.steps, 1);
    m = Hit(m, 11 + C.MOMENTUM_HIT_WINDOW + 0.5);
    assert.equal(m.steps, 2);
});

test("just holding the top speed doesn't stack — it has to dip first", () => {
    let m = Hit(NewMomentum(), 10);
    for (let t = 10; t < 11; t += DT) {
        m = UpdateMomentum(m, MomentumMaxSpeed(m), t, false);
    }
    assert.equal(m.steps, 0);
});

test("steps stop at MOMENTUM_MAX_STEPS", () => {
    let m = NewMomentum();
    for (let i = 0; i <= C.MOMENTUM_MAX_STEPS + 3; i++) {
        m = Hit(m, 10 + i * 0.5);
    }
    assert.equal(m.steps, C.MOMENTUM_MAX_STEPS);
});

test("dropping below MOMENTUM_MIN_SPEED ends the run", () => {
    let m = Hit(Hit(Hit(NewMomentum(), 10), 11), 12);
    assert.equal(m.steps, 2);
    m = UpdateMomentum(m, C.MOMENTUM_MIN_SPEED + 1, 12.5, false);
    assert.equal(m.steps, 2, "still above it: kept");
    m = UpdateMomentum(m, C.MOMENTUM_MIN_SPEED - 1, 13, false);
    assert.equal(m.steps, 0);
    assert.ok(Math.abs(C.MOMENTUM_MIN_SPEED * C.UNITS_TO_KMH - C.MOMENTUM_MIN_SPEED_KMH) < 1e-9);
});

test("boosted: reaching the top speed doesn't count, and after the boost it needs a dip first", () => {
    let m = Hit(NewMomentum(), 10);
    m = UpdateMomentum(m, dipped(m), 10.5, false);
    m = UpdateMomentum(m, C.ATTACK_BOOST_MAX_SPEED, 11, true);
    m = UpdateMomentum(m, MomentumMaxSpeed(m), 11.1, false);
    assert.equal(m.steps, 0);
    assert.equal(Hit(m, 11.5).steps, 1, "a real dip and recovery counts again");
});

/** @type {CSPlayerPawn} */
let pawn;
/** @type {any} */
let kart;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.time = 100;
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 30 } }));
    pawn = world.add(new CSPlayerPawn({ slot: 0 }));
    kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
});

/** Drives `ticks` ticks along +x (look yaw 0), physics following every command exactly. */
function Drive(ticks, buttons) {
    pawn.pressed = new Set(buttons);
    for (let i = 0; i < ticks; i++) {
        world.time += DT;
        kart.lastVelocity = { ...kart.melon.GetAbsVelocity() };
        UpdateKart(0, kart, DT);
    }
    return kart.melon.GetAbsVelocity().x;
}

/** Coasts until the melon is `MOMENTUM_REARM_DIP` below its top speed, then accelerates back to it. */
function DipAndRecover() {
    const target = MomentumMaxSpeed(kart.momentum) * (1 - C.MOMENTUM_REARM_DIP) - 1;
    while (kart.melon.GetAbsVelocity().x > target) {
        Drive(1, []);
    }
    for (let i = 0; i < 64 && kart.melon.GetAbsVelocity().x < MomentumMaxSpeed(kart.momentum) - 0.01; i++) {
        Drive(1, ["FORWARD"]);
    }
}

test("UpdateKart: dipping and recovering quickly raises the top speed the melon actually drives at", () => {
    kart.melon.velocity = { x: C.MAX_SPEED, y: 0, z: 0 };
    Drive(4, ["FORWARD"]);
    DipAndRecover();
    DipAndRecover();
    assert.equal(kart.momentum.steps, 2);
    const speed = Drive(64, ["FORWARD"]);
    assert.ok(Math.abs(speed - C.MAX_SPEED * (1 + 2 * C.MOMENTUM_STEP)) < 1e-6, `speed ${speed}`);
});

test("UpdateKart: the attack boost earns no momentum", () => {
    kart.melon.velocity = { x: C.MAX_SPEED, y: 0, z: 0 };
    Drive(64, ["FORWARD", "ATTACK"]);
    Drive(64 * 3, ["FORWARD"]); // cap decays back down
    assert.equal(kart.momentum.steps, 0);
});

test("UpdateKart: a break ends the run", () => {
    kart.momentum = { steps: 3, armed: false, lastHitTime: world.time };
    kart.breaking = true;
    Drive(1, []);
    assert.equal(kart.momentum, undefined);
});
