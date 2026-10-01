import { test } from "node:test";
import assert from "node:assert/strict";
import { ApplyCheckpointTouch, ApplyLapCompletion, ApplyStartTouch } from "../src/melon_drive/race/checkpoints/logic.js";

const TRACK = 1;
const OTHER_TRACK = 2;
const RULES = { checkpoints: 3, lapsToWin: 2 };
const RACE = { activeTrackId: TRACK, config: RULES };
const FREE_ROAM = { activeTrackId: undefined, config: RULES };

/** @param {Partial<import("../src/melon_drive/race/checkpoints/logic.js").KartProgress>} [overrides] */
function Kart(overrides) {
    return { trackId: undefined, checkpointIndex: 0, lapsCompleted: 0, racing: false, finished: false, ...overrides };
}

/** A racer placed on TRACK at the start of a heat (what BeginHeat sets up). */
function Racer() {
    return Kart({ trackId: TRACK, racing: true });
}

/** Drives one full lap's checkpoints 1..N. */
function RunCheckpoints(kart) {
    for (let i = 1; i <= RULES.checkpoints; i++) {
        ApplyCheckpointTouch(kart, TRACK, i);
    }
}

test("the start line picks a track for a kart that isn't on one", () => {
    const kart = Kart();
    assert.equal(ApplyStartTouch(kart, TRACK, FREE_ROAM), "picked");
    assert.equal(kart.trackId, TRACK);
    assert.equal(kart.checkpointIndex, 0, "the start isn't a checkpoint");
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1), "advanced");
});

test("checkpoints don't count before the start line is crossed", () => {
    const kart = Kart();
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1), "ignored-other-track");
    assert.equal(kart.trackId, undefined);
});

test("a racer crossing the start line right after GO keeps its heat setup", () => {
    const kart = Racer();
    assert.equal(ApplyStartTouch(kart, TRACK, RACE), "ignored-mid-lap");
    assert.equal(kart.checkpointIndex, 0);
});

test("checkpoints advance strictly one at a time", () => {
    const kart = Racer();
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1), "advanced");
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 3), "ignored-skipped");
    assert.equal(kart.checkpointIndex, 1);
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 2), "advanced");
    assert.equal(kart.checkpointIndex, 2);
});

test("touching an earlier checkpoint again never regresses progress", () => {
    const kart = Racer();
    RunCheckpoints(kart);
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 2), "ignored-behind");
    assert.equal(kart.checkpointIndex, RULES.checkpoints);
});

test("doubling back over the start line mid-lap doesn't reset progress", () => {
    const kart = Racer();
    ApplyCheckpointTouch(kart, TRACK, 1);
    assert.equal(ApplyStartTouch(kart, TRACK, RACE), "ignored-mid-lap");
    assert.equal(kart.checkpointIndex, 1);
});

test("another track's checkpoints don't count", () => {
    const kart = Racer();
    ApplyCheckpointTouch(kart, TRACK, 1);
    assert.equal(ApplyCheckpointTouch(kart, OTHER_TRACK, 2), "ignored-other-track");
    assert.equal(kart.trackId, TRACK);
    assert.equal(kart.checkpointIndex, 1);
});

test("a racing kart can't switch to another track's start mid-heat", () => {
    const kart = Racer();
    assert.equal(ApplyStartTouch(kart, OTHER_TRACK, RACE), "ignored-foreign-start");
    assert.equal(kart.trackId, TRACK);
});

test("finish before all checkpoints doesn't count a lap", () => {
    const kart = Racer();
    ApplyCheckpointTouch(kart, TRACK, 1);
    ApplyCheckpointTouch(kart, TRACK, 2);
    assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "ignored-incomplete");
    assert.equal(kart.lapsCompleted, 0);
});

test("finish after all checkpoints counts a lap and resets progress", () => {
    const kart = Racer();
    RunCheckpoints(kart);
    assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "lap");
    assert.equal(kart.lapsCompleted, 1);
    assert.equal(kart.checkpointIndex, 0);
});

test("the last lap finishes the kart", () => {
    const kart = Racer();
    for (let lap = 1; lap < RULES.lapsToWin; lap++) {
        RunCheckpoints(kart);
        assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "lap");
    }
    RunCheckpoints(kart);
    assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "finished");
    assert.equal(kart.lapsCompleted, RULES.lapsToWin);
});

// Point-to-point: start_ at the beginning, finish_ on its own trigger at the
// end, one lap.
test("a point-to-point track finishes at its separate finish trigger", () => {
    const ctx = { activeTrackId: TRACK, config: { checkpoints: RULES.checkpoints, lapsToWin: 1 } };
    const kart = Racer();
    assert.equal(ApplyLapCompletion(kart, TRACK, ctx), "ignored-incomplete", "finish before the checkpoints");
    RunCheckpoints(kart);
    assert.equal(ApplyLapCompletion(kart, TRACK, ctx), "finished");
});

test("a point-to-point track without checkpoints finishes at the finish trigger", () => {
    const ctx = { activeTrackId: TRACK, config: { checkpoints: 0, lapsToWin: 1 } };
    const kart = Racer();
    assert.equal(ApplyStartTouch(kart, TRACK, ctx), "ignored-mid-lap", "crossing the start is no lap");
    assert.equal(ApplyLapCompletion(kart, TRACK, ctx), "finished");
});

test("finish only counts on the kart's own track — in a heat, the heat's", () => {
    const offTrack = Kart();
    assert.equal(ApplyLapCompletion(offTrack, TRACK, FREE_ROAM), "ignored-other-track");

    const racer = Racer();
    RunCheckpoints(racer);
    assert.equal(ApplyLapCompletion(racer, TRACK, { activeTrackId: OTHER_TRACK, config: RULES }), "ignored-other-track");
    assert.equal(racer.lapsCompleted, 0);
});

// Free-roaming runs are time trials: laps count and the last one finishes
// the run, just like in a heat.
test("laps count outside a heat too", () => {
    const kart = Kart();
    ApplyStartTouch(kart, TRACK, FREE_ROAM);
    RunCheckpoints(kart);
    assert.equal(ApplyLapCompletion(kart, TRACK, FREE_ROAM), "lap");
    RunCheckpoints(kart);
    assert.equal(ApplyLapCompletion(kart, TRACK, FREE_ROAM), "finished");
    assert.equal(kart.lapsCompleted, RULES.lapsToWin);
});

test("free-roaming, crossing the start again before checkpoint 1 restarts the run", () => {
    const kart = Kart();
    ApplyStartTouch(kart, TRACK, FREE_ROAM);
    assert.equal(ApplyStartTouch(kart, TRACK, FREE_ROAM), "picked");
    ApplyCheckpointTouch(kart, TRACK, 1);
    assert.equal(ApplyStartTouch(kart, TRACK, FREE_ROAM), "ignored-mid-lap", "not once it's under way");
});

test("a track without config (no start_* trigger) never completes a lap", () => {
    const kart = Racer();
    RunCheckpoints(kart);
    assert.equal(ApplyLapCompletion(kart, TRACK, { activeTrackId: TRACK, config: undefined }), "ignored-incomplete");
});

// Loop track: start_<trackId> and finish_<trackId> are outputs on the same
// trigger, and Hammer doesn't guarantee which fires first — either order
// must count the lap exactly once and leave the kart at the start of the
// next lap.
test("lap counts once when start fires before finish", () => {
    const kart = Racer();
    RunCheckpoints(kart);
    assert.equal(ApplyStartTouch(kart, TRACK, RACE), "lap");
    assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "ignored-incomplete");
    assert.equal(kart.lapsCompleted, 1);
    assert.equal(kart.checkpointIndex, 0);
});

test("lap counts once when finish fires before start", () => {
    const kart = Racer();
    RunCheckpoints(kart);
    assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "lap");
    assert.equal(ApplyStartTouch(kart, TRACK, RACE), "ignored-mid-lap");
    assert.equal(kart.lapsCompleted, 1);
    assert.equal(kart.checkpointIndex, 0);
});

test("crossing the start line on the final lap finishes the kart", () => {
    const kart = Racer();
    kart.lapsCompleted = RULES.lapsToWin - 1;
    RunCheckpoints(kart);
    assert.equal(ApplyStartTouch(kart, TRACK, RACE), "finished");
    assert.equal(kart.lapsCompleted, RULES.lapsToWin);
});

test("a free-roaming kart crossing the start after a full lap starts the next", () => {
    const kart = Kart();
    ApplyStartTouch(kart, TRACK, FREE_ROAM);
    RunCheckpoints(kart);
    assert.equal(ApplyStartTouch(kart, TRACK, FREE_ROAM), "lap");
    assert.equal(kart.checkpointIndex, 0);
    assert.equal(kart.lapsCompleted, 1);
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1), "advanced");
});

test("a finished kart ignores every further touch", () => {
    const kart = Racer();
    kart.finished = true;
    assert.equal(ApplyStartTouch(kart, TRACK, RACE), "ignored-finished");
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1), "ignored-finished");
    assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "ignored-finished");
});
