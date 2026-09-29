// Momentum — repeatedly reaching the top speed raises it (MOMENTUM_* in
// constants/momentum.js). Pure rule, no cs_script import; physics/drive.js
// applies it (test/momentum.test.mjs).
import { MAX_SPEED } from "../constants/driving.js";
import {
    MOMENTUM_STEP,
    MOMENTUM_MAX_STEPS,
    MOMENTUM_HIT_WINDOW,
    MOMENTUM_REARM_DIP,
    MOMENTUM_MIN_SPEED,
} from "../constants/momentum.js";

// Reaching the cap exactly: the speed is clamped to it, so allow float noise.
const REACH_TOLERANCE = 0.5; // units/sec

/**
 * @typedef {{
 *   steps: number, // top-speed steps earned this run, 0..MOMENTUM_MAX_STEPS
 *   armed: boolean, // reaching the top speed now would count (it dipped below since the last time)
 *   lastHitTime?: number, // game time the top speed was last reached
 * }} MomentumState
 */

/** @returns {MomentumState} */
export function NewMomentum() {
    return { steps: 0, armed: true, lastHitTime: undefined };
}

/**
 * The top speed with `momentum`'s steps (plain MAX_SPEED without any).
 * @param {MomentumState | undefined} momentum
 */
export function MomentumMaxSpeed(momentum) {
    return MAX_SPEED * (1 + MOMENTUM_STEP * (momentum?.steps ?? 0));
}

/**
 * This tick's momentum. Below MOMENTUM_MIN_SPEED the run ends (reset).
 * While `boosted` (attack boost on, or the speed cap still raised by a
 * boost) nothing counts: no step, and reaching the top speed during/right
 * after a boost needs a real dip first. Otherwise reaching the top speed
 * after dipping MOMENTUM_REARM_DIP below it is a hit, and a hit within
 * MOMENTUM_HIT_WINDOW of the previous one adds a step.
 * @param {MomentumState | undefined} momentum @param {number} horizSpeed the melon's horizontal speed this tick (after the cap)
 * @param {number} now game time @param {boolean} boosted
 * @returns {MomentumState}
 */
export function UpdateMomentum(momentum, horizSpeed, now, boosted) {
    if (!momentum || horizSpeed < MOMENTUM_MIN_SPEED) {
        return NewMomentum();
    }
    if (boosted) {
        return { ...momentum, armed: false };
    }
    const max = MomentumMaxSpeed(momentum);
    if (horizSpeed < max * (1 - MOMENTUM_REARM_DIP)) {
        return momentum.armed ? momentum : { ...momentum, armed: true };
    }
    if (!momentum.armed || horizSpeed < max - REACH_TOLERANCE) {
        return momentum;
    }
    const chained = momentum.lastHitTime !== undefined && now - momentum.lastHitTime <= MOMENTUM_HIT_WINDOW;
    const steps = chained ? Math.min(momentum.steps + 1, MOMENTUM_MAX_STEPS) : momentum.steps;
    return { steps, armed: false, lastHitTime: now };
}
