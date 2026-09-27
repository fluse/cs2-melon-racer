// A player who picks a team must end up driving their melon at the intro,
// even if OnPlayerReset didn't set them up (or the engine reset the camera
// afterwards) — EnsurePlayerKarts runs every tick to catch that. And the
// frozen pawn stays where it spawned instead of being parked in the sky.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate, CustomCameraMode } from "./helpers/cs-script-mock.mjs";

const { karts } = await import("../src/melon_drive/kart-registry.js");
const { SetUpPlayerKart, EnsurePlayerKarts, HoldPawn } = await import("../src/melon_drive/kart-spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/spawn-points.js");
const { MELON_TEMPLATE_NAME, INTRO_SPAWN_NAME, PAWN_DRIFT_TOLERANCE } = await import("../src/melon_drive/constants.js");

const INTRO = { x: -2000, y: -900, z: 24 };
const PLAYER_SPAWN = { x: 5000, y: 5000, z: 0 };

/** @param {{ team?: number }} [o] */
function AddPawn({ team = 3 } = {}) {
    const pawn = world.add(new CSPlayerPawn({ slot: 0, team }));
    pawn.origin = { ...PLAYER_SPAWN };
    world.playerPawns.push(pawn);
    return pawn;
}

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: INTRO }));
});

test("a player on a team without a kart gets a melon at the intro and its chase camera", () => {
    const pawn = AddPawn();
    EnsurePlayerKarts();
    const kart = karts.get(0);
    assert.ok(kart, "kart created");
    assert.equal(kart.melon.GetAbsOrigin().x, INTRO.x);
    assert.equal(kart.melon.GetAbsOrigin().y, INTRO.y);
    assert.equal(pawn.camera.mode, CustomCameraMode.FOLLOW_POSITION);
    assert.equal(pawn.camera.config.followEntity, kart.melon);
});

test("spectators, unassigned and dead players get no kart", () => {
    const pawn = AddPawn({ team: 1 });
    EnsurePlayerKarts();
    pawn.team = 0;
    EnsurePlayerKarts();
    pawn.team = 3;
    pawn.alive = false;
    EnsurePlayerKarts();
    assert.equal(karts.size, 0);
});

test("a camera reset after the spawn is re-attached, without a second melon", () => {
    const pawn = AddPawn();
    const kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    const melon = kart.melon;
    pawn.camera.mode = CustomCameraMode.DISABLED;
    EnsurePlayerKarts();
    assert.equal(pawn.camera.mode, CustomCameraMode.FOLLOW_POSITION);
    assert.equal(karts.get(0).melon, melon, "same melon kept");
});

test("a new pawn for the same player takes over the existing kart", () => {
    const oldPawn = AddPawn();
    const kart = SetUpPlayerKart(oldPawn, GetIntroSpawnPoint());
    world.playerPawns = [];
    const newPawn = AddPawn();
    EnsurePlayerKarts();
    assert.equal(karts.get(0), kart);
    assert.equal(kart.pawn, newPawn);
    assert.equal(newPawn.camera.config.followEntity, kart.melon);
});

test("the frozen pawn stays at its own spawn, invisible — not parked above the melon", () => {
    const pawn = AddPawn();
    SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    assert.deepEqual(pawn.GetAbsOrigin(), PLAYER_SPAWN);
    assert.equal(pawn.color.a, 0);
    assert.equal(pawn.moveType, "NOCLIP");
});

test("a pawn flown away by WASD is put back at its spawn", () => {
    const pawn = AddPawn();
    const kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    pawn.origin = { x: PLAYER_SPAWN.x + PAWN_DRIFT_TOLERANCE / 2, y: PLAYER_SPAWN.y, z: PLAYER_SPAWN.z };
    HoldPawn(kart);
    assert.notDeepEqual(pawn.GetAbsOrigin(), PLAYER_SPAWN, "small drift tolerated");
    pawn.origin = { x: PLAYER_SPAWN.x + 500, y: PLAYER_SPAWN.y, z: PLAYER_SPAWN.z };
    HoldPawn(kart);
    assert.deepEqual(pawn.GetAbsOrigin(), PLAYER_SPAWN);
});
