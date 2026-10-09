import { test } from "node:test";
import assert from "node:assert/strict";
import { BreakCountdownValue, BreakCountdownLabels, CountdownStep, CountdownNumberState, WatchProgress, DnfSecondsLeft, DnfWarningValue } from "../../src/melon_drive/race/heat/logic.js";
import { BREAK_SECONDS, DNF_NO_PROGRESS_SECONDS, DNF_WARNING_SECONDS } from "../../src/melon_drive/constants/index.js";

test("the break countdown runs BREAK_SECONDS down to 0", () => {
    assert.equal(BreakCountdownValue(BREAK_SECONDS), BREAK_SECONDS);
    assert.equal(BreakCountdownValue(BREAK_SECONDS - 0.6), BREAK_SECONDS - 1);
    assert.equal(BreakCountdownValue(1.2), 1);
    assert.equal(BreakCountdownValue(0.4), 0);
    assert.equal(BreakCountdownValue(-1), 0, "never below 0");
});

test("break countdown: the two Labels take turns, the one before knocked out", () => {
    assert.deepEqual(BreakCountdownLabels(10, undefined), { in: 0, out: undefined }, "the first number: nothing to knock out");
    assert.deepEqual(BreakCountdownLabels(9, 10), { in: 1, out: 0 });
    assert.deepEqual(BreakCountdownLabels(8, 9), { in: 0, out: 1 });
    assert.deepEqual(BreakCountdownLabels(0, 1), { in: 0, out: 1 });
    assert.deepEqual(BreakCountdownLabels(5, 7), { in: 1, out: undefined }, "a skipped number isn't on the other Label");
});

test("countdown step: 3, 2, 1 for the last three seconds, then GO; nothing before", () => {
    assert.equal(CountdownStep(3), 0, "3");
    assert.equal(CountdownStep(2.5), 0, "3");
    assert.equal(CountdownStep(2), 1, "2");
    assert.equal(CountdownStep(0.01), 2, "1");
    assert.equal(CountdownStep(0), 3, "GO");
    assert.equal(CountdownStep(-0.5), 3, "GO stays");
    assert.equal(CountdownStep(3.5), undefined, "no number above 3");
});

test("countdown numbers: the current one in, the one before knocked out, the rest not shown", () => {
    const states = (step) => [0, 1, 2, 3].map((i) => CountdownNumberState(i, step));
    assert.deepEqual(states(0), ["In", undefined, undefined, undefined], "3 falls in alone");
    assert.deepEqual(states(1), ["Out", "In", undefined, undefined], "2 knocks out 3");
    assert.deepEqual(states(2), [undefined, "Out", "In", undefined], "1 knocks out 2");
    assert.deepEqual(states(3), [undefined, undefined, undefined, "In"], "GO grows where the 1 was — nothing knocked out");
    assert.deepEqual(states(undefined), [undefined, undefined, undefined, undefined]);
});

test("DNF: the clock only starts over on a new checkpoint or lap", () => {
    const go = WatchProgress(undefined, 0, 0, 10);
    assert.deepEqual(go, { checkpoint: 0, laps: 0, since: 10 }, "starts at GO");
    assert.equal(WatchProgress(go, 0, 0, 30), go, "no progress: unchanged");
    assert.equal(WatchProgress(go, 1, 0, 30).since, 30, "a new checkpoint");
    assert.equal(WatchProgress({ checkpoint: 3, laps: 0, since: 10 }, 0, 1, 40).since, 40, "a lap (checkpoints back to 0)");
});

test("DNF: out after DNF_NO_PROGRESS_SECONDS without progress", () => {
    const watch = { checkpoint: 0, laps: 0, since: 10 };
    assert.ok(DnfSecondsLeft(watch, 10 + DNF_NO_PROGRESS_SECONDS - 0.1, DNF_NO_PROGRESS_SECONDS) > 0);
    assert.ok(DnfSecondsLeft(watch, 10 + DNF_NO_PROGRESS_SECONDS, DNF_NO_PROGRESS_SECONDS) <= 0);
});

test("DNF warning: whole seconds within the last DNF_WARNING_SECONDS, never 0", () => {
    assert.equal(DnfWarningValue(DNF_WARNING_SECONDS + 0.5, DNF_WARNING_SECONDS), undefined, "not yet");
    assert.equal(DnfWarningValue(DNF_WARNING_SECONDS, DNF_WARNING_SECONDS), DNF_WARNING_SECONDS);
    assert.equal(DnfWarningValue(2.3, DNF_WARNING_SECONDS), 3, "rounded up");
    assert.equal(DnfWarningValue(0.01, DNF_WARNING_SECONDS), 1);
    assert.equal(DnfWarningValue(0, DNF_WARNING_SECONDS), undefined, "out — nothing left to warn about");
});
