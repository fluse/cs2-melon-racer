import { test } from "node:test";
import assert from "node:assert/strict";
import { HealedHealth, HealZoneRate } from "../src/melon_drive/heal/logic.js";
import { MELON_MAX_HEALTH, HEAL_ZONE_RATE, HEAL_ZONE_FULL_NAME, HEAL_ZONE_FULL_RATE } from "../src/melon_drive/constants/index.js";

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

test("the full-heal zone name gets the full-heal rate", () => {
    assert.equal(HealZoneRate(HEAL_ZONE_FULL_NAME), HEAL_ZONE_FULL_RATE);
    assert.equal(HealZoneRate(`${HEAL_ZONE_FULL_NAME} `), HEAL_ZONE_FULL_RATE);
    assert.equal(HealZoneRate(`${HEAL_ZONE_FULL_NAME}_2`), HEAL_ZONE_RATE); // only the exact name
});

test("the full-heal rate refills to max at once, even with a zero dt", () => {
    for (const dt of [0, 1 / 64, 1]) {
        assert.equal(HealedHealth(1, HEAL_ZONE_FULL_RATE, dt), MELON_MAX_HEALTH);
    }
    assert.equal(HealedHealth(MELON_MAX_HEALTH * 2, HEAL_ZONE_FULL_RATE, 1), MELON_MAX_HEALTH * 2);
});

test("a full-heal zone beats any rate it overlaps", () => {
    assert.equal(Math.max(HEAL_ZONE_RATE, 1e6, HEAL_ZONE_FULL_RATE), HEAL_ZONE_FULL_RATE);
});
