import { Instance } from "cs_script/point_script";

// Every kart's prediction-line dot entities (see fx/prediction/prediction.js). They sit
// right on the melon's line of travel, so a trace along it — the prediction
// line's own, or the wall bounce's — would otherwise hit the first dot
// instead of the actual wall if the dot template's entity is solid for
// traces (e.g. a func_brush left at its default solidity). Entity variables
// are reference-stable, so a Set lookup on trace.hitEntity works.
/** @type {Set<any>} */
export const predictionDotSet = new Set();

const MAX_DOT_SKIPS = 4;

/**
 * Runs a trace, and if it hit a prediction dot, re-runs it with that dot
 * added to ignoreEntity — up to MAX_DOT_SKIPS times, after which it's
 * reported as a miss rather than as a (bogus) hit on a dot.
 * @template {{ ignoreEntity?: any }} C
 * @param {(config: C) => any} traceFn @param {C} config
 */
function SkipDots(traceFn, config) {
    let current = config;
    for (let i = 0; i <= MAX_DOT_SKIPS; i++) {
        const result = traceFn(current);
        if (!result.didHit || !result.hitEntity || !predictionDotSet.has(result.hitEntity)) {
            return result;
        }
        const ignored = current.ignoreEntity === undefined ? [] : [].concat(current.ignoreEntity);
        current = { ...current, ignoreEntity: [...ignored, result.hitEntity] };
    }
    return { ...traceFn(current), didHit: false };
}

/** Instance.TraceLine, but never stops on a prediction dot. @param {Parameters<typeof Instance.TraceLine>[0]} config */
export function TraceLine(config) {
    return SkipDots((c) => Instance.TraceLine(c), config);
}

/** Instance.TraceSphere, but never stops on a prediction dot. @param {Parameters<typeof Instance.TraceSphere>[0]} config */
export function TraceSphere(config) {
    return SkipDots((c) => Instance.TraceSphere(c), config);
}
