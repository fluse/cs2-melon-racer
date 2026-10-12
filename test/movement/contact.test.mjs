// Ground/wall contact rules (movement/contact/logic.js), asserted in terms
// of the constants. The jump rules built on them: test/movement/jump-logic.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VerticalAccel, IsSupported, IsGrounded, FloorPlaneDistance, FloorApproachSpeed, IsAtWall, WallContactReach, InLiftoff } from "../../src/melon_drive/movement/contact/logic.js";
import {
    GRAVITY,
    FREE_FALL_FRACTION,
    GROUND_NORMAL_MIN_Z,
    GROUND_CONTACT_DISTANCE,
    GROUND_MAX_APPROACH_SPEED,
    WALL_JUMP_CONTACT_RADIUS,
    WALL_JUMP_MAX_APPROACH_SPEED,
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
    const resting = 6.9; // a resting melon's center above the floor
    assert.equal(IsGrounded(true, 1, resting), true);
    assert.equal(IsGrounded(true, GROUND_NORMAL_MIN_Z, resting / GROUND_NORMAL_MIN_Z), true, "steepest slope: the floor below is further down");
    assert.equal(IsGrounded(true, GROUND_NORMAL_MIN_Z - 0.1, resting), false, "held up by something steep = not ground");
    assert.equal(IsGrounded(true, undefined, resting), false, "nothing underneath");
    assert.equal(IsGrounded(false, 1, resting), false, "floor below, but falling freely = in the air");
});

// Regression: the physics slows a falling melon a tick before it touches
// down; with the floor anywhere within the trace that counted as ground,
// and a well-timed (buffered) jump took off before the melon had landed.
test("support with the floor still a few units below isn't ground yet", () => {
    assert.equal(IsGrounded(true, 1, GROUND_CONTACT_DISTANCE), true);
    assert.equal(IsGrounded(true, 1, GROUND_CONTACT_DISTANCE + 1), false);
    assert.equal(IsGrounded(true, 1, 13), false, "~6 units above the floor");
    assert.equal(FloorPlaneDistance(10, 0.6), 6);
});

// The tick before the touchdown the physics slows the melon so it arrives
// exactly at the floor — still moving into it, unlike a melon on it.
test("still moving down onto the floor isn't ground yet", () => {
    const up = { x: 0, y: 0, z: 1 };
    const landing = FloorApproachSpeed({ x: 300, y: 0, z: -2 * 64 }, up); // 2 units left, arriving next tick
    assert.equal(IsGrounded(true, 1, 6.9 + 2, landing), false);
    assert.equal(IsGrounded(true, 1, 6.9, FloorApproachSpeed({ x: 300, y: 0, z: 0 }, up)), true, "rolling on it");
    assert.equal(IsGrounded(true, 1, 6.9, GROUND_MAX_APPROACH_SPEED), true);
    // Rolling down a 45° slope: moving down, but along it, not into it.
    const slope = { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 };
    const along = FloorApproachSpeed({ x: 300, y: 0, z: -300 }, slope);
    assert.ok(Math.abs(along) < 1e-9);
    assert.equal(IsGrounded(true, slope.z, 6.9 / slope.z, along), true);
});

test("at a wall: within WALL_JUMP_CONTACT_RADIUS of the center, standing still or moving along it", () => {
    const n = { x: -1, y: 0 }; // wall ahead in +x
    assert.ok(IsAtWall(WALL_JUMP_CONTACT_RADIUS, n, { x: 0, y: 0 }, DT), "right at the radius");
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS + 1, n, { x: 0, y: 0 }, DT), "just outside it");
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS + 1, n, { x: 0, y: 600 }, DT), "flying past in parallel doesn't widen it");
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS + 1 + 300 * DT, n, { x: -300, y: 0 }, DT), "moving away: only its last tick's travel");
});

// Regression: one tick's travel towards the wall used to be added, so a
// wall jump fired a tick before the melon reached the wall.
test("at a wall: still moving into it isn't the contact yet", () => {
    const n = { x: -1, y: 0 };
    const speed = 640;
    assert.equal(WallContactReach(speed, DT), WALL_JUMP_CONTACT_RADIUS, "moving at it: just the radius");
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS + speed * DT, n, { x: speed, y: 0 }, DT), "a tick away");
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS, n, { x: 2 * 64, y: 0 }, DT), "slowed to arrive next tick");
    assert.ok(IsAtWall(WALL_JUMP_CONTACT_RADIUS, n, { x: WALL_JUMP_MAX_APPROACH_SPEED, y: 0 }, DT));
});

// The wall stopped the melon and pushed it off within the tick: it was at
// the wall, it's just moved away since.
test("at a wall: pushed off it, last tick's travel away is added", () => {
    const n = { x: -1, y: 0 };
    const away = 200;
    assert.equal(WallContactReach(-away, DT), WALL_JUMP_CONTACT_RADIUS + away * DT);
    assert.ok(IsAtWall(WALL_JUMP_CONTACT_RADIUS + away * DT, n, { x: -away, y: 0 }, DT));
    assert.ok(!IsAtWall(WALL_JUMP_CONTACT_RADIUS + away * DT + 1, n, { x: -away, y: 0 }, DT));
});

test("liftoff: ground contact doesn't count right after a ground or wall jump", () => {
    assert.ok(InLiftoff(10, 10, undefined));
    assert.ok(InLiftoff(10 + GROUND_LIFTOFF_TIME / 2, undefined, 10));
    assert.ok(!InLiftoff(10 + GROUND_LIFTOFF_TIME, 10, undefined));
    assert.ok(!InLiftoff(10, undefined, undefined));
});
