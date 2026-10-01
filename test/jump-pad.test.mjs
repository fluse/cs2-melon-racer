// Jump pads: the rules (zones/jump-pad/logic.js) and the real UpdateKart applying
// them against the fake engine — jump pressed on the pad launches higher and
// further, no press no launch, and no damage until shortly after landing.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { JumpPadFromName, ShouldPadLaunch, PadLaunchVelocity, PadFlightAfter } = await import("../src/melon_drive/zones/jump-pad/logic.js");
const { karts } = await import("../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../src/melon_drive/movement/index.js");
const { ApplyImpactDamage } = await import("../src/melon_drive/health/index.js");
const C = await import("../src/melon_drive/constants/index.js");
await import("../src/melon_drive/index.js"); // registers the script inputs

const DT = 1 / 64;
const LOOK = { x: 1, y: 0 };

test("pad launch comes from the trigger name, else the defaults", () => {
    assert.deepEqual(JumpPadFromName("jump_pad_1000_400"), { up: 1000, forward: 400 });
    assert.deepEqual(JumpPadFromName("jump_pad_1000"), { up: 1000, forward: C.JUMP_PAD_FORWARD_BOOST });
    assert.deepEqual(JumpPadFromName("some_trigger"), { up: C.JUMP_PAD_UP_SPEED, forward: C.JUMP_PAD_FORWARD_BOOST });
});

test("launches on a press, or a press just before reaching the pad — not without one", () => {
    assert.equal(ShouldPadLaunch(10, true, 10, undefined), true);
    assert.equal(ShouldPadLaunch(10, false, undefined, undefined), false, "no press, no launch");
    assert.equal(ShouldPadLaunch(10, false, 10 - C.JUMP_PAD_BUFFER, undefined), true, "buffered press");
    assert.equal(ShouldPadLaunch(10, false, 10 - C.JUMP_PAD_BUFFER - 0.01, undefined), false, "too early");
});

test("one press launches once, and not again within JUMP_PAD_COOLDOWN", () => {
    assert.equal(ShouldPadLaunch(10.1, false, 10, 10), false, "that press already launched");
    assert.equal(ShouldPadLaunch(10 + C.JUMP_PAD_COOLDOWN / 2, true, 10 + C.JUMP_PAD_COOLDOWN / 2, 10), false);
    assert.equal(ShouldPadLaunch(10 + C.JUMP_PAD_COOLDOWN, true, 10 + C.JUMP_PAD_COOLDOWN, 10), true);
});

test("launch: up at the pad's speed, horizontal speed added along the way it's going", () => {
    const pad = { up: 900, forward: 200 };
    const v = PadLaunchVelocity({ x: 0, y: 300, z: -150 }, LOOK, pad);
    assert.deepEqual(v, { x: 0, y: 500, z: 900 });
    const still = PadLaunchVelocity({ x: 0, y: 0, z: 0 }, LOOK, pad);
    assert.deepEqual(still, { x: 200, y: 0, z: 900 }, "standing still: along the look direction");
});

test("protection lasts until JUMP_PAD_LANDING_GRACE after landing, the pad itself doesn't count as landing", () => {
    let flight = PadFlightAfter({ launchTime: 10 }, 10.05, 10.05);
    assert.ok(flight && flight.landedTime === undefined, "still on the pad at takeoff");
    flight = PadFlightAfter(flight, 12, 12);
    assert.equal(flight?.landedTime, 12, "landed");
    assert.ok(PadFlightAfter(flight, 12 + C.JUMP_PAD_LANDING_GRACE - 0.01, 12));
    assert.equal(PadFlightAfter(flight, 12 + C.JUMP_PAD_LANDING_GRACE + 0.01, 12), undefined);
    assert.equal(PadFlightAfter({ launchTime: 10 }, 10 + C.JUMP_PAD_MAX_PROTECTED_SECONDS + 0.01, undefined), undefined, "time limit");
});

/** @type {CSPlayerPawn} */
let pawn;
/** @type {any} */
let kart;
/** @type {Entity} */
let pad;

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

beforeEach(() => {
    world.reset();
    karts.clear();
    world.time = 100;
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 30 } }));
    pawn = world.add(new CSPlayerPawn({ slot: 0 }));
    kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    pad = world.add(new Entity({ name: "jump_pad_1000_300", className: "trigger_multiple" }));
});

/** One tick along +x (look yaw 0), physics following the last command exactly. */
function Tick(buttons, justPressed = []) {
    pawn.pressed = new Set(buttons);
    pawn.justPressed = new Set(justPressed);
    world.time += DT;
    kart.lastVelocity = { ...kart.melon.GetAbsVelocity() };
    UpdateKart(0, kart, DT);
    pawn.justPressed = new Set();
    return kart.melon.GetAbsVelocity();
}

test("UpdateKart: jump on the pad launches with the pad's values, driving over it without jump doesn't", () => {
    kart.melon.velocity = { x: 400, y: 0, z: 0 };
    ScriptInput("jump_pad_enter")({ caller: pad, activator: kart.melon });
    const rolled = Tick(["FORWARD"]);
    assert.ok(rolled.z < 1000, "no press: no launch");
    const v = Tick(["FORWARD", "JUMP"], ["JUMP"]);
    assert.equal(v.z, 1000);
    assert.ok(Math.hypot(v.x, v.y) > 400 + 300 - 1, `faster (${Math.hypot(v.x, v.y)})`);
    assert.ok(kart.padFlight, "protected");
    ScriptInput("jump_pad_leave")({ caller: pad, activator: kart.melon });
});

test("no damage while flying off a pad; normal damage again after landing", () => {
    const hard = { x: 0, y: 0, z: 3000 };
    kart.padFlight = { launchTime: world.time };
    ApplyImpactDamage(0, kart, hard);
    assert.equal(kart.health, C.MELON_MAX_HEALTH, "the landing is free");
    kart.padFlight = undefined;
    ApplyImpactDamage(0, kart, hard);
    assert.ok(kart.health < C.MELON_MAX_HEALTH, "without a pad it hurts");
});
