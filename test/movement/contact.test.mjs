// Ground/wall contact rules (movement/contact/logic.js), asserted in terms
// of the constants. The jump rules built on them: test/movement/jump-logic.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VerticalAccel, IsSupported, IsGrounded, IsAtWall, WallContactReach, InLiftoff } from "../../src/melon_drive/movement/contact/logic.js";
import {
    GRAVITY,
    FREE_FALL_FRACTION,
    GROUND_NORMAL_MIN_Z,
    WALL_JUMP_CONTACT_RADIUS,
    GROUND_LIFTOFF_TIME,
} from "../../src/melon_drive/constants/index.js";

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

test("at a wall: within WALL_JUMP_CONTACT_RADIUS of the center, standing still or moving along it", () => {
    const n = { x: -1, y: 0 }; // wall ahead in +x
    assert.ok(IsAtWall(WALL_JUMP_CONTACT_RADIUS, n, { x: 0, y: 0 }, DT), "right at the radius");
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS + 1, n, { x: 0, y: 0 }, DT), "just outside it");
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS + 1, n, { x: 0, y: 600 }, DT), "flying past in parallel doesn't widen it");
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS + 1, n, { x: -300, y: 0 }, DT), "moving away doesn't either");
});

// At speed the melon covers more than the radius between two ticks — a
// wall it reaches within the next tick already counts.
test("at a wall: moving at it, one tick's travel is added", () => {
    const n = { x: -1, y: 0 };
    const speed = 640;
    assert.equal(WallContactReach(speed, DT), WALL_JUMP_CONTACT_RADIUS + speed * DT);
    assert.ok(IsAtWall(WALL_JUMP_CONTACT_RADIUS + speed * DT, n, { x: speed, y: 0 }, DT));
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS + speed * DT + 1, n, { x: speed, y: 0 }, DT));
    assert.equal(WallContactReach(-speed, DT), WALL_JUMP_CONTACT_RADIUS, "moving away: just the radius");
});

test("liftoff: ground contact doesn't count right after a ground or wall jump", () => {
    assert.ok(InLiftoff(10, 10, undefined));
    assert.ok(InLiftoff(10 + GROUND_LIFTOFF_TIME / 2, undefined, 10));
    assert.ok(!InLiftoff(10 + GROUND_LIFTOFF_TIME, 10, undefined));
    assert.ok(!InLiftoff(10, undefined, undefined));
});
