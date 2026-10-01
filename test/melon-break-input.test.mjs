// The melon_break script input (kill trigger): breaks the touching melon on
// the spot, whatever its health, and respawns it at its checkpoint like any
// other break — but not a melon that's already broken or race-locked. Runs
// the real engine-side handler against the fake engine in
// helpers/cs-script-mock.mjs.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { karts } = await import("../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/kart/spawn-points.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, INTRO_SPAWN_NAME, MELON_MAX_HEALTH } = await import("../src/melon_drive/constants/index.js");
await import("../src/melon_drive/index.js"); // registers the script inputs

/** Settles Instance.Delay(...).then(...) chains (the fake Delay resolves immediately). */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

/** @type {any} */
let kart;
/** @type {Entity} */
let trigger;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    const pawn = world.add(new CSPlayerPawn({ slot: 0 }));
    kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    assert.ok(kart, "setup: kart created");
    trigger = world.add(new Entity({ name: "kill_lava", className: "trigger_multiple" }));
});

test("melon_break breaks a healthy melon and respawns it at full health", async () => {
    assert.equal(kart.health, MELON_MAX_HEALTH);
    ScriptInput("melon_break")({ caller: trigger, activator: kart.melon });
    assert.equal(kart.breaking, true, "broken");
    assert.equal(kart.health, 0);
    await flush();
    assert.equal(kart.breaking, false, "respawned");
    assert.equal(kart.health, MELON_MAX_HEALTH);
});

test("melon_break ignores a race-locked melon", () => {
    kart.locked = true;
    ScriptInput("melon_break")({ caller: trigger, activator: kart.melon });
    assert.ok(!kart.breaking);
    assert.equal(kart.health, MELON_MAX_HEALTH);
});

test("melon_break ignores anything that isn't a tracked melon", () => {
    ScriptInput("melon_break")({ caller: trigger, activator: new Entity({ className: "prop_physics" }) });
    assert.ok(!kart.breaking);
});
