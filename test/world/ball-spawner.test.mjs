// Ball spawner: the rules (world/ball-spawner/logic.js) and UpdateBallSpawner
// against the fake engine — balls from the template at spawn_ball, at
// irregular intervals, removed after BALL_SPAWNER_LIFETIME, never more than
// BALL_SPAWNER_MAX_BALLS at once.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { BallSpawnDelay, ShouldSpawnBall, BallSpawnPosition } = await import("../../src/melon_drive/world/ball-spawner/logic.js");
const { spawnedBalls, UpdateBallSpawner, ResetBallSpawner, RestoreSpawnedBalls } = await import("../../src/melon_drive/world/index.js");
const C = await import("../../src/melon_drive/constants/index.js");

test("the delay between two balls lies in the interval", () => {
    assert.equal(BallSpawnDelay(0), C.BALL_SPAWNER_MIN_INTERVAL);
    assert.equal(BallSpawnDelay(1), C.BALL_SPAWNER_MAX_INTERVAL);
});

test("a ball spawns when it's due and there's room", () => {
    assert.equal(ShouldSpawnBall(5, 5, 0), true);
    assert.equal(ShouldSpawnBall(4.9, 5, 0), false, "not due yet");
    assert.equal(ShouldSpawnBall(5, 5, C.BALL_SPAWNER_MAX_BALLS), false, "full");
});

test("spawned at the point, within the spread", () => {
    assert.deepEqual(BallSpawnPosition({ x: 10, y: 20, z: 30 }, 0.5, 0.5), { x: 10, y: 20, z: 30 });
    assert.deepEqual(BallSpawnPosition({ x: 0, y: 0, z: 0 }, 0, 1), { x: -C.BALL_SPAWNER_SPREAD, y: C.BALL_SPAWNER_SPREAD, z: 0 });
});

const point = { x: 100, y: 200, z: 300 };

beforeEach(() => {
    world.reset();
    ResetBallSpawner();
    world.add(new PointTemplate({
        name: C.BALL_SPAWNER_TEMPLATE_NAME,
        spawn: () => [new Entity({ className: "prop_physics_multiplayer", origin: { x: 500, y: 0, z: 0 } })],
    }));
    world.add(new Entity({ name: C.BALL_SPAWNER_SPAWN_NAME, origin: point }));
});

/** Runs the spawner every tick from `from` to `to` seconds. */
function Run(from, to, step = 1 / 64) {
    for (let t = from; t <= to; t += step) {
        world.time = t;
        UpdateBallSpawner(t);
    }
}

test("a ball appears at spawn_ball, not at the template's offset", () => {
    UpdateBallSpawner(0);
    assert.equal(spawnedBalls.length, 1);
    const p = spawnedBalls[0].ball.GetAbsOrigin();
    assert.ok(Math.abs(p.x - point.x) <= C.BALL_SPAWNER_SPREAD && Math.abs(p.y - point.y) <= C.BALL_SPAWNER_SPREAD);
    assert.equal(p.z, point.z);
});

test("never more than the maximum at once, each removed after its lifetime", () => {
    Run(0, C.BALL_SPAWNER_LIFETIME * 3);
    assert.ok(spawnedBalls.length <= C.BALL_SPAWNER_MAX_BALLS);
    const alive = world.entities.filter((e) => e.valid && e.className === "prop_physics_multiplayer");
    assert.equal(alive.length, spawnedBalls.length, "every older ball removed");
    for (const { removeAt } of spawnedBalls) {
        assert.ok(removeAt - world.time <= C.BALL_SPAWNER_LIFETIME);
    }
});

test("the first ball removed exactly when its lifetime ends", () => {
    UpdateBallSpawner(0);
    const { ball } = spawnedBalls[0];
    UpdateBallSpawner(C.BALL_SPAWNER_LIFETIME - 0.01);
    assert.equal(ball.IsValid(), true);
    UpdateBallSpawner(C.BALL_SPAWNER_LIFETIME);
    assert.equal(ball.IsValid(), false);
});

test("no spawn_ball in the map: no balls", () => {
    world.entities.find((e) => e.name === C.BALL_SPAWNER_SPAWN_NAME).Remove();
    Run(0, 30);
    assert.equal(spawnedBalls.length, 0);
});

test("a hot reload keeps the balls spawned before it", () => {
    UpdateBallSpawner(0);
    const before = [...spawnedBalls];
    ResetBallSpawner();
    RestoreSpawnedBalls(before);
    assert.equal(spawnedBalls.length, 1);
    UpdateBallSpawner(C.BALL_SPAWNER_LIFETIME);
    assert.equal(before[0].ball.IsValid(), false, "still removed in time");
});
