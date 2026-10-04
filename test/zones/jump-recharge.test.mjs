// Jump recharge zones (zones/jump-recharge/): the pure rule, then the real
// script inputs and UpdateKart against the fake engine — inside the zone the
// wall-jump charges are full at once and stay full, outside they refill as
// usual.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { ChargeInRechargeZone } from "../../src/melon_drive/zones/jump-recharge/logic.js";
import { WALL_JUMP_CHARGES, MELON_TEMPLATE_NAME, HUB_SPAWN_NAME } from "../../src/melon_drive/constants/index.js";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../../src/melon_drive/movement/index.js");
await import("../../src/melon_drive/index.js"); // registers the script inputs

const DT = 1 / 64;

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

/** @type {any} */
let kart;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetHubSpawnPoint());
});

test("inside a jump recharge zone the charge is full, outside it's left alone", () => {
    assert.equal(ChargeInRechargeZone(0, true), WALL_JUMP_CHARGES);
    assert.equal(ChargeInRechargeZone(1.5, true), WALL_JUMP_CHARGES);
    assert.equal(ChargeInRechargeZone(1.5, false), 1.5);
});

test("entering a jump recharge zone fills the wall jumps on the next tick and keeps them full; leaving, they refill as usual again", () => {
    const zone = world.add(new Entity({ name: "jump_recharge", className: "trigger_multiple" }));
    kart.wallJumpCharge = 0;
    ScriptInput("jump_recharge_enter")({ caller: zone, activator: kart.melon });
    UpdateKart(0, kart, DT);
    assert.equal(kart.wallJumpCharge, WALL_JUMP_CHARGES, "full at once");
    kart.wallJumpCharge = 1; // a wall jump inside the zone
    UpdateKart(0, kart, DT);
    assert.equal(kart.wallJumpCharge, WALL_JUMP_CHARGES, "kept full");
    ScriptInput("jump_recharge_leave")({ caller: zone, activator: kart.melon });
    kart.wallJumpCharge = 0;
    UpdateKart(0, kart, DT);
    assert.ok(kart.wallJumpCharge < 1, `outside only the slow refill (${kart.wallJumpCharge})`);
});
