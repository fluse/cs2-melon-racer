// The zone triggers' script inputs (zones/inputs.js) and what the registry
// (zones/registry.js) makes of overlapping zones, against the fake engine in
// helpers/cs-script-mock.mjs: overlapping heal and lift zones don't stack
// (the strongest counts), camera zones and jump pads go by the one entered
// last, each leave only removes its own trigger, and a trigger that's gone
// stops counting. Plus the paint triggers (melon_paint, kart/inputs.js).
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { CurrentHealRate, ApplyHealing } = await import("../../src/melon_drive/health/heal/zone.js");
const { CurrentWallRules, CurrentCameraZone, CurrentJumpPad, InLiftZone, InWater } = await import("../../src/melon_drive/zones/registry.js");
const { WallRules } = await import("../../src/melon_drive/zones/lift/logic.js");
const { CameraZoneFromName } = await import("../../src/melon_drive/zones/camera-zone/logic.js");
const { JumpPadFromName } = await import("../../src/melon_drive/zones/jump-pad/logic.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, HEAL_ZONE_RATE, MELON_MAX_HEALTH, MELON_GLOW_UNPAINTED_COLOR } = await import("../../src/melon_drive/constants/index.js");
await import("../../src/melon_drive/index.js"); // registers the script inputs

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

/** @type {any} */
let kart;

/** A trigger named `name`. @param {string} name */
function Trigger(name) {
    return world.add(new Entity({ name, className: "trigger_multiple" }));
}

/** @param {string} kind e.g. "heal" @param {Entity} trigger */
function Enter(kind, trigger) {
    ScriptInput(`${kind}_enter`)({ caller: trigger, activator: kart.melon });
}

/** @param {string} kind @param {Entity} trigger */
function Leave(kind, trigger) {
    ScriptInput(`${kind}_leave`)({ caller: trigger, activator: kart.melon });
}

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetHubSpawnPoint());
});

test("overlapping heal zones don't stack: the fastest counts, and each leave removes only its own", () => {
    const slow = Trigger("heal_zone_5");
    const fast = Trigger("heal_zone_40");
    Enter("heal", slow);
    Enter("heal", fast);
    assert.equal(CurrentHealRate(kart), 40);

    Leave("heal", fast);
    assert.equal(CurrentHealRate(kart), 5, "still in the slow one");
    Leave("heal", slow);
    assert.equal(CurrentHealRate(kart), 0);
});

test("a heal zone heals the melon every tick, up to full", () => {
    Enter("heal", Trigger("heal_zone"));
    kart.health = 20;
    ApplyHealing(kart, 0.5);
    assert.equal(kart.health, 20 + HEAL_ZONE_RATE * 0.5, "a plainly named trigger heals at HEAL_ZONE_RATE");
    ApplyHealing(kart, 1000);
    assert.equal(kart.health, MELON_MAX_HEALTH);
});

test("a zone trigger that no longer exists stops counting", () => {
    const heal = Trigger("heal_zone_30");
    const lift = Trigger("lift_zone_600");
    Enter("heal", heal);
    Enter("lift", lift);
    heal.Remove();
    lift.Remove();
    assert.equal(CurrentHealRate(kart), 0);
    assert.equal(InLiftZone(kart), false);
});

test("lift zones: the wall rules follow the strongest kick of the lifts the melon is in", () => {
    assert.deepEqual(CurrentWallRules(kart), WallRules(undefined), "outside: the normal rules");
    const low = Trigger("lift_zone_500");
    const high = Trigger("lift_zone_900");
    Enter("lift", low);
    Enter("lift", high);
    assert.equal(InLiftZone(kart), true);
    assert.deepEqual(CurrentWallRules(kart), WallRules(900));
    Leave("lift", high);
    assert.deepEqual(CurrentWallRules(kart), WallRules(500));
    Leave("lift", low);
    assert.deepEqual(CurrentWallRules(kart), WallRules(undefined));
});

test("camera zones and jump pads: the one entered last counts, until it's left", () => {
    const wide = Trigger("camera_zone_250_40");
    const close = Trigger("camera_zone_close");
    Enter("camera", wide);
    Enter("camera", close);
    assert.deepEqual(CurrentCameraZone(kart), CameraZoneFromName("camera_zone_close"));
    Leave("camera", close);
    assert.deepEqual(CurrentCameraZone(kart), CameraZoneFromName("camera_zone_250_40"));
    Leave("camera", wide);
    assert.equal(CurrentCameraZone(kart), undefined);

    const padA = Trigger("jump_pad_700_100");
    const padB = Trigger("jump_pad_900_0");
    Enter("jump_pad", padA);
    Enter("jump_pad", padB);
    assert.deepEqual(CurrentJumpPad(kart), JumpPadFromName("jump_pad_900_0"));
    Leave("jump_pad", padB);
    assert.deepEqual(CurrentJumpPad(kart), JumpPadFromName("jump_pad_700_100"));
});

test("water: in while inside any water trigger", () => {
    const pool = Trigger("water_pool");
    Enter("water", pool);
    assert.equal(InWater(kart), true);
    Leave("water", pool);
    assert.equal(InWater(kart), false);
});

test("zone inputs from something that isn't a tracked melon change nothing", () => {
    const heal = Trigger("heal_zone_50");
    const stranger = world.add(new Entity({ className: "prop_physics" }));
    for (const kind of ["heal", "lift", "camera", "jump_pad", "water"]) {
        ScriptInput(`${kind}_enter`)({ caller: heal, activator: stranger });
        ScriptInput(`${kind}_enter`)({ caller: undefined, activator: kart.melon });
        ScriptInput(`${kind}_leave`)({ caller: heal, activator: stranger });
    }
    assert.equal(CurrentHealRate(kart), 0);
    assert.equal(InLiftZone(kart), false);
    assert.equal(CurrentCameraZone(kart), undefined);
});

test("melon_paint: the color comes from the trigger's name, and sticks", () => {
    ScriptInput("melon_paint")({ caller: Trigger("paint_trigger_12_200_7"), activator: kart.melon });
    const color = { r: 12, g: 200, b: 7, a: 255 };
    assert.deepEqual(kart.paintColor, color);
    assert.deepEqual(kart.melon.color, color);
    assert.deepEqual(kart.melon.glow, color, "the outline glow takes the paint color");

    ScriptInput("melon_paint")({ caller: Trigger("paint_trigger_red"), activator: kart.melon });
    assert.deepEqual(kart.paintColor, color, "a misnamed trigger changes nothing");
});

test("melon_paint: an unpainted melon glows MELON_GLOW_UNPAINTED_COLOR; strangers aren't painted", () => {
    assert.deepEqual(kart.melon.glow, MELON_GLOW_UNPAINTED_COLOR);
    const stranger = world.add(new Entity({ className: "prop_physics" }));
    ScriptInput("melon_paint")({ caller: Trigger("paint_trigger_1_2_3"), activator: stranger });
    assert.equal(stranger.color, undefined);
    assert.deepEqual(kart.melon.glow, MELON_GLOW_UNPAINTED_COLOR);
});
