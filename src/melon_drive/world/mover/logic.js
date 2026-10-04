// Movers (MOVER_* in world/mover/constants.js). Pure rules, no cs_script
// import; world/mover/mover.js applies them (test/world/mover.test.mjs).
import { MOVER_NAME_PATTERN, MOVER_DEFAULT_WAIT } from "./constants.js";

/**
 * A mover's config from its entity name, or undefined if the name doesn't
 * make it one.
 * @param {string} name
 * @returns {{ wait: number } | undefined} wait: seconds it stands at each end
 */
export function ParseMoverName(name) {
    const match = MOVER_NAME_PATTERN.exec(name);
    if (!match) {
        return undefined;
    }
    return { wait: match[1] === undefined ? MOVER_DEFAULT_WAIT : Number(match[1]) };
}

