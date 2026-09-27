// Every way a melon gets teleported or spawned must also turn the player's
// view to the destination's facing — steering follows the view (see
// UpdateKart), so a player whose view stayed put kept driving the old way.
// These run the real engine-side functions against the fake engine in
// helpers/cs-script-mock.mjs and check where the pawn ends up looking.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { karts } = await import("../src/melon_drive/kart-registry.js");
const { SetUpPlayerKart } = await import("../src/melon_drive/kart-spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/spawn-points.js");
const { RespawnKartAtCheckpoint, TeleportKartTo, BreakMelon, HandleMelonLost } = await import("../src/melon_drive/physics/index.js");
const { ReturnAllToHub, SendKartToTutorial, BeginHeat } = await import("../src/melon_drive/race-flow.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, INTRO_SPAWN_NAME } = await import("../src/melon_drive/constants/index.js");

const INTRO_YAW = 30;
const HUB_YAW = 200;
const TRACK_START_YAW = 270;
const TELEPORT_DEST_YAW = 120;
const START_PITCH = 15;

/** Settles Instance.Delay(...).then(...) chains (the fake Delay resolves immediately). */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** @type {CSPlayerPawn} */
let pawn;
/** @type {any} */
let kart;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 }, angles: { pitch: 0, yaw: INTRO_YAW, roll: 0 } }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 }, angles: { pitch: 0, yaw: HUB_YAW, roll: 0 } }));
    world.add(new Entity({ name: "track_start_1_cp2_laps3", className: "trigger_multiple", origin: { x: 2400, y: 1088, z: 128 }, angles: { pitch: 0, yaw: TRACK_START_YAW, roll: 0 } }));
    world.add(new Entity({ name: "tp_dest", className: "info_target", origin: { x: 0, y: 0, z: 0 }, angles: { pitch: 0, yaw: TELEPORT_DEST_YAW, roll: 0 } }));
    pawn = world.add(new CSPlayerPawn({ slot: 0, eyeAngles: { pitch: START_PITCH, yaw: 0, roll: 0 } }));
    kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    assert.ok(kart, "setup: kart created");
});

/** Turns the player to look somewhere else, so each test proves the code turned them back. */
function LookAway() {
    pawn.eyeAngles = { pitch: START_PITCH, yaw: 5, roll: 0 };
}

/** @param {number} yaw */
function AssertFacing(yaw) {
    assert.equal(pawn.eyeAngles.yaw, yaw, "view yaw turned to the destination's facing");
    assert.equal(pawn.eyeAngles.pitch, START_PITCH, "view pitch kept");
}

test("first spawn (intro) faces intro_spawn's direction", () => {
    AssertFacing(INTRO_YAW);
});

test("respawn at the last checkpoint faces the checkpoint's direction", () => {
    kart.checkpointAngles = { pitch: 0, yaw: 75, roll: 0 };
    LookAway();
    RespawnKartAtCheckpoint(kart);
    AssertFacing(75);
});

test("a break respawns facing the checkpoint's direction", async () => {
    kart.checkpointAngles = { pitch: 0, yaw: 160, roll: 0 };
    LookAway();
    BreakMelon(0, kart, { x: 1, y: 0, z: 0 }, 1000);
    await flush();
    AssertFacing(160);
});

test("a destroyed melon respawns facing the checkpoint's direction", async () => {
    kart.checkpointAngles = { pitch: 0, yaw: 300, roll: 0 };
    kart.melon.valid = false;
    LookAway();
    HandleMelonLost(0, kart);
    await flush();
    assert.ok(kart.melon.IsValid(), "a new melon was spawned");
    AssertFacing(300);
});

test("TeleportKartTo faces the given direction", () => {
    LookAway();
    TeleportKartTo(kart, { x: 1, y: 2, z: 3 }, { pitch: 0, yaw: 45, roll: 0 }, { x: 0, y: 0, z: 0 });
    AssertFacing(45);
});

test("returning to the hub faces hub_spawn's direction", () => {
    LookAway();
    ReturnAllToHub([kart]);
    AssertFacing(HUB_YAW);
});

test("going to the tutorial faces intro_spawn's direction", () => {
    LookAway();
    SendKartToTutorial(kart);
    AssertFacing(INTRO_YAW);
});

test("a heat start faces the track start trigger's direction", () => {
    kart.racing = true;
    LookAway();
    BeginHeat(1);
    AssertFacing(TRACK_START_YAW);
    ReturnAllToHub([kart]); // leave the heat so race-flow state doesn't leak into other tests
});

test("a teleporter (melon_teleport) faces its destination's direction", async () => {
    await import("../src/melon_drive/index.js"); // registers the script inputs
    const registration = (world.handlers.OnScriptInput ?? []).find(([name]) => name === "melon_teleport");
    assert.ok(registration, "melon_teleport input is registered");
    const trigger = world.add(new Entity({ name: "teleport_to_tp_dest", className: "trigger_multiple" }));
    LookAway();
    registration[1]({ caller: trigger, activator: kart.melon });
    AssertFacing(TELEPORT_DEST_YAW);
});
