import { test } from "node:test";
import assert from "node:assert/strict";
import { NearestWithin } from "../../src/melon_drive/kart/spawn-points-logic.js";

const origin = { x: 0, y: 0, z: 0 };

test("picks the nearest point within the distance", () => {
    const points = [{ x: 300, y: 0, z: 0 }, { x: 0, y: -100, z: 0 }, { x: 0, y: 0, z: 200 }];
    assert.equal(NearestWithin(points, origin, 1000), 1);
});

test("a point exactly at the distance counts, one beyond doesn't", () => {
    assert.equal(NearestWithin([{ x: 500, y: 0, z: 0 }], origin, 500), 0);
    assert.equal(NearestWithin([{ x: 501, y: 0, z: 0 }], origin, 500), undefined);
});

test("no points: none", () => {
    assert.equal(NearestWithin([], origin, 1000), undefined);
});
