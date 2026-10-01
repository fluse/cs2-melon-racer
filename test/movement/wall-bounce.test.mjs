// These assert the *rules* of the wall bounce (45° is best, a perfect jump
// helps, a perfect bounce is free, ...) in terms of the constants, not
// their current values — so retuning constants/ doesn't break them, but
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
    IsWallContact,
    WallTimingPress,
} from "../../src/melon_drive/movement/wall-bounce/logic.js";
import {
    WALL_BOUNCE_OPTIMAL_ANGLE,
    PERFECT_BOUNCE_TOLERANCE,
    WALL_CONTACT_DISTANCE,
    WALL_CONTACT_MIN_STOP,
    WALL_BOUNCE_ANGLE_FALLOFF,
    WALL_BOUNCE_PERFECT_JUMP_WINDOW,
    WALL_BOUNCE_PERFECT_JUMP_MULTIPLIER,
    WALL_IMPACT_DAMAGE_THRESHOLD,
    BOUNCE_RATINGS,
    WALL_TIMING_SPAM_LOCKOUT,
} from "../../src/melon_drive/constants/index.js";

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

test("a perfect-angle bounce comes out at the best rating's multiplier", () => {
    const speed = 500;
    const b = ReflectOffWall(Incoming(speed, WALL_BOUNCE_OPTIMAL_ANGLE), WALL, 0);
    assert.ok(b);
    near(b.angleFactor, 1);
    const m = BOUNCE_RATINGS[0].speedMultiplier;
    near(Math.hypot(b.velocity.x, b.velocity.y), speed * m);
    near(b.speedGain, Math.max(0, speed * m - speed));
});

test("every bounce comes out at its rating's speed multiplier", () => {
    const speed = 500;
    for (let angle = 1; angle < 90; angle += 1) {
        const b = ReflectOffWall(Incoming(speed, angle), WALL, 0);
        assert.ok(b);
        const m = GetBounceRating(b.angleFactor).speedMultiplier;
        near(Math.hypot(b.velocity.x, b.velocity.y), speed * m, `angle ${angle}`);
    }
});

test("ratings are sorted: a better rating is never slower", () => {
    for (let i = 1; i < BOUNCE_RATINGS.length; i++) {
        assert.ok(BOUNCE_RATINGS[i - 1].speedMultiplier >= BOUNCE_RATINGS[i].speedMultiplier);
    }
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

// --- IsWallContact: only a wall the melon actually touches bounces it ---
// Wall along the y axis at x = 0, facing +x; the melon approaches from +x.
const wallNormal = { x: 1, y: 0 };
const wallHit = { x: 0, y: 0 };
const into45 = { x: -Math.SQRT1_2 * 800, y: Math.SQRT1_2 * 800 };

test("contact: a melon touching the wall that stopped its into-wall speed counts", () => {
    const origin = { x: WALL_CONTACT_DISTANCE / 2, y: 0 };
    const stopped = { x: 0, y: into45.y }; // normal part gone, tangential kept
    assert.equal(IsWallContact(origin, wallHit, wallNormal, into45, stopped), true);
});

// Regression: in a small room the ray found a wall far ahead on every hard
// landing, and the melon bounced off it in mid-air.
test("contact: a wall further away than WALL_CONTACT_DISTANCE never counts", () => {
    const origin = { x: WALL_CONTACT_DISTANCE + 50, y: 0 };
    const stopped = { x: 0, y: into45.y };
    assert.equal(IsWallContact(origin, wallHit, wallNormal, into45, stopped), false);
});

test("contact: a landing next to a wall (horizontal speed untouched) doesn't count", () => {
    const origin = { x: WALL_CONTACT_DISTANCE / 2, y: 0 };
    assert.equal(IsWallContact(origin, wallHit, wallNormal, into45, { ...into45 }), false);
});

test("contact: friction that took off less than WALL_CONTACT_MIN_STOP doesn't count", () => {
    const origin = { x: WALL_CONTACT_DISTANCE / 2, y: 0 };
    const slowed = { x: into45.x * (1 - WALL_CONTACT_MIN_STOP * 0.5), y: into45.y };
    assert.equal(IsWallContact(origin, wallHit, wallNormal, into45, slowed), false);
});

test("contact: a melon moving away from the wall doesn't count", () => {
    const origin = { x: WALL_CONTACT_DISTANCE / 2, y: 0 };
    const away = { x: 400, y: 0 };
    assert.equal(IsWallContact(origin, wallHit, wallNormal, away, { x: 0, y: 0 }), false);
});

test("rating: PERFECT holds exactly within PERFECT_BOUNCE_TOLERANCE of the optimal angle", () => {
    const edge = WALL_BOUNCE_OPTIMAL_ANGLE + PERFECT_BOUNCE_TOLERANCE;
    assert.equal(GetBounceRating(WallAngleFactor(edge - 0.01)), BOUNCE_RATINGS[0]);
    assert.equal(GetBounceRating(WallAngleFactor(WALL_BOUNCE_OPTIMAL_ANGLE - PERFECT_BOUNCE_TOLERANCE + 0.01)), BOUNCE_RATINGS[0]);
    assert.notEqual(GetBounceRating(WallAngleFactor(edge + 0.01)), BOUNCE_RATINGS[0]);
});

test("timing press: a first press counts", () => {
    assert.deepEqual(WallTimingPress(10, undefined, undefined), { counts: true, mashing: false, lockedUntil: undefined });
});

test("timing press: soon after a press that did nothing it's mashing, and locks timing credit", () => {
    const press = WallTimingPress(10, 10 - WALL_TIMING_SPAM_LOCKOUT / 2, undefined);
    assert.equal(press.counts, false);
    assert.equal(press.mashing, true);
    assert.equal(press.lockedUntil, 10 + WALL_TIMING_SPAM_LOCKOUT);
    assert.equal(WallTimingPress(10 + WALL_TIMING_SPAM_LOCKOUT / 2, undefined, press.lockedUntil).counts, false, "still locked");
    assert.equal(WallTimingPress(10 + WALL_TIMING_SPAM_LOCKOUT, undefined, press.lockedUntil).counts, true, "lock over");
});

test("timing press: an idle press longer ago than the lockout doesn't count against it", () => {
    assert.equal(WallTimingPress(10, 10 - WALL_TIMING_SPAM_LOCKOUT, undefined).counts, true);
});
