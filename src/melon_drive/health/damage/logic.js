// Pure health-bar math — no cs_script import, so it's unit-testable in
// Node (see test/health.test.mjs). hud/ turns the result into HUD classes.
import {
    HEALTH_BAR_SEGMENTS,
    HEALTH_LOW_FRACTION,
    HEALTH_CRITICAL_FRACTION,
    MELON_MAX_HEALTH,
    IMPACT_DAMAGE_THRESHOLD,
    IMPACT_DAMAGE_SCALE,
    FLAT_LANDING_DAMAGE_MULTIPLIER,
    FLAT_LANDING_MIN_NORMAL_Z,
    FLAT_LANDING_MIN_VERTICAL_SHARE,
} from "../../constants/index.js";

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
 * Whether an impact is the melon landing on flat, level ground: the floor
 * under it is at least FLAT_LANDING_MIN_NORMAL_Z level and the impact
 * (the velocity change physics forced) points mostly upward.
 * @param {{ x: number, y: number, z: number }} impactDelta
 * @param {number | undefined} floorNormalZ this tick's floor trace, undefined if it hit nothing
 */
export function IsFlatLanding(impactDelta, floorNormalZ) {
    if (floorNormalZ === undefined || floorNormalZ < FLAT_LANDING_MIN_NORMAL_Z) {
        return false;
    }
    const impactSpeed = Math.hypot(impactDelta.x, impactDelta.y, impactDelta.z);
    return impactSpeed > 0 && impactDelta.z / impactSpeed >= FLAT_LANDING_MIN_VERTICAL_SHARE;
}

/**
 * Health lost from a landing/crash (not a wall bounce): IMPACT_DAMAGE_* above
 * the threshold, times FLAT_LANDING_DAMAGE_MULTIPLIER for a flat landing.
 * @param {{ x: number, y: number, z: number }} impactDelta
 * @param {number | undefined} floorNormalZ
 * @returns {{ damage: number, flatLanding: boolean }}
 */
export function ImpactDamage(impactDelta, floorNormalZ) {
    const impactSpeed = Math.hypot(impactDelta.x, impactDelta.y, impactDelta.z);
    const flatLanding = IsFlatLanding(impactDelta, floorNormalZ);
    const base = Math.max(0, impactSpeed - IMPACT_DAMAGE_THRESHOLD) * IMPACT_DAMAGE_SCALE;
    return { damage: flatLanding ? base * FLAT_LANDING_DAMAGE_MULTIPLIER : base, flatLanding };
}

// Healing math (HealedHealth, HealZoneRate): health/heal/logic.js.
