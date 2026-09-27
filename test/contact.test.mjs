// Ground/wall contact and wall-jump rules (logic/contact.js), asserted in
// terms of the constants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VerticalAccel, IsSupported, IsGrounded, CanGroundJump, CanWallJump, WallJumpVelocity, RechargeWallJump, WallJumpChargeAfter, StoppedByWall, InLiftoff } from "../src/melon_drive/logic/contact.js";
import {
    GRAVITY,
    FREE_FALL_FRACTION,
    GROUND_NORMAL_MIN_Z,
    WALL_JUMP_WINDOW,
    WALL_JUMP_COOLDOWN,
    WALL_JUMP_UP_SPEED,
    WALL_JUMP_PUSH_SPEED,
    WALL_JUMP_CHARGE_COST,
    WALL_JUMP_MIN_CHARGE,
    WALL_JUMP_RECHARGE_SECONDS,
    WALL_TOUCH_MIN_STOP_SPEED,
    GROUND_LIFTOFF_TIME,
    WALL_CONTACT_MIN_STOP,
} from "../src/melon_drive/constants.js";

const DT = 1 / 64;

test("free fall is not supported, whatever the height", () => {
    // Regression: "within 48 units of the floor" used to count as ground, so
    // a melon a little way into a jump could jump again.
    const falling = VerticalAccel(100, 100 - GRAVITY * DT, DT);
    assert.ok(Math.abs(falling + GRAVITY) < 1e-6);
    assert.equal(IsSupported(falling), false);
});

test("resting or rolling on the floor is supported", () => {
    assert.equal(IsSupported(VerticalAccel(0, 0, DT)), true);
    // a landing: the floor stops the fall abruptly
    assert.equal(IsSupported(VerticalAccel(-300, 0, DT)), true);
});

test("a slope that only partly cancels gravity still counts as support", () => {
    const partly = -GRAVITY * FREE_FALL_FRACTION * 0.5;
    assert.equal(IsSupported(partly), true);
    assert.equal(IsSupported(-GRAVITY * FREE_FALL_FRACTION), false);
});

test("grounded needs support by a floor-like surface", () => {
    assert.equal(IsGrounded(true, 1), true);
    assert.equal(IsGrounded(true, GROUND_NORMAL_MIN_Z), true);
    assert.equal(IsGrounded(true, GROUND_NORMAL_MIN_Z - 0.1), false, "held up by something steep = not ground");
    assert.equal(IsGrounded(true, undefined), false, "nothing underneath");
    assert.equal(IsGrounded(false, 1), false, "floor below, but falling freely = in the air");
});

const wallA = { x: 1, y: 0 };
const wallB = { x: -1, y: 0 };

test("wall jump: in the air, with a fresh wall contact", () => {
    assert.equal(CanWallJump({ now: 10, grounded: false, wallContact: { time: 10, normal: wallA }, charge: 1 }), true);
    assert.equal(CanWallJump({ now: 10 + WALL_JUMP_WINDOW, grounded: false, wallContact: { time: 10, normal: wallA }, charge: 1 }), true);
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

test("touching a wall: physics stopped the melon's speed into it", () => {
    const n = { x: -1, y: 0 }; // wall ahead in +x
    const into = WALL_TOUCH_MIN_STOP_SPEED * 4;
    assert.ok(StoppedByWall(n, { x: into, y: 50 }, { x: 0, y: 50 }), "stopped dead");
    assert.ok(StoppedByWall(n, { x: into, y: 0 }, { x: into * (1 - WALL_CONTACT_MIN_STOP), y: 0 }), "just enough stopped");
    assert.ok(!StoppedByWall(n, { x: into, y: 0 }, { x: into, y: 0 }), "still flying at it: near, not touching");
    assert.ok(!StoppedByWall(n, { x: -into, y: 0 }, { x: 0, y: 0 }), "moving away from it");
    assert.ok(!StoppedByWall(n, { x: WALL_TOUCH_MIN_STOP_SPEED / 2, y: 0 }, { x: 0, y: 0 }), "too slow to tell");
});

// Regression: flying almost parallel past a nearby wall, physics noise on
// the few units/sec heading into it counted as "stopped by the wall".
test("touching a wall: flying past it in parallel with a little noise isn't touching", () => {
    const n = { x: -1, y: 0 };
    const intoBefore = WALL_TOUCH_MIN_STOP_SPEED * 0.8;
    assert.ok(!StoppedByWall(n, { x: intoBefore, y: 600 }, { x: 0, y: 600 }));
});

test("liftoff: ground contact doesn't count right after a ground or wall jump", () => {
    assert.ok(InLiftoff(10, 10, undefined));
    assert.ok(InLiftoff(10 + GROUND_LIFTOFF_TIME / 2, undefined, 10));
    assert.ok(!InLiftoff(10 + GROUND_LIFTOFF_TIME, 10, undefined));
    assert.ok(!InLiftoff(10, undefined, undefined));
});
