// The hub's script inputs (race/heat/inputs.js) against the fake engine in
// helpers/cs-script-mock.mjs: hub_enter/hub_leave open and close the start
// modal — only from hub_start_trigger itself — and hub_teleport sends a melon
// to the hub, out of any heat. See GAMEPLAY.md, "Hub → race → next-track flow".
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";

const { karts, SetModeratorSlot } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { TryStartRace, RestoreRaceFlowSnapshot, CurrentRacers } = await import("../../src/melon_drive/race/heat/race-flow.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, HUB_TRIGGER_NAME, SPEED_HUD_ENTITY_NAME, RacePhase, MELON_MAX_HEALTH } = await import("../../src/melon_drive/constants/index.js");
await import("../../src/melon_drive/index.js"); // registers the script inputs

const HUB = { x: 250, y: -520, z: 16 };

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

/** @type {FakeHud} */
let hud;
/** @type {Entity} */
let hubTrigger;
/** @type {any} */
let kart;

beforeEach(() => {
    hud?.Remove(); // GetSpeedHud caches the layout while it's valid
    world.reset();
    karts.clear();
    SetModeratorSlot(undefined);
    RestoreRaceFlowSnapshot({ phase: RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });
    hud = world.add(new FakeHud(SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: HUB }));
    world.add(new Entity({ name: "start_1", className: "trigger_multiple", origin: { x: 3000, y: 0, z: 0 } }));
    hubTrigger = world.add(new Entity({ name: HUB_TRIGGER_NAME, className: "trigger_multiple" }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetHubSpawnPoint());
});

test("hub_enter from hub_start_trigger opens the start modal with the mouse; hub_leave closes it", () => {
    ScriptInput("hub_enter")({ caller: hubTrigger, activator: kart.melon });
    assert.equal(kart.inHub, true);
    assert.equal(hud.Has(0, "hub_modal", "Hidden"), false);
    assert.equal(hud.Has(0, "hub_modal", "WaitingForOthers"), false, "no heat running: the start button");
    assert.equal(hud.inputCapture.get(0), true, "mouse to click it");

    ScriptInput("hub_leave")({ caller: hubTrigger, activator: kart.melon });
    assert.equal(kart.inHub, false);
    assert.equal(hud.Has(0, "hub_modal", "Hidden"), true);
    assert.equal(hud.inputCapture.get(0), false);
});

test("leaving the hub with the user menu open keeps the mouse for the menu", () => {
    ScriptInput("hub_enter")({ caller: hubTrigger, activator: kart.melon });
    kart.userMenuOpen = true;
    ScriptInput("hub_leave")({ caller: hubTrigger, activator: kart.melon });
    assert.equal(hud.inputCapture.get(0), true);
});

test("a stray trailing space in the hub trigger's name still counts", () => {
    hubTrigger.name = `${HUB_TRIGGER_NAME} `;
    ScriptInput("hub_enter")({ caller: hubTrigger, activator: kart.melon });
    assert.equal(kart.inHub, true);
});

test("hub_enter from any other trigger is ignored, with a hint to use hub_teleport", () => {
    const other = world.add(new Entity({ name: "intro_exit", className: "trigger_multiple" }));
    ScriptInput("hub_enter")({ caller: other, activator: kart.melon });
    assert.equal(kart.inHub, false, "would pull the kart into the next heat from anywhere");
    assert.equal(hud.Has(0, "hub_modal", "Hidden"), undefined, "no modal");
    assert.ok(world.messages.some((m) => m.includes("hub_teleport")));
});

test("hub inputs from something that isn't a tracked melon are ignored", () => {
    const stranger = world.add(new Entity({ className: "prop_physics" }));
    for (const input of ["hub_enter", "hub_leave", "hub_teleport"]) {
        ScriptInput(input)({ caller: hubTrigger, activator: stranger });
        ScriptInput(input)({ caller: hubTrigger, activator: undefined });
    }
    assert.equal(kart.inHub, false);
});

test("entering the hub while a heat runs: 'race in progress' — the moderator gets the cancel button", () => {
    const other = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 1 })), GetHubSpawnPoint());
    other.inHub = true;
    TryStartRace();

    ScriptInput("hub_enter")({ caller: hubTrigger, activator: kart.melon });
    assert.equal(hud.Has(0, "hub_modal", "WaitingForOthers"), true);
    assert.equal(hud.Has(0, "hub_modal", "IsModerator"), true, "slot 0 joined first");
    assert.equal(kart.racing, false, "entering the hub doesn't join the running heat");

    SetModeratorSlot(1);
    ScriptInput("hub_enter")({ caller: hubTrigger, activator: kart.melon });
    assert.equal(hud.Has(0, "hub_modal", "IsModerator"), false);
});

test("hub_teleport takes a racer out of the heat and puts it at hub_spawn, whole and standing still", () => {
    kart.inHub = true;
    TryStartRace();
    kart.health = 3;
    kart.melon.Teleport({ position: { x: 5000, y: 5000, z: 0 }, velocity: { x: 400, y: 0, z: 0 } });

    ScriptInput("hub_teleport")({ caller: hubTrigger, activator: kart.melon });
    assert.equal(kart.racing, false);
    assert.equal(kart.locked, false);
    assert.equal(kart.trackId, undefined);
    assert.equal(kart.health, MELON_MAX_HEALTH);
    assert.deepEqual(kart.melon.GetAbsVelocity(), { x: 0, y: 0, z: 0 });
    const p = kart.melon.GetAbsOrigin();
    assert.deepEqual([p.x, p.y], [HUB.x, HUB.y]);
    assert.deepEqual(kart.checkpointPosition, p, "the hub is its respawn point now");
    assert.deepEqual(CurrentRacers(), []);
});
