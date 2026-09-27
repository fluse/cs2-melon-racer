// Pure health-bar math — no cs_script import, so it's unit-testable in
// Node (see test/health.test.mjs). hud.js turns the result into HUD classes.
import { HEALTH_BAR_SEGMENTS, HEALTH_LOW_FRACTION, HEALTH_CRITICAL_FRACTION, MELON_MAX_HEALTH, HEAL_ZONE_RATE, HEAL_ZONE_NAME_PATTERN } from "../constants/index.js";

/**
 * What the segmented health bar should show for a given health value.
 * @param {number} health
 * @returns {{ fraction: number, filledSegments: number, low: boolean, critical: boolean }}
 */
export function HealthBarState(health) {
    const fraction = Math.max(0, Math.min(1, health / MELON_MAX_HEALTH));
    return {
        fraction,
        // ceil, not round: the melon only breaks at health <= 0, so any health
        // left must still show at least one segment — round() emptied the bar
        // while up to half a segment's worth of health remained.
        filledSegments: Math.ceil(fraction * HEALTH_BAR_SEGMENTS),
        low: fraction <= HEALTH_LOW_FRACTION,
        critical: fraction <= HEALTH_CRITICAL_FRACTION,
    };
}

/**
 * Health after healing for dt seconds at rate health/second, never above
 * MELON_MAX_HEALTH (and never lowering a value that's already above it).
 * @param {number} health @param {number} rate @param {number} dt
 */
export function HealedHealth(health, rate, dt) {
    if (health >= MELON_MAX_HEALTH) {
        return health;
    }
    return Math.min(MELON_MAX_HEALTH, health + Math.max(0, rate) * Math.max(0, dt));
}

/**
 * Heal rate (health/second) of a heal trigger: parsed from a
 * "heal_zone_<rate>" name, else HEAL_ZONE_RATE.
 * @param {string} triggerName
 */
export function HealZoneRate(triggerName) {
    const match = HEAL_ZONE_NAME_PATTERN.exec(triggerName.trim());
    return match ? Number(match[1]) : HEAL_ZONE_RATE;
}
