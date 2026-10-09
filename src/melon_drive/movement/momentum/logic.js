// Momentum — repeatedly reaching the top speed raises it (MOMENTUM_* in
// movement/momentum/constants.js). Pure rule, no cs_script import; movement/driving/drive.js
// applies it (test/movement/momentum.test.mjs).
import { MAX_SPEED } from "../driving/constants.js";
import { PhysicsFactor } from "../../dev/physics-tuning-logic.js";
import {
    MOMENTUM_STEP,
    MOMENTUM_MAX_STEPS,
    MOMENTUM_HIT_WINDOW,
    MOMENTUM_REARM_DIP,
    MOMENTUM_MIN_SPEED,
} from "./constants.js";

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
 * The top speed with `momentum`'s steps (plain `baseMax` without any).
 * @param {MomentumState | undefined} momentum
 * @param {number} [baseMax] the top speed without steps — MAX_SPEED, or the tuned one (BaseMaxSpeed)
 */
export function MomentumMaxSpeed(momentum, baseMax = MAX_SPEED) {
    return baseMax * (1 + MOMENTUM_STEP * (momentum?.steps ?? 0));
}

/**
 * The top speed without momentum: MAX_SPEED, scaled by the physics page's
 * "Max Speed" (dev/physics-tuning.js, the same for every melon).
 */
export function BaseMaxSpeed() {
    return MAX_SPEED * PhysicsFactor("maxSpeed");
}

/**
 * A kart's current top speed: the base (BaseMaxSpeed) with its momentum
 * steps.
 * @param {{ momentum?: MomentumState }} kart
 */
export function KartMaxSpeed(kart) {
    return MomentumMaxSpeed(kart.momentum, BaseMaxSpeed());
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
 * @param {number} [baseMax] the top speed without steps (MomentumMaxSpeed)
 * @returns {MomentumState}
 */
export function UpdateMomentum(momentum, horizSpeed, now, boosted, baseMax = MAX_SPEED) {
    if (!momentum || horizSpeed < MOMENTUM_MIN_SPEED) {
        return NewMomentum();
    }
    if (boosted) {
        return { ...momentum, armed: false };
    }
    const max = MomentumMaxSpeed(momentum, baseMax);
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
