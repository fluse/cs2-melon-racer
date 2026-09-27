// These assert the *rules* of the wall bounce (45° is best, a perfect jump
// helps, a perfect bounce is free, ...) in terms of the constants, not
// their current values — so retuning constants.js doesn't break them, but
// changing how the math works does.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    WallAngleFactor,
    GetBounceRating,
    JumpTimingFactor,
    JumpMultiplier,
    PickIncomingVelocity,
    ReflectOffWall,
    WallBounceDamage,
} from "../src/melon_drive/logic/wall-bounce.js";
import {
    WALL_BOUNCE_OPTIMAL_ANGLE,
    WALL_BOUNCE_ANGLE_FALLOFF,
    WALL_BOUNCE_BASE_RESTITUTION,
    WALL_BOUNCE_PEAK_MULTIPLIER,
    WALL_BOUNCE_PERFECT_JUMP_WINDOW,
    WALL_BOUNCE_PERFECT_JUMP_MULTIPLIER,
    WALL_IMPACT_DAMAGE_THRESHOLD,
    BOUNCE_RATINGS,
} from "../src/melon_drive/constants.js";

const EPS = 1e-9;
/** @param {number} a @param {number} b */
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, msg ?? `${a} != ${b}`);

// Wall facing +x (the melon hits it while moving in -x).
const WALL = { x: 1, y: 0 };
/** Velocity of the given speed hitting WALL at `angle` degrees from its normal. */
function Incoming(speed, angle) {
    const r = (angle * Math.PI) / 180;
    return { x: -Math.cos(r) * speed, y: Math.sin(r) * speed };
}

test("angle factor peaks at the optimal angle and fades out symmetrically", () => {
    assert.equal(WallAngleFactor(WALL_BOUNCE_OPTIMAL_ANGLE), 1);
    near(WallAngleFactor(WALL_BOUNCE_OPTIMAL_ANGLE - WALL_BOUNCE_ANGLE_FALLOFF), 0);
    near(WallAngleFactor(WALL_BOUNCE_OPTIMAL_ANGLE + WALL_BOUNCE_ANGLE_FALLOFF), 0);
    near(WallAngleFactor(WALL_BOUNCE_OPTIMAL_ANGLE - 10), WallAngleFactor(WALL_BOUNCE_OPTIMAL_ANGLE + 10));
    assert.ok(WallAngleFactor(WALL_BOUNCE_OPTIMAL_ANGLE + 5) > WallAngleFactor(WALL_BOUNCE_OPTIMAL_ANGLE + 15));
    assert.equal(WallAngleFactor(WALL_BOUNCE_OPTIMAL_ANGLE + WALL_BOUNCE_ANGLE_FALLOFF * 2), 0, "never negative");
});

test("bounce ratings: best rating at a perfect angle, worst at none", () => {
    assert.equal(GetBounceRating(1), BOUNCE_RATINGS[0]);
    assert.equal(GetBounceRating(0), BOUNCE_RATINGS[BOUNCE_RATINGS.length - 1]);
    for (let i = 1; i < BOUNCE_RATINGS.length; i++) {
        assert.ok(
            BOUNCE_RATINGS[i - 1].minAngleFactor > BOUNCE_RATINGS[i].minAngleFactor,
            "BOUNCE_RATINGS must be sorted best-first, or GetBounceRating picks the wrong one"
        );
    }
});

test("jump timing: perfect on the same tick, zero at the window edge, before or after", () => {
    assert.equal(JumpTimingFactor(0), 1);
    near(JumpTimingFactor(WALL_BOUNCE_PERFECT_JUMP_WINDOW), 0);
    near(JumpTimingFactor(-WALL_BOUNCE_PERFECT_JUMP_WINDOW), 0);
    assert.equal(JumpTimingFactor(WALL_BOUNCE_PERFECT_JUMP_WINDOW * 3), 0, "never negative");
    assert.equal(JumpMultiplier(0), 1);
    near(JumpMultiplier(1), WALL_BOUNCE_PERFECT_JUMP_MULTIPLIER);
});

test("moving away from or along the wall doesn't bounce", () => {
    assert.equal(ReflectOffWall({ x: 100, y: 0 }, WALL, 0), null);
    assert.equal(ReflectOffWall({ x: 0, y: 100 }, WALL, 0), null);
    assert.equal(ReflectOffWall({ x: 0, y: 0 }, WALL, 0), null);
});

test("a bounce reflects off the wall: away from it, same side along it", () => {
    const b = ReflectOffWall(Incoming(500, 30), WALL, 0);
    assert.ok(b);
    near(b.angle, 30);
    assert.ok(b.velocity.x > 0, "should head away from the wall");
    assert.ok(b.velocity.y > 0, "should keep its direction along the wall");
    // Mirror image: outgoing angle to the normal equals the incoming one.
    near((Math.atan2(b.velocity.y, b.velocity.x) * 180) / Math.PI, 30);
});

test("a perfect-angle bounce comes out at the peak multiplier", () => {
    const speed = 500;
    const b = ReflectOffWall(Incoming(speed, WALL_BOUNCE_OPTIMAL_ANGLE), WALL, 0);
    assert.ok(b);
    near(b.angleFactor, 1);
    near(Math.hypot(b.velocity.x, b.velocity.y), speed * WALL_BOUNCE_PEAK_MULTIPLIER);
    near(b.speedGain, Math.max(0, speed * WALL_BOUNCE_PEAK_MULTIPLIER - speed));
});

test("a bounce with no angle bonus comes out at base restitution", () => {
    const speed = 500;
    const worstAngle = Math.min(89, WALL_BOUNCE_OPTIMAL_ANGLE + WALL_BOUNCE_ANGLE_FALLOFF);
    const b = ReflectOffWall(Incoming(speed, worstAngle), WALL, 0);
    assert.ok(b);
    const expected = speed * (WALL_BOUNCE_BASE_RESTITUTION + (WALL_BOUNCE_PEAK_MULTIPLIER - WALL_BOUNCE_BASE_RESTITUTION) * b.angleFactor);
    near(Math.hypot(b.velocity.x, b.velocity.y), expected);
});

test("a perfectly timed jump multiplies the bounce speed", () => {
    const v = Incoming(500, 40);
    const plain = ReflectOffWall(v, WALL, 0);
    const jumped = ReflectOffWall(v, WALL, 1);
    assert.ok(plain && jumped);
    near(
        Math.hypot(jumped.velocity.x, jumped.velocity.y),
        Math.hypot(plain.velocity.x, plain.velocity.y) * WALL_BOUNCE_PERFECT_JUMP_MULTIPLIER
    );
});

test("incoming velocity: picks whichever of the last two ticks heads more squarely into the wall", () => {
    const square = { x: -100, y: 0 };
    const deflected = { x: -10, y: 100 };
    assert.equal(PickIncomingVelocity(deflected, square, WALL), square);
    assert.equal(PickIncomingVelocity(square, deflected, WALL), square);
    assert.equal(PickIncomingVelocity(deflected, undefined, WALL), deflected);
});

test("damage: a perfect angle is free, no angle bonus pays full price", () => {
    const impact = WALL_IMPACT_DAMAGE_THRESHOLD + 500;
    const perfect = WallBounceDamage(impact, 300, 1);
    near(perfect, 0);
    const sloppy = WallBounceDamage(impact, 300, 0);
    assert.ok(sloppy > EPS);
    const halfway = WallBounceDamage(impact, 300, 0.5);
    near(halfway, sloppy / 2);
});

test("damage: everything rated as the best rating (PERFECT) is free", () => {
    const impact = WALL_IMPACT_DAMAGE_THRESHOLD + 500;
    near(WallBounceDamage(impact, 300, BOUNCE_RATINGS[0].minAngleFactor), 0);
    assert.ok(WallBounceDamage(impact, 300, BOUNCE_RATINGS[0].minAngleFactor - 0.01) > EPS, "just below PERFECT still costs");
});

test("damage: a soft hit that gained no speed costs nothing", () => {
    near(WallBounceDamage(WALL_IMPACT_DAMAGE_THRESHOLD - 1, 0, 0), 0);
});
