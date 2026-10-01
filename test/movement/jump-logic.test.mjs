// Ground-jump, wall-jump and wall-jump charge rules (movement/jump/logic.js),
// asserted in terms of the constants. The engine side is test/movement/jump.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanGroundJump, CanWallJump, WallJumpVelocity, RechargeWallJump, WallJumpChargeAfter } from "../../src/melon_drive/movement/jump/logic.js";
import {
    WALL_JUMP_WINDOW,
    WALL_JUMP_COOLDOWN,
    WALL_JUMP_UP_SPEED,
    WALL_JUMP_PUSH_SPEED,
    WALL_JUMP_CHARGE_COST,
    WALL_JUMP_MIN_CHARGE,
    WALL_JUMP_RECHARGE_SECONDS,
} from "../../src/melon_drive/constants/index.js";

const wallA = { x: 1, y: 0 };
const wallB = { x: -1, y: 0 };

test("wall jump: in the air, with a fresh wall contact", () => {
    assert.equal(CanWallJump({ now: 10, grounded: false, wallContact: { time: 10, normal: wallA }, charge: 1 }), true);
    // (from 0: 10 + WALL_JUMP_WINDOW - 10 isn't exactly WALL_JUMP_WINDOW in floating point)
    assert.equal(CanWallJump({ now: WALL_JUMP_WINDOW, grounded: false, wallContact: { time: 0, normal: wallA }, charge: 1 }), true);
});

test("wall jump: a longer window (lift zones) keeps the contact jumpable longer", () => {
    const s = { now: 10 + WALL_JUMP_WINDOW * 3, grounded: false, wallContact: { time: 10, normal: wallA }, charge: 1 };
    assert.equal(CanWallJump(s), false);
    assert.equal(CanWallJump({ ...s, window: WALL_JUMP_WINDOW * 4 }), true);
});

test("wall jump: not on the ground, not without a wall, not after the window", () => {
    assert.equal(CanWallJump({ now: 10, grounded: true, wallContact: { time: 10, normal: wallA }, charge: 1 }), false);
    assert.equal(CanWallJump({ now: 10, grounded: false, charge: 1 }), false);
    assert.equal(CanWallJump({ now: 10 + WALL_JUMP_WINDOW + 0.01, grounded: false, wallContact: { time: 10, normal: wallA }, charge: 1 }), false);
});

test("wall jump: can't climb the same wall forever", () => {
    const later = 10 + WALL_JUMP_COOLDOWN + 0.01;
    const s = { now: later, grounded: false, wallContact: { time: later, normal: wallA }, lastWallJump: { time: 10, normal: wallA }, charge: 1 };
    assert.equal(CanWallJump(s), false, "same wall again");
    assert.equal(CanWallJump({ ...s, wallContact: { time: later, normal: wallB } }), true, "the opposite wall chains");
    assert.equal(CanWallJump({ ...s, lastGroundedTime: 10.1 }), true, "touched ground since — same wall is fine again");
});

test("wall jump: cooldown between two wall jumps", () => {
    const s = { now: 10 + WALL_JUMP_COOLDOWN / 2, grounded: false, wallContact: { time: 10.1, normal: wallB }, lastWallJump: { time: 10, normal: wallA }, charge: 1 };
    assert.equal(CanWallJump(s), false);
});

test("wall jump: not while a wall bounce's jump-timing window is open", () => {
    const s = { now: 10, grounded: false, wallContact: { time: 10, normal: wallA }, charge: 1 };
    assert.equal(CanWallJump({ ...s, bounceTiming: true }), false);
    assert.equal(CanWallJump({ ...s, bounceTiming: false }), true);
});

test("wall jump velocity: pushes away from the wall and up, keeps speed along it", () => {
    // moving into the wall (normal +x) at -300, along it at +200
    const v = WallJumpVelocity({ x: -300, y: 200 }, wallA, 1);
    assert.equal(v.x, WALL_JUMP_PUSH_SPEED);
    assert.equal(v.y, 200);
    assert.equal(v.z, WALL_JUMP_UP_SPEED);
});

test("wall jump velocity: an already faster push away (e.g. after a bounce) is kept", () => {
    const v = WallJumpVelocity({ x: WALL_JUMP_PUSH_SPEED + 400, y: 0 }, wallA, 1);
    assert.equal(v.x, WALL_JUMP_PUSH_SPEED + 400);
});

test("ground jump: no cooldown, but a new ground contact since the last jump", () => {
    assert.equal(CanGroundJump({ grounded: true }), true, "first jump");
    assert.equal(CanGroundJump({ grounded: false }), false);
    assert.equal(CanGroundJump({ grounded: true, lastGroundedTime: 10, lastJumpTime: 10 }), false, "still within the take-off tolerance");
    assert.equal(CanGroundJump({ grounded: true, lastGroundedTime: 10.02, lastJumpTime: 10 }), true, "landed again — right away, no cooldown");
});

// Regression: chained wall jumps kept the same strength (and raised the
// speed cap), so the melon got faster and faster.
test("chained wall jumps get weaker, until the charge is spent", () => {
    let charge = 1;
    const strengths = [];
    while (CanWallJump({ now: 10, grounded: false, wallContact: { time: 10, normal: wallA }, charge })) {
        strengths.push(WallJumpVelocity({ x: 0, y: 0 }, wallA, charge).z);
        charge = WallJumpChargeAfter(charge);
        assert.ok(strengths.length < 100, "must run out");
    }
    assert.ok(strengths.length >= 2, "a couple of wall jumps in a row are possible");
    for (let i = 1; i < strengths.length; i++) {
        assert.ok(strengths[i] < strengths[i - 1], `jump ${i + 1} weaker than jump ${i}`);
    }
    assert.ok(charge < WALL_JUMP_MIN_CHARGE);
});

test("a wall jump is as strong as the charge", () => {
    const half = WallJumpVelocity({ x: 0, y: 0 }, wallA, 0.5);
    assert.equal(half.z, WALL_JUMP_UP_SPEED * 0.5);
    assert.equal(half.x, WALL_JUMP_PUSH_SPEED * 0.5);
    assert.equal(WallJumpChargeAfter(1), 1 - WALL_JUMP_CHARGE_COST);
    assert.equal(WallJumpChargeAfter(WALL_JUMP_CHARGE_COST / 2), 0, "never below empty");
});

test("the charge refills to full over WALL_JUMP_RECHARGE_SECONDS, and not beyond", () => {
    assert.equal(RechargeWallJump(0, WALL_JUMP_RECHARGE_SECONDS), 1);
    assert.equal(RechargeWallJump(0, WALL_JUMP_RECHARGE_SECONDS / 2), 0.5);
    assert.equal(RechargeWallJump(0.9, WALL_JUMP_RECHARGE_SECONDS), 1);
    assert.equal(RechargeWallJump(0.4, -1), 0.4, "time never runs backwards");
});
