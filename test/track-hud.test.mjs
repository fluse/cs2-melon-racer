// The track HUD (time trial panel + checkpoint strip) against the fake
// engine: it must go away once the kart leaves the track — regression for
// "back to the hub via the user menu, the clock and strip stayed up".
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { karts } = await import("../src/melon_drive/kart-registry.js");
const { SetUpPlayerKart } = await import("../src/melon_drive/kart-spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/spawn-points.js");
const { ReturnAllToHub, RestoreRaceFlowSnapshot } = await import("../src/melon_drive/race-flow.js");
const { UpdateCheckpointHud } = await import("../src/melon_drive/hud.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, INTRO_SPAWN_NAME, SPEED_HUD_ENTITY_NAME, RacePhase } = await import("../src/melon_drive/constants/index.js");
await import("../src/melon_drive/index.js"); // registers the script inputs

/** A custom_hud_layout that remembers every player's panel classes. */
class FakeHud extends Entity {
    constructor() {
        super({ name: SPEED_HUD_ENTITY_NAME, className: "custom_hud_layout" });
        /** @type {Map<string, boolean>} "<slot>/<panel>/<class>" -> set */
        this.classes = new Map();
    }
    SetHasClassForPlayer(slot, panel, cls, on) { this.classes.set(`${slot}/${panel}/${cls}`, on); }
    SetDialogVariableStringForPlayer() {}
    Hidden(slot, panel) { return this.classes.get(`${slot}/${panel}/Hidden`); }
}

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

/** @type {any} */
let kart;
/** @type {FakeHud} */
let hud;
/** @type {Entity} */
let start;

beforeEach(() => {
    world.reset();
    karts.clear();
    RestoreRaceFlowSnapshot({ phase: RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });
    hud = world.add(new FakeHud());
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    start = world.add(new Entity({ name: "start_1", className: "trigger_multiple" }));
    world.add(new Entity({ name: "checkpoint_1_1", className: "trigger_multiple" }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetIntroSpawnPoint());
});

test("the track HUD shows on the track and goes away back in the hub", () => {
    world.time = 1;
    ScriptInput("start_1")({ caller: start, activator: kart.melon });
    UpdateCheckpointHud(0, kart);
    assert.equal(hud.Hidden(0, "run_panel"), false);
    assert.equal(hud.Hidden(0, "checkpoint_panel"), false);

    world.time = 30;
    ReturnAllToHub([kart]); // the user menu's "Return to Hub"
    UpdateCheckpointHud(0, kart);
    assert.equal(hud.Hidden(0, "run_panel"), true);
    assert.equal(hud.Hidden(0, "checkpoint_panel"), true);
});
