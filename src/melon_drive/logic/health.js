// Pure health-bar math — no cs_script import, so it's unit-testable in
// Node (see test/health.test.mjs). hud.js turns the result into HUD classes.
import { HEALTH_BAR_SEGMENTS, HEALTH_LOW_FRACTION, HEALTH_CRITICAL_FRACTION, MELON_MAX_HEALTH } from "../constants/index.js";

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
