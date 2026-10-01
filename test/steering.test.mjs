import { test } from "node:test";
import assert from "node:assert/strict";
import { SteerTowards } from "../src/melon_drive/movement/driving/logic.js";
import { STEER_GRIP_MAX_ANGLE } from "../src/melon_drive/constants/index.js";

const EPS = 1e-6;
const deg = (d) => (d * Math.PI) / 180;
const dirAt = (d) => ({ x: Math.cos(deg(d)), y: Math.sin(deg(d)) });
const angleOf = (v) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

test("grip turns velocity towards the look direction by at most maxTurn, keeping speed", () => {
    const v = { x: 500, y: 0 };
    const out = SteerTowards(v, dirAt(30), 10, STEER_GRIP_MAX_ANGLE);
    assert.ok(Math.abs(angleOf(out) - 10) < EPS);
    assert.ok(Math.abs(Math.hypot(out.x, out.y) - 500) < EPS);
});

test("grip snaps exactly onto the look direction when it's within maxTurn", () => {
    const out = SteerTowards({ x: 500, y: 0 }, dirAt(-5), 10, STEER_GRIP_MAX_ANGLE);
    assert.ok(Math.abs(angleOf(out) - -5) < EPS);
});

test("grip turns the short way round across ±180°", () => {
    const out = SteerTowards({ x: Math.cos(deg(175)), y: Math.sin(deg(175)) }, dirAt(-175), 5, STEER_GRIP_MAX_ANGLE);
    assert.ok(Math.abs(Math.abs(angleOf(out)) - 180) < EPS);
});

test("no grip beyond maxAngle or while standing still", () => {
    const v = { x: 500, y: 0 };
    assert.deepEqual(SteerTowards(v, dirAt(STEER_GRIP_MAX_ANGLE + 1), 360, STEER_GRIP_MAX_ANGLE), v);
    assert.deepEqual(SteerTowards({ x: 0, y: 0 }, dirAt(30), 10, STEER_GRIP_MAX_ANGLE), { x: 0, y: 0 });
});
