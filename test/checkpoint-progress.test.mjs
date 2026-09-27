import { test } from "node:test";
import assert from "node:assert/strict";
import { ApplyCheckpointTouch, ApplyLapCompletion } from "../src/melon_drive/logic/checkpoint-progress.js";

const TRACK = 1;
const OTHER_TRACK = 2;
const RULES = { checkpoints: 3, lapsToWin: 2 };
const RACE = { activeTrackId: TRACK, config: RULES };
const FREE_ROAM = { activeTrackId: undefined, config: RULES };

/** @param {Partial<import("../src/melon_drive/logic/checkpoint-progress.js").KartProgress>} [overrides] */
function Kart(overrides) {
    return { trackId: undefined, checkpointIndex: 0, lapsCompleted: 0, racing: false, finished: false, ...overrides };
}

/** A racer placed on TRACK at the start of a heat (what BeginHeat sets up). */
function Racer() {
    return Kart({ trackId: TRACK, racing: true });
}

/** Drives one full lap's checkpoints 1..N. */
function RunCheckpoints(kart, ctx = RACE) {
    for (let i = 1; i <= RULES.checkpoints; i++) {
        ApplyCheckpointTouch(kart, TRACK, i, ctx);
    }
}

test("checkpoint 1 picks a track for a kart that isn't on one", () => {
    const kart = Kart();
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1, FREE_ROAM), "advanced");
    assert.equal(kart.trackId, TRACK);
    assert.equal(kart.checkpointIndex, 1);
});

test("checkpoints advance strictly one at a time", () => {
    const kart = Racer();
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1, RACE), "advanced");
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 3, RACE), "ignored-skipped");
    assert.equal(kart.checkpointIndex, 1);
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 2, RACE), "advanced");
    assert.equal(kart.checkpointIndex, 2);
});

test("touching an earlier checkpoint again never regresses progress", () => {
    const kart = Racer();
    RunCheckpoints(kart);
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 2, RACE), "ignored-behind");
    assert.equal(kart.checkpointIndex, RULES.checkpoints);
});

test("another track's later checkpoints don't count", () => {
    const kart = Racer();
    ApplyCheckpointTouch(kart, TRACK, 1, RACE);
    assert.equal(ApplyCheckpointTouch(kart, OTHER_TRACK, 2, RACE), "ignored-other-track");
    assert.equal(kart.trackId, TRACK);
    assert.equal(kart.checkpointIndex, 1);
});

test("a racing kart can't switch to another track's start mid-heat", () => {
    const kart = Racer();
    ApplyCheckpointTouch(kart, TRACK, 1, RACE);
    assert.equal(ApplyCheckpointTouch(kart, OTHER_TRACK, 1, RACE), "ignored-foreign-start");
    assert.equal(kart.trackId, TRACK);
});

test("finish before all checkpoints doesn't count a lap", () => {
    const kart = Racer();
    ApplyCheckpointTouch(kart, TRACK, 1, RACE);
    ApplyCheckpointTouch(kart, TRACK, 2, RACE);
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

test("finish only counts while racing the active track", () => {
    const freeRoamer = Kart();
    RunCheckpoints(freeRoamer, FREE_ROAM);
    assert.equal(ApplyLapCompletion(freeRoamer, TRACK, FREE_ROAM), "ignored-not-racing");

    const racer = Racer();
    RunCheckpoints(racer);
    assert.equal(ApplyLapCompletion(racer, TRACK, { activeTrackId: OTHER_TRACK, config: RULES }), "ignored-not-racing");
    assert.equal(racer.lapsCompleted, 0);
});

test("a track without config (no track_start_* trigger) never completes a lap", () => {
    const kart = Racer();
    RunCheckpoints(kart);
    assert.equal(ApplyLapCompletion(kart, TRACK, { activeTrackId: TRACK, config: undefined }), "ignored-incomplete");
});

// Checkpoint 1 and finish_<trackId> are often outputs on the same trigger,
// and Hammer doesn't guarantee which fires first — either order must count
// the lap exactly once and leave the kart at checkpoint 1 of the next lap.
test("lap counts once when checkpoint 1 fires before finish", () => {
    const kart = Racer();
    RunCheckpoints(kart);
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1, RACE), "lap-advanced");
    assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "ignored-incomplete");
    assert.equal(kart.lapsCompleted, 1);
    assert.equal(kart.checkpointIndex, 1);
});

test("lap counts once when finish fires before checkpoint 1", () => {
    const kart = Racer();
    RunCheckpoints(kart);
    assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "lap");
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1, RACE), "advanced");
    assert.equal(kart.lapsCompleted, 1);
    assert.equal(kart.checkpointIndex, 1);
});

test("crossing checkpoint 1 on the final lap finishes the kart", () => {
    const kart = Racer();
    kart.lapsCompleted = RULES.lapsToWin - 1;
    RunCheckpoints(kart);
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1, RACE), "finished");
    assert.equal(kart.lapsCompleted, RULES.lapsToWin);
});

test("a free-roaming kart can start a second lap", () => {
    const kart = Kart();
    RunCheckpoints(kart, FREE_ROAM);
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1, FREE_ROAM), "advanced");
    assert.equal(kart.checkpointIndex, 1);
    assert.equal(kart.lapsCompleted, 0, "laps only count during a heat");
});

test("a finished kart ignores every further touch", () => {
    const kart = Racer();
    kart.finished = true;
    assert.equal(ApplyCheckpointTouch(kart, TRACK, 1, RACE), "ignored-finished");
    assert.equal(ApplyLapCompletion(kart, TRACK, RACE), "ignored-finished");
});
