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
 * The inputs that start a bouncer: held upright at once (a swing Hammer
 * started already is stopped), then the swing loop after `delay` — the
 * swing starts from upright, so there's no jump.
 * @param {number} delay
 * @returns {{ input: string, value: string, delay: number }[]}
 */
export function BouncerStartInputs(delay) {
    return [
        { input: "SetIdleAnimationLooping", value: BOUNCER_IDLE_ANIMATION, delay: 0 },
        { input: "SetAnimationLooping", value: BOUNCER_IDLE_ANIMATION, delay: 0 },
        { input: "SetIdleAnimationLooping", value: BOUNCER_SWING_ANIMATION, delay },
        { input: "SetAnimationLooping", value: BOUNCER_SWING_ANIMATION, delay },
    ];
}
