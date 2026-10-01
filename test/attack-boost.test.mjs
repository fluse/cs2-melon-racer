// Attack boost: the rule (movement/attack-boost/logic.js) and the real UpdateKart
// applying it against the fake engine — faster than MAX_SPEED, paid for
// with health.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { AttackBoost } = await import("../src/melon_drive/movement/attack-boost/logic.js");
const { karts } = await import("../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../src/melon_drive/movement/index.js");
const C = await import("../src/melon_drive/constants/index.js");

const DT = 1 / 64;

test("no boost without attack held — health untouched", () => {
    assert.deepEqual(AttackBoost(C.MELON_MAX_HEALTH, false, DT), { boosting: false, health: C.MELON_MAX_HEALTH });
});

test("boosting drains ATTACK_BOOST_HEALTH_PER_SECOND", () => {
    const { boosting, health } = AttackBoost(C.MELON_MAX_HEALTH, true, 1);
    assert.equal(boosting, true);
    assert.equal(health, C.MELON_MAX_HEALTH - C.ATTACK_BOOST_HEALTH_PER_SECOND);
});

test("no floor: the drain goes all the way down, and there's no boost left at 0", () => {
    assert.ok(AttackBoost(1, true, 1).health < 0);
    assert.deepEqual(AttackBoost(0, true, DT), { boosting: false, health: 0 });
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
        const v = kart.melon.GetAbsVelocity();
        kart.lastVelocity = { ...v };
        UpdateKart(0, kart, DT);
    }
    return kart.melon.GetAbsVelocity().x;
}

test("holding forward alone tops out at MAX_SPEED and costs nothing", () => {
    kart.melon.velocity = { x: C.MAX_SPEED, y: 0, z: 0 };
    const speed = Drive(64, ["FORWARD"]);
    assert.ok(Math.abs(speed - C.MAX_SPEED) < 1e-6, `speed ${speed}`);
    assert.equal(kart.health, C.MELON_MAX_HEALTH);
});

test("forward + attack goes past MAX_SPEED up to ATTACK_BOOST_MAX_SPEED, draining health", () => {
    kart.melon.velocity = { x: C.MAX_SPEED, y: 0, z: 0 };
    const speed = Drive(64 * 3, ["FORWARD", "ATTACK"]);
    assert.ok(speed > C.MAX_SPEED, `speed ${speed}`);
    assert.ok(speed <= C.ATTACK_BOOST_MAX_SPEED + 1e-6, `speed ${speed}`);
    assert.ok(Math.abs(kart.health - (C.MELON_MAX_HEALTH - 3 * C.ATTACK_BOOST_HEALTH_PER_SECOND)) < 0.01, `health ${kart.health}`);
});

test("boosting until the health runs out breaks the melon", () => {
    kart.health = C.ATTACK_BOOST_HEALTH_PER_SECOND * 0.5; // half a second of boost left
    kart.melon.velocity = { x: C.MAX_SPEED, y: 0, z: 0 };
    Drive(31, ["FORWARD", "ATTACK"]);
    assert.equal(kart.breaking, false, "still alive just before");
    Drive(2, ["FORWARD", "ATTACK"]);
    assert.equal(kart.breaking, true);
});

/** One tick where physics added `push` u/s along +x on top of last tick's command. */
function PushedTick(buttons, push) {
    pawn.pressed = new Set(buttons);
    world.time += DT;
    const commanded = kart.melon.GetAbsVelocity();
    kart.lastVelocity = { ...commanded };
    kart.melon.velocity = { x: commanded.x + push, y: 0, z: 0 };
    UpdateKart(0, kart, DT);
    return kart.melon.GetAbsVelocity().x;
}

test("an engine push while attack is held (knife swing) adds no speed", () => {
    kart.melon.velocity = { x: 300, y: 0, z: 0 };
    const speed = PushedTick(["ATTACK"], 140);
    assert.ok(speed <= 300 + C.ATTACK_BOOST_ACCEL * DT + 1e-6, `only the boost's own push (${speed})`);
});

test("...nor one arriving just after letting go, but after ATTACK_PUSH_GUARD_SECONDS physics counts again", () => {
    kart.melon.velocity = { x: 300, y: 0, z: 0 };
    const afterBoost = PushedTick(["ATTACK"], 0);
    assert.ok(PushedTick([], 140) <= afterBoost);
    world.time += C.ATTACK_PUSH_GUARD_SECONDS;
    assert.ok(PushedTick([], 140) > afterBoost);
});

test("a melon at rest isn't shoved by a push when attack is pressed", () => {
    kart.melon.velocity = { x: 0, y: 0, z: 0 };
    world.time += DT;
    kart.lastVelocity = undefined;
    UpdateKart(0, kart, DT); // settles: no longer commanded
    assert.equal(kart.settled, true);
    pawn.pressed = new Set(["ATTACK"]);
    world.time += DT;
    kart.melon.velocity = { x: 140, y: 0, z: 0 }; // the swing, while nothing was commanded
    UpdateKart(0, kart, DT);
    assert.ok(kart.melon.GetAbsVelocity().x <= C.ATTACK_BOOST_ACCEL * DT + 1e-6, "only the boost's own push");
});
