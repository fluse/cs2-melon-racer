// Water zones: the rule (zones/water/logic.js) and the real water_enter input
// and UpdateKart against the fake engine — landing in water stops the melon,
// and inside, the water's drag isn't read as an impact or a wall hit.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { WaterEntryVelocity } = await import("../../src/melon_drive/zones/water/logic.js");
const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../../src/melon_drive/movement/index.js");
const C = await import("../../src/melon_drive/constants/index.js");
await import("../../src/melon_drive/index.js"); // registers the script inputs

const DT = 1 / 64;

test("entering water keeps WATER_ENTRY_SPEED_KEEP of every axis", () => {
    const v = WaterEntryVelocity({ x: 800, y: -400, z: -1200 });
    assert.deepEqual(v, { x: 800 * C.WATER_ENTRY_SPEED_KEEP, y: -400 * C.WATER_ENTRY_SPEED_KEEP, z: -1200 * C.WATER_ENTRY_SPEED_KEEP });
});

/** @type {CSPlayerPawn} */
let pawn;
/** @type {any} */
let kart;
/** @type {Entity} */
let water;

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

beforeEach(() => {
    world.reset();
    karts.clear();
    world.time = 100;
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 30 } }));
    pawn = world.add(new CSPlayerPawn({ slot: 0 }));
    kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    water = world.add(new Entity({ name: "water_pool", className: "trigger_multiple" }));
});

test("water_enter: the melon loses its speed, spin, boost and momentum at once", () => {
    kart.melon.velocity = { x: 900, y: 100, z: -700 };
    kart.melon.angularVelocity = { x: 300, y: -200, z: 50 };
    kart.speedCap = C.MAX_SPEED * 2;
    kart.momentum = { steps: 3 };
    kart.lastVelocity = { x: 900, y: 100, z: -700 };
    ScriptInput("water_enter")({ caller: water, activator: kart.melon });
    assert.deepEqual(kart.melon.GetAbsVelocity(), WaterEntryVelocity({ x: 900, y: 100, z: -700 }));
    assert.deepEqual(kart.melon.GetAbsAngularVelocity(), WaterEntryVelocity({ x: 300, y: -200, z: 50 }));
    assert.equal(kart.speedCap, undefined);
    assert.equal(kart.momentum, undefined);
    assert.equal(kart.lastVelocity, undefined, "the stop itself is no impact");
});

test("in water a sudden velocity change costs no health; out of it, it does", () => {
    ScriptInput("water_enter")({ caller: water, activator: kart.melon });
    const hit = () => {
        kart.lastVelocity = { x: 0, y: 0, z: -3000 };
        kart.melon.velocity = { x: 0, y: 0, z: 0 };
        world.time += DT;
        UpdateKart(0, kart, DT);
    };
    hit();
    assert.equal(kart.health, C.MELON_MAX_HEALTH, "water drag isn't an impact");
    ScriptInput("water_leave")({ caller: water, activator: kart.melon });
    hit();
    assert.ok(kart.health < C.MELON_MAX_HEALTH, "outside the water it is");
});
