// The HUD's wall-jump dots (hud/speedometer/logic.js), asserted in terms of
// the constants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JumpDotFills } from "../../src/melon_drive/hud/speedometer/logic.js";
import { JUMP_DOT_FILL_STEPS, WALL_JUMP_CHARGES } from "../../src/melon_drive/constants/index.js";

const N = WALL_JUMP_CHARGES;
const FULL = JUMP_DOT_FILL_STEPS;

test("all charged: every dot full; none: every dot empty", () => {
    assert.deepEqual(JumpDotFills(N, N), Array(N).fill(FULL));
    assert.deepEqual(JumpDotFills(0, N), Array(N).fill(0));
});

test("the dot refilling shows its progress, the ones after it stay empty", () => {
    const fills = JumpDotFills(1.5, N);
    assert.equal(fills[0], FULL);
    assert.equal(fills[1], Math.floor(FULL / 2));
    assert.ok(fills.slice(2).every((f) => f === 0));
});

test("a dot only looks charged once it is", () => {
    assert.ok(JumpDotFills(0.999, N)[0] < FULL);
    assert.equal(JumpDotFills(1, N)[0], FULL);
});

// (The dots' panels and CSS, and UpdateJumpHud: test/hud/health-gauge.test.mjs.)
