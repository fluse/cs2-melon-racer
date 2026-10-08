// Grand Prix rules (race/grand-prix/logic.js): places per heat, points by
// place, standings over all heats. See GAMEPLAY.md, "Grand Prix — places & points".
import { test } from "node:test";
import assert from "node:assert/strict";
import { NewGrandPrix, HeatPoints, BeginGrandPrixHeat, RecordHeatFinish, SortedStandings, Wins, OrdinalPlace } from "../../src/melon_drive/race/grand-prix/logic.js";
import { HEAT_POINTS, HEAT_POINTS_FINISHER } from "../../src/melon_drive/constants/index.js";

const A = { key: "0:Anna", name: "Anna" };
const B = { key: "1:Ben", name: "Ben" };
const C = { key: "2:Cleo", name: "Cleo" };

test("points by place: HEAT_POINTS, then HEAT_POINTS_FINISHER for every place past it", () => {
    HEAT_POINTS.forEach((points, i) => assert.equal(HeatPoints(i + 1), points));
    assert.equal(HeatPoints(HEAT_POINTS.length + 1), HEAT_POINTS_FINISHER);
    assert.equal(HeatPoints(64), HEAT_POINTS_FINISHER);
    for (let i = 1; i < HEAT_POINTS.length; i++) {
        assert.ok(HEAT_POINTS[i] < HEAT_POINTS[i - 1], "a better place always scores more");
    }
    assert.ok(HEAT_POINTS_FINISHER <= HEAT_POINTS[HEAT_POINTS.length - 1]);
});

test("a new Grand Prix starts every racer on 0 points", () => {
    const gp = NewGrandPrix([A, B], 2);
    assert.deepEqual(SortedStandings(gp).map((s) => s.points), [0, 0]);
    assert.equal(gp.over, false);
    assert.equal(gp.totalTracks, 2);
});

test("finishers get places in the order they cross the line, and the points for them", () => {
    const gp = NewGrandPrix([A, B, C], 1);
    BeginGrandPrixHeat(gp, 1);
    assert.deepEqual(RecordHeatFinish(gp, 1, B, 30), { place: 1, points: HeatPoints(1) });
    assert.deepEqual(RecordHeatFinish(gp, 1, A, 31), { place: 2, points: HeatPoints(2) });
    assert.deepEqual(RecordHeatFinish(gp, 1, C, 40), { place: 3, points: HeatPoints(3) });
    assert.deepEqual(SortedStandings(gp).map((s) => s.name), ["Ben", "Anna", "Cleo"]);
    assert.equal(gp.standings[B.key].times[1], 30);
});

test("a second finish on the same track counts nothing", () => {
    const gp = NewGrandPrix([A, B], 1);
    BeginGrandPrixHeat(gp, 1);
    RecordHeatFinish(gp, 1, A, 30);
    assert.deepEqual(RecordHeatFinish(gp, 1, A, 29), { place: 1, points: HeatPoints(1) });
    assert.equal(gp.standings[A.key].points, HeatPoints(1));
    assert.deepEqual(RecordHeatFinish(gp, 1, B, 35), { place: 2, points: HeatPoints(2) }, "the next racer still gets 2nd");
});

test("points add up over the heats; the track list keeps the order raced", () => {
    const gp = NewGrandPrix([A, B], 2);
    BeginGrandPrixHeat(gp, 1);
    RecordHeatFinish(gp, 1, A, 30);
    RecordHeatFinish(gp, 1, B, 31);
    BeginGrandPrixHeat(gp, 3);
    RecordHeatFinish(gp, 3, B, 20);
    RecordHeatFinish(gp, 3, A, 21);
    assert.deepEqual(gp.trackIds, [1, 3]);
    assert.equal(gp.standings[A.key].points, HeatPoints(1) + HeatPoints(2));
    assert.equal(gp.standings[B.key].points, HeatPoints(2) + HeatPoints(1));
});

test("ties: more heat wins first, then the lower total time, then the name", () => {
    const gp = NewGrandPrix([A, B, C], 2);
    // Equal points, equal wins: Ben was faster in total.
    gp.standings[A.key] = { ...A, points: 18, places: { 1: 1, 2: 2 }, times: { 1: 30, 2: 30 } };
    gp.standings[B.key] = { ...B, points: 18, places: { 1: 2, 2: 1 }, times: { 1: 29, 2: 29 } };
    // Same points with no win ranks after them.
    gp.standings[C.key] = { ...C, points: 18, places: { 1: 3, 2: 3 }, times: { 1: 1, 2: 1 } };
    assert.equal(Wins(gp.standings[A.key]), 1);
    assert.deepEqual(SortedStandings(gp).map((s) => s.name), ["Ben", "Anna", "Cleo"]);
});

test("someone who wasn't in the starting line-up can still be recorded", () => {
    const gp = NewGrandPrix([A], 1);
    BeginGrandPrixHeat(gp, 1);
    RecordHeatFinish(gp, 1, B, 30);
    assert.equal(gp.standings[B.key].points, HeatPoints(1));
});

test("ordinal places", () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(OrdinalPlace), ["1ST", "2ND", "3RD", "4TH", "11TH", "12TH", "13TH", "21ST", "22ND", "23RD", "101ST"]);
});
