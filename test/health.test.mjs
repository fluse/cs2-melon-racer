import { test } from "node:test";
import assert from "node:assert/strict";
import { HealthBarState } from "../src/melon_drive/logic/health.js";
import {
    MELON_MAX_HEALTH,
    HEALTH_BAR_SEGMENTS,
    HEALTH_LOW_FRACTION,
    HEALTH_CRITICAL_FRACTION,
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

// --- impact damage: flat landings cost more ---
import { ImpactDamage, IsFlatLanding } from "../src/melon_drive/logic/health.js";
import {
    IMPACT_DAMAGE_THRESHOLD,
    IMPACT_DAMAGE_SCALE,
    FLAT_LANDING_DAMAGE_MULTIPLIER,
    FLAT_LANDING_MIN_NORMAL_Z,
} from "../src/melon_drive/constants/index.js";

const HARD = IMPACT_DAMAGE_THRESHOLD + 300;
const baseDamage = (HARD - IMPACT_DAMAGE_THRESHOLD) * IMPACT_DAMAGE_SCALE;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("a straight drop onto level ground takes the flat-landing multiplier", () => {
    const { damage, flatLanding } = ImpactDamage({ x: 0, y: 0, z: HARD }, 1);
    assert.ok(flatLanding);
    near(damage, baseDamage * FLAT_LANDING_DAMAGE_MULTIPLIER);
});

test("the same drop onto a slope is plain impact damage", () => {
    const { damage, flatLanding } = ImpactDamage({ x: 0, y: 0, z: HARD }, FLAT_LANDING_MIN_NORMAL_Z - 0.1);
    assert.ok(!flatLanding);
    near(damage, baseDamage);
});

test("a mostly sideways crash over flat ground isn't a flat landing", () => {
    assert.ok(!IsFlatLanding({ x: HARD, y: 0, z: HARD * 0.2 }, 1));
    near(ImpactDamage({ x: HARD, y: 0, z: 0 }, 1).damage, baseDamage);
});

test("no floor below: not a flat landing; below the threshold: no damage", () => {
    assert.ok(!IsFlatLanding({ x: 0, y: 0, z: HARD }, undefined));
    near(ImpactDamage({ x: 0, y: 0, z: IMPACT_DAMAGE_THRESHOLD - 1 }, 1).damage, 0);
});
