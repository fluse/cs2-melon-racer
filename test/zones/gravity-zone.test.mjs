// Gravity zones (zones/gravity/): the pure rules, then the real script inputs
// and UpdateKart against the fake engine — inside, the melon is pulled down
// with the zone's share of GRAVITY and keeps more of its rolling speed.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { GravityZoneFromName, KeepRollingSpeed } from "../../src/melon_drive/zones/gravity/logic.js";
import { IsSupported } from "../../src/melon_drive/movement/contact/logic.js";
import {
    GRAVITY,
    FREE_FALL_FRACTION,
    GRAVITY_ZONE_PERCENT,
    GRAVITY_ZONE_MAX_ROLL_DECEL,
    COAST_FRICTION,
    MELON_TEMPLATE_NAME,
    HUB_SPAWN_NAME,
} from "../../src/melon_drive/constants/index.js";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../../src/melon_drive/movement/index.js");
await import("../../src/melon_drive/index.js"); // registers the script inputs

const DT = 1 / 64;

test("a gravity zone's factors come from its name, the roll following the gravity unless given", () => {
    assert.deepEqual(GravityZoneFromName("gravity_zone"), { gravity: GRAVITY_ZONE_PERCENT / 100, roll: GRAVITY_ZONE_PERCENT / 100 });
    assert.deepEqual(GravityZoneFromName("some_trigger"), { gravity: GRAVITY_ZONE_PERCENT / 100, roll: GRAVITY_ZONE_PERCENT / 100 });
    assert.deepEqual(GravityZoneFromName("gravity_zone_30"), { gravity: 0.3, roll: 0.3 });
    assert.deepEqual(GravityZoneFromName("gravity_zone_100_roll20"), { gravity: 1, roll: 0.2 });
    assert.deepEqual(GravityZoneFromName("gravity_zone_150_roll0"), { gravity: 1.5, roll: 0 });
});

test("KeepRollingSpeed gives back the share of the rolling loss the zone takes away, in the direction physics left", () => {
    const last = { x: 400, y: 0 };
    const current = { x: 0, y: 390 }; // lost 10, turned
    for (const [roll, y] of [[0, 400], [0.5, 395], [1, 390], [2, 380]]) {
        const kept = KeepRollingSpeed(current, last, roll, DT);
        assert.equal(kept.x, 0, `roll ${roll}`);
        assert.ok(Math.abs(kept.y - y) < 1e-9, `roll ${roll}: ${kept.y}`);
    }
});

test("KeepRollingSpeed leaves hits and speed gains alone", () => {
    const last = { x: 400, y: 0 };
    const hit = { x: 400 - GRAVITY_ZONE_MAX_ROLL_DECEL * DT - 1, y: 0 };
    assert.deepEqual(KeepRollingSpeed(hit, last, 0, DT), hit);
    assert.deepEqual(KeepRollingSpeed({ x: 420, y: 0 }, last, 0, DT), { x: 420, y: 0 });
    assert.deepEqual(KeepRollingSpeed({ x: 0, y: 0 }, last, 0, DT), { x: 0, y: 0 });
});

test("with less gravity a floor still counts as support, a fall still doesn't", () => {
    for (const factor of [1, 0.5, 0.25]) {
        // Resting: the script commanded (1 - factor) * GRAVITY * dt up, the floor left 0.
        const resting = -(1 - factor) * GRAVITY;
        assert.equal(IsSupported(resting, factor), true, `resting at ${factor}`);
        assert.equal(IsSupported(-GRAVITY, factor), false, `falling at ${factor}`);
    }
    assert.equal(IsSupported(-FREE_FALL_FRACTION * GRAVITY), false, "unchanged without a factor");
});

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

/** @type {any} */
let kart;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetHubSpawnPoint());
});

/** One coasting tick (no input) from `velocity`, and what the script commanded. */
function CoastTick(velocity) {
    kart.lastVelocity = { ...velocity };
    kart.melon.velocity = { ...velocity };
    UpdateKart(0, kart, DT);
    return kart.lastVelocity;
}

test("inside a gravity zone the melon is pulled with its share of gravity and coasts further; leaving, it's normal again", () => {
    const zone = world.add(new Entity({ name: "gravity_zone_25_roll0", className: "trigger_multiple" }));
    const normal = CoastTick({ x: 400, y: 0, z: 0 });
    assert.ok(Math.abs(normal.x - (400 - COAST_FRICTION * DT)) < 1e-6, `normal coast friction (${normal.x})`);
    assert.equal(normal.z, 0, "no extra pull outside");

    ScriptInput("gravity_enter")({ caller: zone, activator: kart.melon });
    const inside = CoastTick({ x: 400, y: 0, z: 0 });
    assert.equal(inside.x, 400, "roll0: no coast friction");
    assert.ok(Math.abs(inside.z - 0.75 * GRAVITY * DT) < 1e-6, `three quarters of the pull cancelled (${inside.z})`);

    ScriptInput("gravity_leave")({ caller: zone, activator: kart.melon });
    const after = CoastTick({ x: 400, y: 0, z: 0 });
    assert.equal(after.z, 0);
    assert.ok(after.x < 400);
});
