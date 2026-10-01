import { test } from "node:test";
import assert from "node:assert/strict";
import { BreakCountdownValue, CountdownDigits } from "../../src/melon_drive/race/heat/logic.js";
import { BREAK_SECONDS } from "../../src/melon_drive/constants/index.js";

test("the break countdown runs BREAK_SECONDS down to 0", () => {
    assert.equal(BreakCountdownValue(BREAK_SECONDS), BREAK_SECONDS);
    assert.equal(BreakCountdownValue(BREAK_SECONDS - 0.6), BREAK_SECONDS - 1);
    assert.equal(BreakCountdownValue(1.2), 1);
    assert.equal(BreakCountdownValue(0.4), 0);
    assert.equal(BreakCountdownValue(-1), 0, "never below 0");
});

test("countdown digits: no leading zero, at most two digits", () => {
    assert.deepEqual(CountdownDigits(0), { tens: undefined, ones: 0 });
    assert.deepEqual(CountdownDigits(7), { tens: undefined, ones: 7 });
    assert.deepEqual(CountdownDigits(10), { tens: 1, ones: 0 });
    assert.deepEqual(CountdownDigits(42), { tens: 4, ones: 2 });
    assert.deepEqual(CountdownDigits(150), { tens: 9, ones: 9 });
    assert.deepEqual(CountdownDigits(-3), { tens: undefined, ones: 0 });
});
