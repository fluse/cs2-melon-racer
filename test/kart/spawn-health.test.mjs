// Every spot a melon is sent to on purpose — the user menu's hub and
// tutorial buttons, hub_teleport, a heat start or end, a checkpoint respawn —
// has it arrive with full health. Only a generic teleporter (melon_teleport)
// keeps the damage. Runs the real engine-side functions against the fake
// engine in helpers/cs-script-mock.mjs.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { RespawnKartAtCheckpoint, TeleportKartTo } = await import("../../src/melon_drive/kart/index.js");
const { ReturnAllToHub, SendKartToTutorial, BeginHeat } = await import("../../src/melon_drive/race/heat/race-flow.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, INTRO_SPAWN_NAME, MELON_MAX_HEALTH } = await import("../../src/melon_drive/constants/index.js");

/** @type {any} */
let kart;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    world.add(new Entity({ name: "start_1_laps3", className: "trigger_multiple", origin: { x: 2400, y: 1088, z: 128 } }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetIntroSpawnPoint());
    assert.equal(kart.health, MELON_MAX_HEALTH, "setup: a new melon is whole");
    kart.health = 12;
});

test("hub (user menu button, hub_teleport, heat over): full health", () => {
    ReturnAllToHub([kart]);
    assert.equal(kart.health, MELON_MAX_HEALTH);
});

test("tutorial (user menu button): full health", () => {
    SendKartToTutorial(kart);
    assert.equal(kart.health, MELON_MAX_HEALTH);
});

test("heat start: full health", () => {
    kart.racing = true;
    BeginHeat(1);
    assert.equal(kart.health, MELON_MAX_HEALTH);
    ReturnAllToHub([kart]); // leave the heat so race-flow state doesn't leak into other tests
});

test("checkpoint respawn (user menu button, after a break): full health", () => {
    RespawnKartAtCheckpoint(kart);
    assert.equal(kart.health, MELON_MAX_HEALTH);
});

test("a teleporter only moves the melon — the damage stays", () => {
    TeleportKartTo(kart, { x: 0, y: 0, z: 0 }, { pitch: 0, yaw: 0, roll: 0 }, { x: 0, y: 0, z: 0 });
    assert.equal(kart.health, 12);
});
