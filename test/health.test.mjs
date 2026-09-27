import { test } from "node:test";
import assert from "node:assert/strict";
import { HealthBarState, HealedHealth, HealZoneRate } from "../src/melon_drive/logic/health.js";
import {
    MELON_MAX_HEALTH,
    HEALTH_BAR_SEGMENTS,
    HEALTH_LOW_FRACTION,
    HEALTH_CRITICAL_FRACTION,
    HEAL_ZONE_RATE,
} from "../src/melon_drive/constants/index.js";

test("full health fills every segment", () => {
    assert.equal(HealthBarState(MELON_MAX_HEALTH).filledSegments, HEALTH_BAR_SEGMENTS);
});

test("zero or negative health shows an empty bar", () => {
    assert.equal(HealthBarState(0).filledSegments, 0);
    assert.equal(HealthBarState(-25).filledSegments, 0);
});

// Regression: the bar used to round, so it showed empty while the melon was
// still alive with less than half a segment of health left (BUGS.md).
test("any health left shows at least one segment", () => {
    for (const health of [0.01, 1, MELON_MAX_HEALTH / HEALTH_BAR_SEGMENTS / 2 - 0.01]) {
        assert.ok(HealthBarState(health).filledSegments >= 1, `health ${health} showed an empty bar`);
    }
});

test("losing any health empties at most one segment per segment's worth", () => {
    const perSegment = MELON_MAX_HEALTH / HEALTH_BAR_SEGMENTS;
    assert.equal(HealthBarState(MELON_MAX_HEALTH - perSegment).filledSegments, HEALTH_BAR_SEGMENTS - 1);
});

test("health above max is clamped", () => {
    assert.equal(HealthBarState(MELON_MAX_HEALTH * 3).filledSegments, HEALTH_BAR_SEGMENTS);
});

test("low/critical flags follow their thresholds", () => {
    const full = HealthBarState(MELON_MAX_HEALTH);
    assert.equal(full.low, false);
    assert.equal(full.critical, false);

    const low = HealthBarState(MELON_MAX_HEALTH * HEALTH_LOW_FRACTION);
    assert.equal(low.low, true);
    assert.equal(low.critical, false);

    const critical = HealthBarState(MELON_MAX_HEALTH * HEALTH_CRITICAL_FRACTION);
    assert.equal(critical.low, true);
    assert.equal(critical.critical, true);
});

test("healing adds rate * dt", () => {
    assert.equal(HealedHealth(MELON_MAX_HEALTH / 2, HEAL_ZONE_RATE, 0.5), MELON_MAX_HEALTH / 2 + HEAL_ZONE_RATE * 0.5);
});

test("healing stops at max health", () => {
    assert.equal(HealedHealth(MELON_MAX_HEALTH - 0.1, HEAL_ZONE_RATE, 10), MELON_MAX_HEALTH);
    assert.equal(HealedHealth(MELON_MAX_HEALTH, HEAL_ZONE_RATE, 1), MELON_MAX_HEALTH);
});

test("healing never lowers health or heals with a negative rate/dt", () => {
    assert.equal(HealedHealth(MELON_MAX_HEALTH * 2, HEAL_ZONE_RATE, 1), MELON_MAX_HEALTH * 2);
    assert.equal(HealedHealth(10, -5, 1), 10);
    assert.equal(HealedHealth(10, HEAL_ZONE_RATE, -1), 10);
});

test("heal zone rate comes from a heal_zone_<rate> name, else the default", () => {
    assert.equal(HealZoneRate("heal_zone_25"), 25);
    assert.equal(HealZoneRate("heal_zone_2.5"), 2.5);
    assert.equal(HealZoneRate("heal_zone_25 "), 25); // Hammer keeps stray trailing spaces
    assert.equal(HealZoneRate("pit_stop"), HEAL_ZONE_RATE);
    assert.equal(HealZoneRate(""), HEAL_ZONE_RATE);
});
