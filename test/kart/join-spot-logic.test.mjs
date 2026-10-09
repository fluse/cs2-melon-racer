// "Start in Tutorial" in the save data (kart/join-spot-logic.js): on by
// default, kept per player name, everything else in the save data untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { StartsInTutorial, WithStartsInTutorial } from "../../src/melon_drive/kart/join-spot-logic.js";
import { SAVE_DATA_PLAYER_SETTINGS_KEY, SAVE_DATA_BEST_TIMES_KEY } from "../../src/melon_drive/constants/index.js";

test("on by default — no save data, no entry, or an unreadable one", () => {
    assert.equal(StartsInTutorial({}, "Ana"), true);
    assert.equal(StartsInTutorial({ [SAVE_DATA_PLAYER_SETTINGS_KEY]: { Bo: { startInTutorial: false } } }, "Ana"), true);
    assert.equal(StartsInTutorial({ [SAVE_DATA_PLAYER_SETTINGS_KEY]: "junk" }, "Ana"), true);
});

test("switched off and back on, per player name; the rest of the save data kept", () => {
    const best = { 1: { Ana: 42.5 } };
    const off = WithStartsInTutorial({ [SAVE_DATA_BEST_TIMES_KEY]: best }, "Ana", false);
    assert.equal(StartsInTutorial(off, "Ana"), false);
    assert.equal(StartsInTutorial(off, "Bo"), true, "only Ana");
    assert.deepEqual(off[SAVE_DATA_BEST_TIMES_KEY], best, "best times kept");

    const both = WithStartsInTutorial(off, "Bo", false);
    const on = WithStartsInTutorial(both, "Ana", true);
    assert.equal(StartsInTutorial(on, "Ana"), true);
    assert.equal(StartsInTutorial(on, "Bo"), false, "Bo's kept");
    assert.equal(on[SAVE_DATA_PLAYER_SETTINGS_KEY].Ana, undefined, "the default leaves no entry");
});
