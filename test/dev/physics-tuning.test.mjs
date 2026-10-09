// The user menu's developer physics page (dev/physics-tuning.js): the pure
// rules, the layout's segments, the clicks against the fake engine, and the
// factors reaching the real UpdateKart — each only for the clicking player.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";

const logic = await import("../../src/melon_drive/dev/physics-tuning-logic.js");
const { PHYSICS_TUNING_SCALE: SCALE, ScaleSegmentCount } = await import("../../src/melon_drive/dev/tuning-scale-logic.js");
const C = await import("../../src/melon_drive/constants/index.js");
const { KartMaxSpeed } = await import("../../src/melon_drive/movement/momentum/logic.js");
const { karts, SetModeratorSlot } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../../src/melon_drive/movement/index.js");
const { SetUserMenuOpen } = await import("../../src/melon_drive/hud/user-menu.js");
await import("../../src/melon_drive/index.js"); // registers OnCustomHudClicked

const DT = 1 / 64;
const ROW_IDS = { maxSpeed: "maxspeed", accel: "accel", jump: "jump", boost: "boost", gravity: "gravity" };

test("a kart without tuning has every factor at 1; percent / 100 otherwise", () => {
    for (const key of logic.PHYSICS_TUNING_KEYS) {
        assert.equal(logic.PhysicsFactor({}, key), 1, key);
    }
    assert.equal(logic.PhysicsFactor({ physicsTuning: { jump: 150 } }, "jump"), 1.5);
    assert.equal(logic.PhysicsFactor({ physicsTuning: { jump: 150 } }, "gravity"), 1);
});

test("gravity: the script adds only the difference to the engine's pull", () => {
    assert.equal(logic.ExtraGravityDelta(1, C.GRAVITY, DT), -0);
    assert.equal(logic.ExtraGravityDelta(2, C.GRAVITY, DT), -C.GRAVITY * DT);
    assert.equal(logic.ExtraGravityDelta(0, C.GRAVITY, DT), C.GRAVITY * DT, "0 % cancels it");
});

test("boost: a faster melon still boosts above its own top speed", () => {
    const headroom = C.ATTACK_BOOST_MAX_SPEED - C.MAX_SPEED;
    assert.equal(logic.BoostMaxSpeed(C.MAX_SPEED, headroom, 1), C.ATTACK_BOOST_MAX_SPEED);
    assert.equal(logic.BoostMaxSpeed(2 * C.MAX_SPEED, headroom, 1), 2 * C.MAX_SPEED + headroom);
    assert.equal(logic.BoostMaxSpeed(C.MAX_SPEED, headroom, 0), C.MAX_SPEED);
});

test("max speed scales the kart's top speed, momentum steps on top", () => {
    assert.equal(KartMaxSpeed({}), C.MAX_SPEED);
    assert.equal(KartMaxSpeed({ physicsTuning: { maxSpeed: 200 } }), 2 * C.MAX_SPEED);
    const momentum = { steps: 1, armed: false };
    assert.equal(KartMaxSpeed({ momentum, physicsTuning: { maxSpeed: 200 } }), 2 * C.MAX_SPEED * (1 + C.MOMENTUM_STEP));
});

test("speedometer.xml has one segment per scale value for every row", () => {
    const layout = readFileSync(new URL("../../panorama/layout/custom_game/speedometer.xml", import.meta.url), "utf8");
    const count = ScaleSegmentCount(SCALE);
    for (const id of Object.values(ROW_IDS)) {
        const indices = [...layout.matchAll(new RegExp(`id="phytune_${id}_seg_(\\d+)"`, "g"))].map((m) => Number(m[1]));
        assert.deepEqual(indices, [...Array(count).keys()], id);
    }
    assert.deepEqual(Object.keys(ROW_IDS), logic.PHYSICS_TUNING_KEYS, "a row per key");
});

/** @type {FakeHud} */
let hud;
/** @type {any} */
let a;
/** @type {any} */
let b;

/** @param {number} slot @param {string} buttonId */
function Click(slot, buttonId) {
    const [[onClick]] = world.handlers.OnCustomHudClicked;
    onClick({ layout: hud, buttonId, player: { GetPlayerSlot: () => slot } });
}

beforeEach(() => {
    hud?.Remove();
    world.reset();
    karts.clear();
    SetModeratorSlot(undefined);
    world.time = 100;
    hud = world.add(new FakeHud(C.SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    a = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetHubSpawnPoint());
    b = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 1 })), GetHubSpawnPoint());
});

test("the physics button swaps the menu's columns for the physics page; Back and reopening swap them back", () => {
    SetUserMenuOpen(0, a, true);
    Click(0, "usermenu_physics_button");
    assert.ok(hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(!hud.Has(0, "usermenu_physics_page", "Hidden"));
    assert.equal(hud.Variable(0, "usermenu_physics_page", "phytune_maxspeed"), `100 % · ${C.MAX_SPEED} u/s`);
    Click(0, "phytune_back_button");
    assert.ok(!hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(hud.Has(0, "usermenu_physics_page", "Hidden"));

    Click(0, "usermenu_physics_button");
    SetUserMenuOpen(0, a, false);
    SetUserMenuOpen(0, a, true);
    assert.ok(!hud.Has(0, "usermenu_main_page", "Hidden"), "reopens on its columns");
    assert.ok(hud.Has(0, "usermenu_physics_page", "Hidden"));
});

test("− / + and the scale set only the clicking player's values, within the scale; Reset drops them", () => {
    Click(0, "phytune_jump_plus");
    Click(0, "phytune_jump_plus_fine");
    assert.equal(logic.PhysicsFactor(a, "jump"), (100 + SCALE.step + SCALE.fineStep) / 100);
    assert.equal(logic.PhysicsFactor(b, "jump"), 1);

    Click(0, "phytune_gravity_seg_0");
    Click(0, "phytune_gravity_minus");
    assert.equal(logic.PhysicsFactor(a, "gravity"), SCALE.min / 100, "can't go below the scale");
    assert.ok(hud.Has(0, "phytune_gravity_seg_0", "On"));
    assert.ok(!hud.Has(0, "phytune_gravity_seg_1", "On"));

    const last = ScaleSegmentCount(SCALE) - 1;
    Click(0, `phytune_maxspeed_seg_${last}`);
    Click(0, "phytune_maxspeed_plus");
    assert.equal(logic.PhysicsFactor(a, "maxSpeed"), SCALE.max / 100, "can't go above the scale");

    Click(0, "phytune_reset_button");
    assert.equal(a.physicsTuning, undefined);
    assert.equal(hud.Variable(0, "usermenu_physics_page", "phytune_jump"), `100 % · ${C.JUMP_SPEED} u/s`);
});

/** One tick of UpdateKart: last tick we commanded `commanded`, physics now reports `actual`. */
function Tick(kart, { commanded, actual, pressed = [], justPressed = [] }) {
    world.time += DT;
    kart.lastVelocity = { ...commanded };
    kart.melon.velocity = { ...actual };
    kart.pawn.pressed = new Set(pressed);
    kart.pawn.justPressed = new Set(justPressed);
    UpdateKart(kart.pawn.GetPlayerController().GetPlayerSlot(), kart, DT);
    return kart.melon.GetAbsVelocity();
}

/** A flat floor right under the melon. */
function Floor() {
    world.traceLine = (c) =>
        c.end.z < c.start.z - 1
            ? { didHit: true, startedInSolid: false, fraction: 0.5, end: { ...c.end, z: 0 }, normal: { x: 0, y: 0, z: 1 } }
            : { didHit: false, startedInSolid: false, fraction: 1, end: c.end, normal: { x: 0, y: 0, z: 1 } };
}

const rolling = { commanded: { x: 200, y: 0, z: 0 }, actual: { x: 200, y: 0, z: 0 } };

test("UpdateKart: jump scales the ground jump", () => {
    Floor();
    a.physicsTuning = { jump: 150 };
    assert.equal(Tick(a, { ...rolling, justPressed: ["JUMP"] }).z, C.JUMP_SPEED * 1.5);
});

test("UpdateKart: gravity adds its difference every tick, in the air", () => {
    world.traceLine = (c) => ({ didHit: false, startedInSolid: false, fraction: 1, end: c.end, normal: { x: 0, y: 0, z: 1 } });
    a.physicsTuning = { gravity: 200 };
    const falling = { commanded: { x: 200, y: 0, z: -100 }, actual: { x: 200, y: 0, z: -100 - C.GRAVITY * DT } };
    assert.equal(Tick(a, falling).z, -100 - 2 * C.GRAVITY * DT);
    a.physicsTuning = { gravity: 0 };
    assert.equal(Tick(a, falling).z, -100, "0 %: the engine's pull is cancelled");
});

test("UpdateKart: acceleration and max speed scale driving", () => {
    Floor();
    a.physicsTuning = { accel: 200 };
    const v = Tick(a, { ...rolling, pressed: ["FORWARD"] });
    const plain = Tick(b, { ...rolling, pressed: ["FORWARD"] });
    assert.ok(Math.hypot(v.x, v.y) > Math.hypot(plain.x, plain.y), "accelerates harder");

    a.physicsTuning = { maxSpeed: 50 };
    const fast = { commanded: { x: C.MAX_SPEED, y: 0, z: 0 }, actual: { x: C.MAX_SPEED, y: 0, z: 0 } };
    a.speedCap = undefined;
    const capped = Tick(a, { ...fast, pressed: ["FORWARD"] });
    assert.ok(Math.hypot(capped.x, capped.y) <= C.MAX_SPEED * 0.5 + 1e-6, "held to half the top speed");
});
