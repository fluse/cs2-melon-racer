// Pure healing math — no cs_script import, so it's unit-testable in Node
// (see test/health/heal.test.mjs). zone.js applies it to karts.
import { MELON_MAX_HEALTH } from "../damage/constants.js";
import { HEAL_ZONE_RATE, HEAL_ZONE_NAME_PATTERN, HEAL_ZONE_FULL_NAME, HEAL_ZONE_FULL_RATE } from "./constants.js";

/**
 * Health after healing for dt seconds at rate health/second, never above
 * MELON_MAX_HEALTH (and never lowering a value that's already above it).
 * HEAL_ZONE_FULL_RATE heals to full at once, whatever dt is.
 * @param {number} health @param {number} rate @param {number} dt
 */
export function HealedHealth(health, rate, dt) {
    if (health >= MELON_MAX_HEALTH) {
        return health;
    }
    if (rate === HEAL_ZONE_FULL_RATE) {
        return MELON_MAX_HEALTH; // Infinity * a 0 dt would be NaN
    }
    return Math.min(MELON_MAX_HEALTH, health + Math.max(0, rate) * Math.max(0, dt));
}

/**
 * Heal rate (health/second) of a heal trigger: HEAL_ZONE_FULL_RATE for
 * HEAL_ZONE_FULL_NAME, parsed from a "heal_zone_<rate>" name, else
 * HEAL_ZONE_RATE.
 * @param {string} triggerName
 */
export function HealZoneRate(triggerName) {
    const name = triggerName.trim(); // Hammer keeps stray trailing spaces
    if (name === HEAL_ZONE_FULL_NAME) {
        return HEAL_ZONE_FULL_RATE;
    }
    const match = HEAL_ZONE_NAME_PATTERN.exec(name);
    return match ? Number(match[1]) : HEAL_ZONE_RATE;
}
