// Ball pits: the rules (world/ball-pit/logic.js) and the ball_pit_enter /
// ball_pit_leave inputs against the fake engine — a ball that leaves its pit
// trigger is steered back towards the middle every tick, and dropped back in
// after BALL_PIT_DROP_SECONDS; melons are left alone.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { BallReturnVelocity, BallDropPosition } = await import("../../src/melon_drive/world/ball-pit/logic.js");
const { ballsOutside, UpdateBallPits } = await import("../../src/melon_drive/world/index.js");
const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const C = await import("../../src/melon_drive/constants/index.js");
await import("../../src/melon_drive/index.js"); // registers the script inputs

test("a ball outside is turned towards the middle, at least at the return speed", () => {
    const v = BallReturnVelocity({ x: 100, y: 0, z: 0 }, { x: 50, y: 30, z: -20 }, { x: 0, y: 0, z: 0 });
    assert.equal(v.x, -C.BALL_PIT_RETURN_SPEED);
    assert.equal(v.y, 0);
    assert.equal(v.z, -20, "vertical speed left alone");
    const fast = BallReturnVelocity({ x: 100, y: 0, z: 0 }, { x: -400, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    assert.equal(fast.x, -400, "already flying back faster: kept");
});

test("dropped back in over the middle, within the spread", () => {
    const center = { x: 10, y: 20, z: 30 };
    assert.deepEqual(BallDropPosition(center, 0.5, 0.5), { x: 10, y: 20, z: 30 + C.BALL_PIT_DROP_HEIGHT });
    assert.deepEqual(BallDropPosition(center, 0, 1), { x: 10 - C.BALL_PIT_DROP_SPREAD, y: 20 + C.BALL_PIT_DROP_SPREAD, z: 30 + C.BALL_PIT_DROP_HEIGHT });
});

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

/** @type {Entity} */
let pit;
/** @type {Entity} */
let ball;

beforeEach(() => {
    world.reset();
    karts.clear();
    ballsOutside.clear();
    pit = world.add(new Entity({ name: "ball_pit", className: "trigger_multiple", origin: { x: 0, y: 0, z: 0 } }));
    ball = world.add(new Entity({ className: "prop_physics_multiplayer", origin: { x: 80, y: 0, z: 10 } }));
});

test("a ball that left is steered back until it's in again", () => {
    ScriptInput("ball_pit_leave")({ caller: pit, activator: ball });
    UpdateBallPits(world.time);
    assert.equal(ball.GetAbsVelocity().x, -C.BALL_PIT_RETURN_SPEED);
    ScriptInput("ball_pit_enter")({ caller: pit, activator: ball });
    ball.Teleport({ velocity: { x: 0, y: 0, z: 0 } });
    UpdateBallPits(world.time);
    assert.equal(ball.GetAbsVelocity().x, 0, "in again: left alone");
});

test("a ball that doesn't make it back is dropped in over the middle", () => {
    ScriptInput("ball_pit_leave")({ caller: pit, activator: ball });
    UpdateBallPits(world.time + C.BALL_PIT_DROP_SECONDS);
    const p = ball.GetAbsOrigin();
    assert.equal(p.z, C.BALL_PIT_DROP_HEIGHT);
    assert.ok(Math.abs(p.x) <= C.BALL_PIT_DROP_SPREAD && Math.abs(p.y) <= C.BALL_PIT_DROP_SPREAD);
    assert.equal(ballsOutside.size, 0);
});

test("a melon leaving the pit is left alone", () => {
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    world.add(new Entity({ name: C.HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    const kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetIntroSpawnPoint());
    assert.ok(kart, "setup: kart created");
    ScriptInput("ball_pit_leave")({ caller: pit, activator: kart.melon });
    assert.equal(ballsOutside.size, 0);
});
