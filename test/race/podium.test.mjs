// Podium rules (race/podium/logic.js): who stands where, how long, and the
// pull back over the spot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PodiumPlaces, PodiumHoldActive, PodiumHoldVelocity } from "../../src/melon_drive/race/podium/logic.js";
import { PODIUM_PLACES, PODIUM_PULL, PODIUM_PULL_MAX_SPEED, PODIUM_SPAWN_NAME_PATTERN, PodiumSpawnName } from "../../src/melon_drive/constants/index.js";

test("the first PODIUM_PLACES of the standings get places 1…", () => {
    const ranked = ["a", "b", "c", "d", "e"];
    const places = PodiumPlaces(ranked, new Set(ranked));
    assert.equal(places.size, PODIUM_PLACES);
    ranked.slice(0, PODIUM_PLACES).forEach((key, i) => assert.equal(places.get(key), i + 1));
    assert.equal(places.has(ranked[PODIUM_PLACES]), false);
});

test("a place whose racer left stays empty — nobody moves up", () => {
    const places = PodiumPlaces(["gone", "b", "c", "d"], new Set(["b", "c", "d"]));
    assert.equal(places.has("gone"), false);
    assert.equal(places.get("b"), 2);
    assert.equal(places.has("d"), false);
});

test("fewer racers than places: only those", () => {
    const places = PodiumPlaces(["a"], new Set(["a"]));
    assert.deepEqual([...places], [["a", 1]]);
});

test("the hold lasts until its end time", () => {
    const hold = { place: 1, spot: { x: 0, y: 0, z: 0 }, until: 10 };
    assert.equal(PodiumHoldActive(hold, 9.9), true);
    assert.equal(PodiumHoldActive(hold, 10), false);
    assert.equal(PodiumHoldActive(undefined, 0), false);
});

test("the pull goes straight back over the spot, capped", () => {
    assert.deepEqual(PodiumHoldVelocity({ x: 5, y: 5 }, { x: 5, y: 5 }), { x: 0, y: 0 });
    const near = PodiumHoldVelocity({ x: 0, y: 0 }, { x: 0, y: 1 });
    assert.equal(near.x, 0);
    assert.ok(Math.abs(near.y - PODIUM_PULL) < 1e-9);
    const far = PodiumHoldVelocity({ x: 0, y: 0 }, { x: -1000, y: 0 });
    assert.ok(Math.abs(far.x + PODIUM_PULL_MAX_SPEED) < 1e-9);
});

test("podium_spawn_<place> names match their pattern", () => {
    for (let place = 1; place <= PODIUM_PLACES; place++) {
        assert.equal(PODIUM_SPAWN_NAME_PATTERN.exec(PodiumSpawnName(place))?.[1], String(place));
    }
});
