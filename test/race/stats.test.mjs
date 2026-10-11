// The players' all-time stats (race/stats/logic.js): reading them from the
// save data, adding to them, and how a value reads on the scoreboard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GetStats, AddStat, StatTotals, FormatDuration, FormatStat } from "../../src/melon_drive/race/stats/logic.js";
import { SAVE_DATA_STATS_KEY, STAT_SLIDES } from "../../src/melon_drive/constants/index.js";

const KEYS = STAT_SLIDES.map((slide) => slide.key);

test("every stat the user asked for has a page", () => {
    assert.deepEqual(KEYS, ["playTime", "crashes", "finishes", "boostTime", "perfectHits"]);
});

test("GetStats: known stats with non-negative numbers only", () => {
    const saveData = {
        [SAVE_DATA_STATS_KEY]: {
            Anna: { [KEYS[0]]: 120, [KEYS[1]]: 3, bogus: 5, [KEYS[2]]: -1, [KEYS[3]]: "7" },
            Ben: "nope",
        },
        bestTimes: {},
    };
    assert.deepEqual(GetStats(saveData), { Anna: { [KEYS[0]]: 120, [KEYS[1]]: 3 } });
    assert.deepEqual(GetStats({}), {});
    assert.deepEqual(GetStats({ [SAVE_DATA_STATS_KEY]: [1, 2] }), {});
});

test("AddStat: adds up per player, ignores empty names, unknown stats and nothing", () => {
    const stats = {};
    assert.equal(AddStat(stats, "Anna", KEYS[1], 1), true);
    AddStat(stats, "Anna", KEYS[1], 1);
    AddStat(stats, "Anna", KEYS[0], 0.5);
    assert.deepEqual(stats, { Anna: { [KEYS[1]]: 2, [KEYS[0]]: 0.5 } });
    assert.equal(AddStat(stats, "", KEYS[1], 1), false);
    assert.equal(AddStat(stats, "Anna", "bogus", 1), false);
    assert.equal(AddStat(stats, "Anna", KEYS[1], 0), false);
    assert.equal(AddStat(stats, "Anna", KEYS[1], -3), false);
    assert.equal(stats.Anna[KEYS[1]], 2);
});

test("StatTotals: one stat's totals by name, players without it left out", () => {
    const stats = { Anna: { [KEYS[1]]: 2 }, Ben: { [KEYS[0]]: 9 } };
    assert.deepEqual(StatTotals(stats, KEYS[1]), { Anna: 2 });
});

test("FormatDuration: seconds, minutes, hours", () => {
    assert.equal(FormatDuration(0), "0s");
    assert.equal(FormatDuration(37.9), "37s");
    assert.equal(FormatDuration(252), "4m 12s");
    assert.equal(FormatDuration(3900), "1h 05m");
    assert.equal(FormatDuration(-5), "0s");
});

test("FormatStat: durations as durations, counts as whole numbers", () => {
    const duration = STAT_SLIDES.find((slide) => slide.format === "duration");
    const count = STAT_SLIDES.find((slide) => slide.format === "count");
    assert.equal(FormatStat(duration, 252), FormatDuration(252));
    assert.equal(FormatStat(count, 12), "12");
});
