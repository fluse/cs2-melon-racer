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
    WALL_JUMP_CHARGES,
    WALL_JUMP_RECHARGE_SECONDS,
} from "../../src/melon_drive/constants/index.js";

const wallA = { x: 1, y: 0 };
const wallB = { x: -1, y: 0 };

test("wall jump: in the air, with a fresh wall contact", () => {
    assert.equal(CanWallJump({ now: 10, grounded: false, wallContact: { time: 10, normal: wallA }, charge: WALL_JUMP_CHARGES }), true);
    // (from 0: 10 + WALL_JUMP_WINDOW - 10 isn't exactly WALL_JUMP_WINDOW in floating point)
    assert.equal(CanWallJump({ now: WALL_JUMP_WINDOW, grounded: false, wallContact: { time: 0, normal: wallA }, charge: WALL_JUMP_CHARGES }), true);
});

test("wall jump: a longer window (lift zones) keeps the contact jumpable longer", () => {
    const s = { now: 10 + WALL_JUMP_WINDOW * 3, grounded: false, wallContact: { time: 10, normal: wallA }, charge: WALL_JUMP_CHARGES };
    assert.equal(CanWallJump(s), false);
    assert.equal(CanWallJump({ ...s, window: WALL_JUMP_WINDOW * 4 }), true);
});

test("wall jump: not on the ground, not without a wall, not after the window", () => {
    assert.equal(CanWallJump({ now: 10, grounded: true, wallContact: { time: 10, normal: wallA }, charge: WALL_JUMP_CHARGES }), false);
    assert.equal(CanWallJump({ now: 10, grounded: false, charge: WALL_JUMP_CHARGES }), false);
    assert.equal(CanWallJump({ now: 10 + WALL_JUMP_WINDOW + 0.01, grounded: false, wallContact: { time: 10, normal: wallA }, charge: WALL_JUMP_CHARGES }), false);
});

test("wall jump: can't climb the same wall forever", () => {
    const later = 10 + WALL_JUMP_COOLDOWN + 0.01;
    const s = { now: later, grounded: false, wallContact: { time: later, normal: wallA }, lastWallJump: { time: 10, normal: wallA }, charge: WALL_JUMP_CHARGES };
    assert.equal(CanWallJump(s), false, "same wall again");
    assert.equal(CanWallJump({ ...s, wallContact: { time: later, normal: wallB } }), true, "the opposite wall chains");
    assert.equal(CanWallJump({ ...s, lastGroundedTime: 10.1 }), true, "touched ground since — same wall is fine again");
});

test("wall jump: cooldown between two wall jumps", () => {
    const s = { now: 10 + WALL_JUMP_COOLDOWN / 2, grounded: false, wallContact: { time: 10.1, normal: wallB }, lastWallJump: { time: 10, normal: wallA }, charge: WALL_JUMP_CHARGES };
    assert.equal(CanWallJump(s), false);
});

test("wall jump: not while a wall bounce's jump-timing window is open", () => {
    const s = { now: 10, grounded: false, wallContact: { time: 10, normal: wallA }, charge: WALL_JUMP_CHARGES };
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

// Chained wall jumps: WALL_JUMP_CHARGES of them, each full strength, then
// none until one has refilled.
test("WALL_JUMP_CHARGES wall jumps in a row, each full strength, then none", () => {
    let charge = WALL_JUMP_CHARGES;
    let jumps = 0;
    while (CanWallJump({ now: 10, grounded: false, wallContact: { time: 10, normal: wallA }, charge })) {
        const v = WallJumpVelocity({ x: 0, y: 0 }, wallA);
        assert.equal(v.z, WALL_JUMP_UP_SPEED, `jump ${jumps + 1} full strength up`);
        assert.equal(v.x, WALL_JUMP_PUSH_SPEED, `jump ${jumps + 1} full strength off the wall`);
        charge = WallJumpChargeAfter(charge);
        jumps++;
        assert.ok(jumps < 100, "must run out");
    }
    assert.equal(jumps, WALL_JUMP_CHARGES);
    assert.equal(CanWallJump({ now: 10, grounded: false, wallContact: { time: 10, normal: wallA }, charge: 0.99 }), false, "a charge still refilling doesn't count");
});

test("a wall jump uses up one whole charge; the one refilling keeps its progress", () => {
    assert.equal(WallJumpChargeAfter(WALL_JUMP_CHARGES), WALL_JUMP_CHARGES - 1);
    assert.equal(WallJumpChargeAfter(1.5), 0.5);
    assert.equal(WallJumpChargeAfter(0.5), 0, "never below empty");
});

test("charges refill one after the other, WALL_JUMP_RECHARGE_SECONDS each, and not beyond WALL_JUMP_CHARGES", () => {
    assert.equal(RechargeWallJump(0, WALL_JUMP_RECHARGE_SECONDS), 1);
    assert.equal(RechargeWallJump(0, WALL_JUMP_RECHARGE_SECONDS / 2), 0.5);
    assert.equal(RechargeWallJump(0, WALL_JUMP_RECHARGE_SECONDS * WALL_JUMP_CHARGES), WALL_JUMP_CHARGES, "empty -> full");
    assert.equal(RechargeWallJump(WALL_JUMP_CHARGES - 0.1, WALL_JUMP_RECHARGE_SECONDS), WALL_JUMP_CHARGES);
    assert.equal(RechargeWallJump(0.4, -1), 0.4, "time never runs backwards");
});

test("wall jump angle: rated like a bounce from the most head-on of the velocities", async () => {
    const { WallJumpAngle } = await import("../../src/melon_drive/movement/jump/logic.js");
    const { BOUNCE_RATINGS, WALL_BOUNCE_OPTIMAL_ANGLE } = await import("../../src/melon_drive/constants/index.js");
    const rad = (WALL_BOUNCE_OPTIMAL_ANGLE * Math.PI) / 180;
    // stopped against the wall now (only along it), but came in at the optimal angle last tick
    const r = WallJumpAngle([{ x: 0, y: 200 }, { x: -Math.cos(rad) * 200, y: Math.sin(rad) * 200 }, undefined], wallA);
    assert.ok(Math.abs(r.angle - WALL_BOUNCE_OPTIMAL_ANGLE) < 1e-6);
    assert.equal(r.rating, BOUNCE_RATINGS[0]);
    const head = WallJumpAngle([{ x: -200, y: 0 }], wallA);
    assert.equal(head.angle, 0);
    assert.equal(head.rating, BOUNCE_RATINGS[BOUNCE_RATINGS.length - 1]);
    assert.equal(WallJumpAngle([{ x: 0, y: 200 }, { x: 100, y: 0 }], wallA).angle, 90, "nothing heading into the wall: grazing");
});

test("wall jump rating: PERFECT speeds it up and kicks harder, the lowest rating changes nothing", async () => {
    const { WallJumpRatingMultipliers } = await import("../../src/melon_drive/movement/jump/logic.js");
    const { BOUNCE_RATINGS, WALL_JUMP_RATING_SPEED_MULTIPLIER, WALL_JUMP_PERFECT_UP_MULTIPLIER } = await import("../../src/melon_drive/constants/index.js");
    const perfect = WallJumpRatingMultipliers(BOUNCE_RATINGS[0]);
    assert.equal(perfect.speed, WALL_JUMP_RATING_SPEED_MULTIPLIER.PERFECT);
    assert.equal(perfect.up, WALL_JUMP_PERFECT_UP_MULTIPLIER);
    for (const r of BOUNCE_RATINGS) {
        assert.ok(WallJumpRatingMultipliers(r).speed >= 1, `${r.label}: no penalty`);
    }
    assert.equal(WallJumpRatingMultipliers(BOUNCE_RATINGS[1]).up, 1, "only PERFECT kicks harder");
});

test("rated wall jump boost: leaves with the incoming speed × multiplier, in the wall jump's direction", async () => {
    const { WallJumpBoostedVelocity } = await import("../../src/melon_drive/movement/jump/logic.js");
    const { MAX_SPEED, WALL_JUMP_RATING_SPEED_MULTIPLIER } = await import("../../src/melon_drive/constants/index.js");
    const m = WALL_JUMP_RATING_SPEED_MULTIPLIER.PERFECT;
    const jump = { x: WALL_JUMP_PUSH_SPEED, y: MAX_SPEED / 2 }; // what's left after the wall stopped it
    const out = WallJumpBoostedVelocity(jump, MAX_SPEED, m);
    assert.ok(Math.abs(Math.hypot(out.x, out.y) - MAX_SPEED * m) < 1e-6, "full incoming speed × multiplier");
    assert.ok(Math.abs(out.y / out.x - jump.y / jump.x) < 1e-9, "same direction as the plain wall jump");
    const slow = WallJumpBoostedVelocity(jump, 10, m);
    assert.ok(Math.abs(Math.hypot(slow.x, slow.y) - Math.hypot(jump.x, jump.y) * m) < 1e-6, "never slower than the plain jump × multiplier");
    assert.deepEqual(WallJumpBoostedVelocity(jump, MAX_SPEED, 1), jump, "no bonus: plain wall jump");
});

test("wall approach: remembered from the contact's start, while the contact goes on", async () => {
    const { WallApproach, FreshApproach } = await import("../../src/melon_drive/movement/jump/logic.js");
    const { WALL_JUMP_APPROACH_MEMORY } = await import("../../src/melon_drive/constants/index.js");
    const n = { x: -1, y: 0 }; // wall at +x
    const diagonal = { x: 100, y: 100 };
    const slide = { x: 0, y: 140 };
    const start = WallApproach(undefined, 10, n, [diagonal, undefined, undefined]);
    assert.deepEqual(start, { approach: diagonal, approachTime: 10 });
    // a tick later: stopped against the wall, only sliding — the approach stays
    const later = WallApproach({ time: 10, normal: n, ...start }, 10 + WALL_JUMP_WINDOW / 2, n, [slide, slide, undefined]);
    assert.deepEqual(later, { approach: diagonal, approachTime: 10 });
    assert.deepEqual(FreshApproach(later, 10 + WALL_JUMP_APPROACH_MEMORY / 2), diagonal);
    assert.equal(FreshApproach(later, 10 + WALL_JUMP_APPROACH_MEMORY * 2), undefined, "too old to count");
    // contact lost for longer than WALL_JUMP_WINDOW: a new contact, a new approach
    const fresh = WallApproach({ time: 10, normal: n, ...start }, 10 + WALL_JUMP_WINDOW * 3, n, [slide]);
    assert.deepEqual(fresh, { approach: undefined, approachTime: 10 + WALL_JUMP_WINDOW * 3 });
});
