// Pure rule for the HUD's wall-jump dots — no cs_script import, so it's
// unit-testable in Node (see test/hud/jump-dots.test.mjs). Applied by
// UpdateJumpHud in ./speedometer.js.
import { JUMP_DOT_FILL_STEPS } from "../../constants/index.js";

/**
 * How full each jump dot is, in fill steps (0 = empty ..
 * JUMP_DOT_FILL_STEPS = charged): the first floor(charges) dots are
 * charged, the next one shows how far it has refilled (rounded down, so it
 * only looks full once it is), the rest are empty.
 * @param {number} charges wall jumps charged, fractional while one refills (see GetWallJumpCharges)
 * @param {number} dots how many dots there are (WALL_JUMP_CHARGES)
 * @returns {number[]}
 */
export function JumpDotFills(charges, dots) {
    const fills = [];
    for (let i = 0; i < dots; i++) {
        const part = Math.max(0, Math.min(1, charges - i));
        fills.push(Math.floor(part * JUMP_DOT_FILL_STEPS + 1e-9));
    }
    return fills;
}
