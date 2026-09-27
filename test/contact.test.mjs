// Ground/wall contact and wall-jump rules (logic/contact.js), asserted in
// terms of the constants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VerticalAccel, IsSupported, IsGrounded, CanWallJump, WallJumpVelocity } from "../src/melon_drive/logic/contact.js";
import {
    GRAVITY,
    FREE_FALL_FRACTION,
    GROUND_NORMAL_MIN_Z,
    WALL_JUMP_WINDOW,
    WALL_JUMP_COOLDOWN,
    WALL_JUMP_UP_SPEED,
    WALL_JUMP_PUSH_SPEED,
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
    assert.equal(CanWallJump({ now: 10, grounded: false, wallContact: { time: 10, normal: wallA } }), true);
    assert.equal(CanWallJump({ now: 10 + WALL_JUMP_WINDOW, grounded: false, wallContact: { time: 10, normal: wallA } }), true);
});

test("wall jump: not on the ground, not without a wall, not after the window", () => {
    assert.equal(CanWallJump({ now: 10, grounded: true, wallContact: { time: 10, normal: wallA } }), false);
    assert.equal(CanWallJump({ now: 10, grounded: false }), false);
    assert.equal(CanWallJump({ now: 10 + WALL_JUMP_WINDOW + 0.01, grounded: false, wallContact: { time: 10, normal: wallA } }), false);
});

test("wall jump: can't climb the same wall forever", () => {
    const later = 10 + WALL_JUMP_COOLDOWN + 0.01;
    const s = { now: later, grounded: false, wallContact: { time: later, normal: wallA }, lastWallJump: { time: 10, normal: wallA } };
    assert.equal(CanWallJump(s), false, "same wall again");
    assert.equal(CanWallJump({ ...s, wallContact: { time: later, normal: wallB } }), true, "the opposite wall chains");
    assert.equal(CanWallJump({ ...s, lastGroundedTime: 10.1 }), true, "touched ground since — same wall is fine again");
});

test("wall jump: cooldown between two wall jumps", () => {
    const s = { now: 10 + WALL_JUMP_COOLDOWN / 2, grounded: false, wallContact: { time: 10.1, normal: wallB }, lastWallJump: { time: 10, normal: wallA } };
    assert.equal(CanWallJump(s), false);
});

test("wall jump velocity: pushes away from the wall and up, keeps speed along it", () => {
    // moving into the wall (normal +x) at -300, along it at +200
    const v = WallJumpVelocity({ x: -300, y: 200 }, wallA);
    assert.equal(v.x, WALL_JUMP_PUSH_SPEED);
    assert.equal(v.y, 200);
    assert.equal(v.z, WALL_JUMP_UP_SPEED);
});

test("wall jump velocity: an already faster push away (e.g. after a bounce) is kept", () => {
    const v = WallJumpVelocity({ x: WALL_JUMP_PUSH_SPEED + 400, y: 0 }, wallA);
    assert.equal(v.x, WALL_JUMP_PUSH_SPEED + 400);
});
