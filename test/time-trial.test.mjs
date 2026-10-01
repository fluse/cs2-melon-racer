import { test } from "node:test";
import assert from "node:assert/strict";
import { FormatRaceTime, ParseSaveData, GetBestTimes, RecordRunTime } from "../src/melon_drive/race/time-trial/logic.js";
import { SAVE_DATA_BEST_TIMES_KEY } from "../src/melon_drive/constants/index.js";

test("race times read m:ss.cc, cut off like a stopwatch", () => {
    assert.equal(FormatRaceTime(0), "0:00.00");
    assert.equal(FormatRaceTime(7.5), "0:07.50");
    assert.equal(FormatRaceTime(83.459), "1:23.45");
    assert.equal(FormatRaceTime(600), "10:00.00");
    assert.equal(FormatRaceTime(0.07), "0:00.07", "no float error makes it 0:00.06");
    assert.equal(FormatRaceTime(-1), "0:00.00");
});

test("unreadable save data counts as empty", () => {
    assert.deepEqual(ParseSaveData(""), {});
    assert.deepEqual(ParseSaveData("not json"), {});
    assert.deepEqual(ParseSaveData("[1,2]"), {});
    assert.deepEqual(ParseSaveData("null"), {});
    assert.deepEqual(ParseSaveData('{"other":1}'), { other: 1 });
});

test("best times are read from their key, dropping broken entries", () => {
    const data = { [SAVE_DATA_BEST_TIMES_KEY]: { 1: { anna: 42.5, bert: "fast", carl: -3 }, 2: "nope" }, other: true };
    assert.deepEqual(GetBestTimes(data), { 1: { anna: 42.5 } });
    assert.deepEqual(GetBestTimes({}), {});
});

test("only a faster run replaces a player's best", () => {
    const best = {};
    assert.equal(RecordRunTime(best, 1, "anna", 50), true, "first run is a best");
    assert.equal(RecordRunTime(best, 1, "anna", 55), false);
    assert.equal(RecordRunTime(best, 1, "anna", 50), false, "a tie isn't a new best");
    assert.equal(RecordRunTime(best, 1, "anna", 48.2), true);
    assert.equal(RecordRunTime(best, 1, "bert", 60), true, "per player");
    assert.equal(RecordRunTime(best, 2, "anna", 70), true, "per track");
    assert.deepEqual(best, { 1: { anna: 48.2, bert: 60 }, 2: { anna: 70 } });
});
