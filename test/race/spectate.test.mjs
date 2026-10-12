// Spectating's pure rules (race/spectate/logic.js): who spectates, whom,
// and stepping through them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SpectateMode, SpectateCandidates, StepSpectateTarget, IsHeatPhase } from "../../src/melon_drive/race/spectate/logic.js";
import { RacePhase, SPECTATE_AFTER_FINISH_SECONDS } from "../../src/melon_drive/constants/index.js";

test("a finished racer spectates SPECTATE_AFTER_FINISH_SECONDS after the line, while others still drive", () => {
    const racer = { racing: true, finished: true, finishTime: 10 };
    assert.equal(SpectateMode(racer, RacePhase.RACING, 10 + SPECTATE_AFTER_FINISH_SECONDS - 0.1, true), undefined, "FINISH first");
    assert.equal(SpectateMode(racer, RacePhase.RACING, 10 + SPECTATE_AFTER_FINISH_SECONDS, true), "racer");
    assert.equal(SpectateMode(racer, RacePhase.RACING, 50, false), undefined, "nobody left driving");
    assert.equal(SpectateMode(racer, RacePhase.BREAK, 50, true), undefined, "the heat is over");
    assert.equal(SpectateMode({ racing: true, finished: false }, RacePhase.RACING, 50, true), undefined, "still driving");
    assert.equal(SpectateMode({ ...racer, spectateDismissed: true }, RacePhase.RACING, 50, true), undefined, "pressed R");
});

test("a watcher spectates for as long as the Grand Prix runs, never a racer or in the hub", () => {
    for (const phase of [RacePhase.COUNTDOWN, RacePhase.RACING, RacePhase.BREAK]) {
        assert.equal(IsHeatPhase(phase), true);
        assert.equal(SpectateMode({ racing: false, finished: false, watching: true }, phase, 0, false), "watcher", phase);
    }
    assert.equal(SpectateMode({ racing: false, finished: false, watching: true }, RacePhase.HUB, 0, true), undefined);
    assert.equal(SpectateMode({ racing: false, finished: false, watching: true }, RacePhase.GATHERING, 0, true), undefined);
    assert.equal(SpectateMode({ racing: false, finished: false, watching: false }, RacePhase.RACING, 0, true), undefined);
});

test("candidates: those still driving, furthest ahead first; a watcher falls back to every racer", () => {
    const racers = [
        { key: 1, laps: 0, checkpoint: 3, finished: false },
        { key: 2, laps: 1, checkpoint: 0, finished: false },
        { key: 3, laps: 2, checkpoint: 0, finished: true },
        { key: 4, laps: 0, checkpoint: 3, finished: false },
    ];
    assert.deepEqual(SpectateCandidates(racers, false), [2, 1, 4], "laps, then checkpoints, ties in order");
    const allDone = racers.map((r) => ({ ...r, finished: true }));
    assert.deepEqual(SpectateCandidates(allDone, false), []);
    assert.deepEqual(SpectateCandidates(allDone, true), [3, 2, 1, 4]);
});

test("stepping wraps around; a target that's gone starts over at the front", () => {
    assert.equal(StepSpectateTarget([5, 6, 7], undefined, 0), 5);
    assert.equal(StepSpectateTarget([5, 6, 7], 6, 0), 6);
    assert.equal(StepSpectateTarget([5, 6, 7], 7, 1), 5);
    assert.equal(StepSpectateTarget([5, 6, 7], 5, -1), 7);
    assert.equal(StepSpectateTarget([5, 6, 7], 9, 1), 5, "the watched one finished");
    assert.equal(StepSpectateTarget([], 5, 1), undefined);
});
