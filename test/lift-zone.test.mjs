import { test } from "node:test";
import assert from "node:assert/strict";
import { BounceUpVelocity, WithMinSpeed } from "../src/melon_drive/movement/wall-bounce/logic.js";
import { LiftZoneUpSpeed, WallRules } from "../src/melon_drive/zones/lift/logic.js";
import {
    WALL_BOUNCE_UP_SPEED,
    WALL_JUMP_COOLDOWN,
    WALL_JUMP_WINDOW,
    LIFT_ZONE_UP_SPEED,
    LIFT_ZONE_MIN_BOUNCE_SPEED,
    LIFT_ZONE_WALL_JUMP_COOLDOWN,
    LIFT_ZONE_JUMP_BUFFER,
    LIFT_ZONE_WALL_JUMP_WINDOW,
    PERFECT_BOUNCE_UP_MULTIPLIER,
    BOUNCE_RATINGS,
} from "../src/melon_drive/constants/index.js";

test("bounce kick cancels a fall: the melon leaves at the kick's speed", () => {
    assert.equal(BounceUpVelocity(-300), WALL_BOUNCE_UP_SPEED);
    assert.equal(BounceUpVelocity(0, LIFT_ZONE_UP_SPEED), LIFT_ZONE_UP_SPEED);
});

// Regression: the kick was added on top of an upward speed, so chained
// bounces in a narrow shaft stacked it ever higher.
test("bounce kick doesn't add on top of a melon already rising", () => {
    assert.equal(BounceUpVelocity(100, LIFT_ZONE_UP_SPEED), LIFT_ZONE_UP_SPEED, "slower than the kick: raised to it");
    assert.equal(BounceUpVelocity(LIFT_ZONE_UP_SPEED + 100, LIFT_ZONE_UP_SPEED), LIFT_ZONE_UP_SPEED + 100, "faster: keeps its own speed");
});

test("a PERFECT bounce kicks PERFECT_BOUNCE_UP_MULTIPLIER harder, other ratings don't", () => {
    const perfect = BOUNCE_RATINGS[0].minAngleFactor;
    assert.equal(BounceUpVelocity(-300, WALL_BOUNCE_UP_SPEED, perfect), WALL_BOUNCE_UP_SPEED * PERFECT_BOUNCE_UP_MULTIPLIER);
    assert.equal(BounceUpVelocity(100, LIFT_ZONE_UP_SPEED, 1), LIFT_ZONE_UP_SPEED * PERFECT_BOUNCE_UP_MULTIPLIER);
    assert.equal(BounceUpVelocity(0, WALL_BOUNCE_UP_SPEED, BOUNCE_RATINGS[1].minAngleFactor), WALL_BOUNCE_UP_SPEED);
});

test("lift zone kick comes from a lift_zone_<speed> name, else the default", () => {
    assert.equal(LiftZoneUpSpeed("lift_zone_600"), 600);
    assert.equal(LiftZoneUpSpeed("lift_zone_512.5"), 512.5);
    assert.equal(LiftZoneUpSpeed("lift_zone_600 "), 600); // Hammer keeps stray trailing spaces
    assert.equal(LiftZoneUpSpeed("shaft_lift"), LIFT_ZONE_UP_SPEED);
});

test("min bounce speed: slower velocity scaled up, direction kept", () => {
    const out = WithMinSpeed({ x: -30, y: 40 }, LIFT_ZONE_MIN_BOUNCE_SPEED);
    assert.ok(Math.abs(Math.hypot(out.x, out.y) - LIFT_ZONE_MIN_BOUNCE_SPEED) < 1e-9);
    assert.ok(Math.abs(out.x / out.y - -30 / 40) < 1e-9);
});

test("min bounce speed: faster or zero velocity untouched", () => {
    const fast = { x: LIFT_ZONE_MIN_BOUNCE_SPEED * 2, y: 0 };
    assert.equal(WithMinSpeed(fast, LIFT_ZONE_MIN_BOUNCE_SPEED), fast);
    assert.deepEqual(WithMinSpeed({ x: 0, y: 0 }, LIFT_ZONE_MIN_BOUNCE_SPEED), { x: 0, y: 0 });
});

test("wall rules outside a lift zone: the normal bounce and wall jump", () => {
    assert.deepEqual(WallRules(undefined), {
        inLift: false,
        bounceUpSpeed: WALL_BOUNCE_UP_SPEED,
        minBounceSpeed: 0,
        wallJumpCooldown: WALL_JUMP_COOLDOWN,
        wallJumpWindow: WALL_JUMP_WINDOW,
        freeWallJumps: false,
        jumpBuffer: 0,
    });
});

test("wall rules in a lift zone: its kick, minimum bounce speed, free wall jumps, short cooldown, longer contact window, jump buffer", () => {
    assert.deepEqual(WallRules(LIFT_ZONE_UP_SPEED), {
        inLift: true,
        bounceUpSpeed: Math.max(WALL_BOUNCE_UP_SPEED, LIFT_ZONE_UP_SPEED),
        minBounceSpeed: LIFT_ZONE_MIN_BOUNCE_SPEED,
        wallJumpCooldown: LIFT_ZONE_WALL_JUMP_COOLDOWN,
        wallJumpWindow: LIFT_ZONE_WALL_JUMP_WINDOW,
        freeWallJumps: true,
        jumpBuffer: LIFT_ZONE_JUMP_BUFFER,
    });
});

test("a lift zone never kicks weaker than outside one", () => {
    assert.equal(WallRules(0).bounceUpSpeed, WALL_BOUNCE_UP_SPEED);
});
