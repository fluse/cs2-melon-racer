// Bouncers (BOUNCER_* in world/bouncer/constants.js). Pure rules, no
// cs_script import; world/bouncer/bouncer.js applies them
// (test/world/bouncer.test.mjs).
import { BOUNCER_MODEL, BOUNCER_SWING_SECONDS, BOUNCER_SWING_ANIMATION, BOUNCER_IDLE_ANIMATION } from "./constants.js";

/** Lower case, "/" for "\", no compiled "_c" suffix. @param {string} model */
function NormalizeModel(model) {
    return model.toLowerCase().replace(/\\/g, "/").replace(/_c$/, "");
}

/** Whether an entity with this model is a bouncer. @param {string} model */
export function IsBouncerModel(model) {
    return NormalizeModel(model).endsWith(BOUNCER_MODEL);
}

/**
 * Seconds a bouncer waits before its swing starts, from a random number in
 * [0, 1): anywhere within one swing, so every phase is equally likely.
 * @param {number} random
 */
export function BouncerStartDelay(random) {
    return Math.min(Math.max(random, 0), 1) * BOUNCER_SWING_SECONDS;
}

/**
 * The inputs that hold a bouncer upright (a swing Hammer started already is
 * stopped) until its start: sent when it's found.
 * @returns {[string, string][]} [input, value]
 */
export function BouncerHoldInputs() {
    return [["SetIdleAnimationLooping", BOUNCER_IDLE_ANIMATION], ["SetAnimationLooping", BOUNCER_IDLE_ANIMATION]];
}

/**
 * The inputs that start its swing loop, sent once its start time has come —
 * by the script's own clock, not as delayed inputs (those all came at once
 * in-game: every bouncer swung in step). The swing starts from upright, so
 * there's no jump.
 * @returns {[string, string][]} [input, value]
 */
export function BouncerSwingInputs() {
    return [["SetIdleAnimationLooping", BOUNCER_SWING_ANIMATION], ["SetAnimationLooping", BOUNCER_SWING_ANIMATION]];
}
