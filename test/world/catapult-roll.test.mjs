// Rolling a catapult's base: the pure rules (world/catapult/roll-logic.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { RollingVelocity, UprightAngles, SteadyAngularVelocity, IsSteady } from "../../src/melon_drive/world/catapult/roll-logic.js";
import {
    CATAPULT_ROLL_DECEL,
    CATAPULT_ROLL_MAX_DECEL,
    CATAPULT_ROLL_STOP_SPEED,
    CATAPULT_ROLL_BLOCKED_SHARE,
    CATAPULT_ROLL_STEADY_TILT_SPEED,
    CATAPULT_ROLL_MAX_TILT,
    CATAPULT_ROLL_TILT_DAMPING,
} from "../../src/melon_drive/constants/index.js";

const DT = 1 / 64;
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const Speed = (v) => Math.hypot(v.x, v.y);

test("friction is given back: only CATAPULT_ROLL_DECEL is lost, in physics' new direction", () => {
    const last = { x: 300, y: 0, z: 0 };
    const afterFriction = { x: 0, y: 300 - 0.5 * CATAPULT_ROLL_MAX_DECEL * DT, z: -3 }; // turned, slowed, falling a bit
    const next = RollingVelocity(afterFriction, last, DT);
    assert.ok(close(Speed(next), 300 - CATAPULT_ROLL_DECEL * DT), `speed ${Speed(next)}`);
    assert.ok(close(next.x, 0) && next.y > 0, "the direction physics gave it");
    assert.equal(next.z, -3, "up and down are physics'");
});

test("left rolling it slows only by the rolling resistance, and stops in the end", () => {
    let v = { x: 300, y: 0, z: 0 };
    let last = null;
    let seconds = 0;
    while (Speed(v) > 0 && seconds < 60) {
        const next = RollingVelocity(v, last, DT);
        last = next;
        // The fake physics tick: friction takes a share, or stops it below a crawl.
        const s = Speed(next);
        const after = Math.max(0, s - 600 * DT);
        v = s > 0 ? { x: next.x * after / s, y: next.y * after / s, z: 0 } : next;
        seconds += DT;
    }
    const expected = (300 - CATAPULT_ROLL_STOP_SPEED) / CATAPULT_ROLL_DECEL;
    assert.ok(seconds > expected * 0.9 && seconds < expected * 1.1 + 1, `rolled ${seconds.toFixed(2)} s`);
});

test("a hit, a push and a crawl stay as physics made them", () => {
    const last = { x: 300, y: 0, z: 0 };
    const hit = { x: 300 - 2 * CATAPULT_ROLL_MAX_DECEL * DT, y: 0, z: 0 };
    assert.deepEqual(RollingVelocity(hit, last, DT), hit, "a hit");
    const push = { x: 400, y: 0, z: 0 };
    assert.deepEqual(RollingVelocity(push, last, DT), push, "a push");
    const crawl = { x: CATAPULT_ROLL_STOP_SPEED / 2 - 1, y: 0, z: 0 };
    assert.deepEqual(RollingVelocity(crawl, { x: CATAPULT_ROLL_STOP_SPEED / 2, y: 0, z: 0 }, DT), crawl, "a crawl");
    assert.deepEqual(RollingVelocity(hit, null, DT), hit, "its first tick");
});

test("stuck (moved less than CATAPULT_ROLL_BLOCKED_SHARE of the way), nothing is given back", () => {
    const last = { x: 300, y: 0, z: 0 };
    const slowed = { x: 300 - 0.5 * CATAPULT_ROLL_MAX_DECEL * DT, y: 0, z: 0 };
    const stuck = 300 * DT * CATAPULT_ROLL_BLOCKED_SHARE * 0.9;
    assert.equal(RollingVelocity(slowed, last, DT, stuck), slowed, "against a wall: physics' own");
    const rolled = 300 * DT * 0.95;
    assert.ok(Speed(RollingVelocity(slowed, last, DT, rolled)) > Speed(slowed), "rolling on: given back");
});

test("it never tips past CATAPULT_ROLL_MAX_TILT; within it it's left alone", () => {
    assert.equal(UprightAngles({ pitch: CATAPULT_ROLL_MAX_TILT - 1, yaw: 90, roll: -(CATAPULT_ROLL_MAX_TILT - 1) }), null);
    assert.deepEqual(UprightAngles({ pitch: 80, yaw: 90, roll: -170 }), { pitch: CATAPULT_ROLL_MAX_TILT, yaw: 90, roll: -CATAPULT_ROLL_MAX_TILT });
    assert.deepEqual(UprightAngles({ pitch: 350, yaw: 10, roll: 0 }), null, "350 is -10");
});

test("a wobble dies away, turning round stays", () => {
    const next = SteadyAngularVelocity({ x: 100, y: -100, z: 45 }, DT);
    assert.ok(close(next.x, 100 * Math.exp(-CATAPULT_ROLL_TILT_DAMPING * DT)));
    assert.ok(close(next.y, -100 * Math.exp(-CATAPULT_ROLL_TILT_DAMPING * DT)));
    assert.equal(next.z, 45);
    const held = SteadyAngularVelocity({ x: 100, y: -100, z: 45 }, DT, true);
    assert.ok(held.x === 0 && held.y === 0 && held.z === 45, "put back upright: tipping stops at once");
    assert.equal(IsSteady({ x: CATAPULT_ROLL_STEADY_TILT_SPEED / 2, y: 0, z: 90 }), true);
    assert.equal(IsSteady({ x: 0, y: CATAPULT_ROLL_STEADY_TILT_SPEED * 2, z: 0 }), false);
});
