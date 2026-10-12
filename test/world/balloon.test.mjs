// Balloon balls: the pure rules (world/balloon/logic.js) and keeping every
// ball afloat against the fake engine (world/balloon/balloon.js).
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity } from "../helpers/cs-script-mock.mjs";
import { IsBalloonModel, BalloonVelocity } from "../../src/melon_drive/world/balloon/logic.js";
import { BALLOON_MODEL, BALLOON_SINK_SPEED, BALLOON_DRAG, BALLOON_SCAN_SECONDS, GRAVITY } from "../../src/melon_drive/constants/index.js";

const { UpdateBalloons, balloons } = await import("../../src/melon_drive/world/balloon/balloon.js");

const close = (a, b) => Math.abs(a - b) < 1e-6;
const DT = 1 / 64;

/** One physics tick of the fake: the engine's gravity pulls on what the script set. @param {{ x: number, y: number, z: number }} v */
const AfterGravity = (v) => ({ ...v, z: v.z - GRAVITY * DT });

test("the ball model is a balloon, whatever its spelling; other models aren't", () => {
    assert.equal(IsBalloonModel(BALLOON_MODEL), true);
    assert.equal(IsBalloonModel(`${BALLOON_MODEL.toUpperCase().replace(/\//g, "\\")}_c`), true);
    assert.equal(IsBalloonModel("models/melon_racer/melon/melon.vmdl"), false);
});

test("left alone it settles into sinking at BALLOON_SINK_SPEED, never falling faster", () => {
    let v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 64 * 10; i++) {
        v = AfterGravity(BalloonVelocity(v, DT, GRAVITY));
        assert.ok(v.z >= -BALLOON_SINK_SPEED - 1e-6, "never faster than sinking");
    }
    assert.ok(Math.abs(v.z + BALLOON_SINK_SPEED) < 0.01, `sinking at ${v.z}`);
});

test("a knock flies far and the air slows it: down by e after 1/BALLOON_DRAG s", () => {
    let v = { x: 600, y: 0, z: 300 };
    const ticks = Math.round(64 / BALLOON_DRAG);
    for (let i = 0; i < ticks; i++) {
        v = AfterGravity(BalloonVelocity(v, DT, GRAVITY));
    }
    assert.ok(Math.abs(v.x - 600 / Math.E) < 5, `sideways ${v.x}`);
    assert.ok(Math.abs(v.z - (-BALLOON_SINK_SPEED + (300 + BALLOON_SINK_SPEED) / Math.E)) < 5, `upwards ${v.z}`);
});

test("on the floor it rests: what physics left (0) only becomes a gentle push down after gravity", () => {
    const next = AfterGravity(BalloonVelocity({ x: 0, y: 0, z: 0 }, DT, GRAVITY));
    assert.ok(next.z <= 0 && next.z > -BALLOON_SINK_SPEED, "no hop off the floor");
});

beforeEach(() => {
    world.reset();
    balloons.clear();
});

test("every ball with the ball model floats, found again and again; other props are left to physics", () => {
    const ball = world.add(new Entity({ className: "prop_physics", origin: { x: 0, y: 0, z: 100 } }));
    ball.SetModel(BALLOON_MODEL);
    const crate = world.add(new Entity({ className: "prop_physics" }));
    crate.SetModel("models/props/crate.vmdl");
    ball.Teleport({ velocity: { x: 0, y: 0, z: -400 } });
    crate.Teleport({ velocity: { x: 0, y: 0, z: -400 } });

    UpdateBalloons(1000, DT);
    assert.ok(balloons.has(ball) && !balloons.has(crate));
    assert.deepEqual(ball.GetAbsVelocity(), BalloonVelocity({ x: 0, y: 0, z: -400 }, DT, GRAVITY));
    assert.equal(crate.GetAbsVelocity().z, -400, "not a balloon");

    const spawned = world.add(new Entity({ className: "prop_physics_multiplayer" }));
    spawned.SetModel(BALLOON_MODEL);
    UpdateBalloons(1000 + BALLOON_SCAN_SECONDS / 2, DT);
    assert.equal(balloons.has(spawned), false, "not looked for yet");
    UpdateBalloons(1000 + BALLOON_SCAN_SECONDS, DT);
    assert.equal(balloons.has(spawned), true, "a spawned ball is found");

    ball.Remove();
    UpdateBalloons(1000 + BALLOON_SCAN_SECONDS * 1.5, DT);
    assert.equal(balloons.has(ball), false, "a removed one is forgotten");
});
