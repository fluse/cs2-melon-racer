// A respawn or teleport of the same melon must keep the zones (camera, heal,
// lift) it's in: landing back inside the same trigger — e.g. respawning at a
// checkpoint inside the camera zone it broke in — sends no new OnStartTouch,
// so a cleared zone never came back (the camera zone's zoom reset). Leaving a
// zone by teleport goes through its OnEndTouch (camera_leave) as usual. Only
// a brand-new melon entity starts with no zones. Runs the real engine-side
// functions against the fake engine in helpers/cs-script-mock.mjs.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { karts } = await import("../src/melon_drive/kart-registry.js");
const { SetUpPlayerKart } = await import("../src/melon_drive/kart-spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/spawn-points.js");
const { RespawnKartAtCheckpoint, TeleportKartTo, BreakMelon, HandleMelonLost } = await import("../src/melon_drive/physics/index.js");
const { CurrentCameraZone, StrongestZone } = await import("../src/melon_drive/physics/zones.js");
const { UpdateZoneCamera } = await import("../src/melon_drive/camera/zone-zoom.js");
const { CameraZoneFromName } = await import("../src/melon_drive/logic/camera-zone.js");
const { ReturnAllToHub, BeginHeat } = await import("../src/melon_drive/race-flow.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, INTRO_SPAWN_NAME, CAMERA_ZONE_EASE_SECONDS } = await import("../src/melon_drive/constants/index.js");
await import("../src/melon_drive/index.js"); // registers the script inputs

const CAMERA_ZONE_NAME = "camera_zone_250_40";

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
let cameraTrigger;
/** @type {Entity} */
let healTrigger;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    world.add(new Entity({ name: "start_1_laps3", className: "trigger_multiple", origin: { x: 2400, y: 1088, z: 128 } }));
    const pawn = world.add(new CSPlayerPawn({ slot: 0 }));
    kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    assert.ok(kart, "setup: kart created");
    cameraTrigger = world.add(new Entity({ name: CAMERA_ZONE_NAME, className: "trigger_multiple" }));
    healTrigger = world.add(new Entity({ name: "heal_zone_25", className: "trigger_multiple" }));
    ScriptInput("camera_enter")({ caller: cameraTrigger, activator: kart.melon });
    ScriptInput("heal_enter")({ caller: healTrigger, activator: kart.melon });
    UpdateZoneCamera(kart, CAMERA_ZONE_EASE_SECONDS); // fully zoomed in
});

function AssertStillInZones() {
    assert.deepEqual(CurrentCameraZone(kart), CameraZoneFromName(CAMERA_ZONE_NAME), "still in the camera zone");
    assert.equal(StrongestZone(kart, "healZones"), 25, "still in the heal zone");
}

test("respawn at the checkpoint keeps the zones", () => {
    RespawnKartAtCheckpoint(kart);
    AssertStillInZones();
});

test("a break respawning inside the same camera zone keeps its zoom", async () => {
    BreakMelon(0, kart, { x: 1, y: 0, z: 0 }, 1000);
    await flush();
    AssertStillInZones();
    const zoomed = kart.zoneCamera;
    UpdateZoneCamera(kart, 1);
    assert.equal(kart.zoneCamera, zoomed, "the zoom doesn't start easing back out");
    assert.deepEqual(kart.zoneCamera?.to, CameraZoneFromName(CAMERA_ZONE_NAME));
});

test("a break respawning outside the zone eases the zoom back out once camera_leave arrives", async () => {
    BreakMelon(0, kart, { x: 1, y: 0, z: 0 }, 1000);
    await flush();
    ScriptInput("camera_leave")({ caller: cameraTrigger, activator: kart.melon });
    assert.equal(CurrentCameraZone(kart), undefined);
    UpdateZoneCamera(kart, CAMERA_ZONE_EASE_SECONDS);
    assert.equal(kart.zoneCamera, undefined, "back to the normal chase camera");
});

test("a teleporter keeps the zones", () => {
    TeleportKartTo(kart, { x: 1, y: 2, z: 3 }, { pitch: 0, yaw: 45, roll: 0 }, { x: 0, y: 0, z: 0 });
    AssertStillInZones();
});

test("returning to the hub keeps the zones", () => {
    ReturnAllToHub([kart]);
    AssertStillInZones();
});

test("a heat start keeps the zones", () => {
    kart.racing = true;
    BeginHeat(1);
    AssertStillInZones();
    ReturnAllToHub([kart]); // leave the heat so race-flow state doesn't leak into other tests
});

test("a destroyed melon's replacement starts in no zones", async () => {
    kart.melon.valid = false;
    HandleMelonLost(0, kart);
    await flush();
    assert.ok(kart.melon.IsValid(), "a new melon was spawned");
    assert.equal(CurrentCameraZone(kart), undefined, "no camera zone");
    assert.equal(StrongestZone(kart, "healZones"), undefined, "no heal zone");
});
