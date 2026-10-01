// A player who picks a team first sees the Melon Racer logo, then ends up
// driving their melon at the intro — EnsurePlayerKarts runs every tick for
// that, and also re-attaches a camera the engine reset. The frozen pawn
// stays where it spawned instead of being parked in the sky.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate, CustomCameraMode } from "./helpers/cs-script-mock.mjs";

const { karts } = await import("../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart, EnsurePlayerKarts, HoldPawn } = await import("../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/kart/spawn-points.js");
const { MELON_TEMPLATE_NAME, INTRO_SPAWN_NAME, PAWN_DRIFT_TOLERANCE, INTRO_LOGO_SECONDS, SPEED_HUD_ENTITY_NAME } = await import("../src/melon_drive/constants/index.js");

const INTRO = { x: -2000, y: -900, z: 24 };
const PLAYER_SPAWN = { x: 5000, y: 5000, z: 0 };

/** @param {{ team?: number }} [o] */
function AddPawn({ team = 3 } = {}) {
    const pawn = world.add(new CSPlayerPawn({ slot: 0, team }));
    pawn.origin = { ...PLAYER_SPAWN };
    world.playerPawns.push(pawn);
    return pawn;
}

/** Records which HUD panels are hidden for slot 0. */
class FakeHud extends Entity {
    constructor() {
        super({ name: SPEED_HUD_ENTITY_NAME, className: "custom_hud_layout" });
        /** @type {Record<string, boolean>} */
        this.hidden = {};
    }
    SetHasClassForPlayer(slot, panel, cls, on) {
        if (cls === "Hidden") this.hidden[panel] = on;
    }
    SetDialogVariableStringForPlayer() {}
}

/** @type {FakeHud} */
let hud;

beforeEach(() => {
    world.reset();
    karts.clear();
    hud = world.add(new FakeHud());
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: INTRO }));
});

test("a player who picks a team sees the logo first, then gets a melon at the intro and its chase camera", () => {
    const pawn = AddPawn();
    EnsurePlayerKarts();
    assert.equal(karts.size, 0, "no melon while the logo shows");
    assert.equal(hud.hidden.intro_logo, false, "logo shown");
    assert.equal(pawn.color.a, 0, "own body hidden behind the logo");
    world.time = INTRO_LOGO_SECONDS / 2;
    EnsurePlayerKarts();
    assert.equal(karts.size, 0, "still the logo");
    world.time = INTRO_LOGO_SECONDS;
    EnsurePlayerKarts();
    assert.equal(hud.hidden.intro_logo, true, "logo hidden once the melon is there");
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
    world.time = INTRO_LOGO_SECONDS * 2;
    EnsurePlayerKarts();
    assert.equal(karts.size, 0);
    assert.equal(hud.hidden.intro_logo, undefined, "no logo either");
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

test("a weapon the engine gives the pawn back is taken away again — a knife swing would shove the melon", () => {
    const pawn = AddPawn();
    const kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    pawn.weapons = [new Entity({ className: "weapon_knife" })];
    HoldPawn(kart);
    assert.equal(pawn.GetActiveWeapon(), undefined);
});
