// The melon's glow color rules (src/melon_drive/kart/look-logic.js): a
// color picked in the user menu, else the paint once painted, else green —
// and the pick kept per player name in the save data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IsGlowColor, MelonGlowColor, SavedGlowColor, WithGlowColor } from "../../src/melon_drive/kart/look-logic.js";
import { COLOR_PRESETS, MELON_GLOW_UNPAINTED_COLOR, SAVE_DATA_PLAYER_SETTINGS_KEY } from "../../src/melon_drive/constants/index.js";

const [RED, BLUE] = Object.keys(COLOR_PRESETS);

test("glow color: the picked one, else the paint once painted, else green", () => {
    const paint = { r: 1, g: 2, b: 3, a: 255 };
    assert.deepEqual(MelonGlowColor(RED, true, paint), COLOR_PRESETS[RED], "a pick beats the paint");
    assert.deepEqual(MelonGlowColor(RED, false, paint), COLOR_PRESETS[RED]);
    assert.deepEqual(MelonGlowColor(undefined, true, paint), paint);
    assert.deepEqual(MelonGlowColor(undefined, false, paint), MELON_GLOW_UNPAINTED_COLOR);
    assert.deepEqual(MelonGlowColor("gone", true, paint), paint, "a pick that's no preset any more");
});

test("only COLOR_PRESETS keys are glow colors", () => {
    assert.ok(IsGlowColor(RED));
    assert.ok(!IsGlowColor("toString"), "not an inherited property");
    assert.ok(!IsGlowColor(undefined));
});

test("saved per player name, the rest of the save data kept; none picked stores nothing", () => {
    const data = { best: { 1: { Anna: 30 } }, [SAVE_DATA_PLAYER_SETTINGS_KEY]: { Anna: { skin: "gold" } } };
    const saved = WithGlowColor(data, "Anna", BLUE);
    assert.equal(SavedGlowColor(saved, "Anna"), BLUE);
    assert.equal(SavedGlowColor(saved, "Ben"), undefined);
    assert.deepEqual(saved.best, data.best);
    assert.equal(saved[SAVE_DATA_PLAYER_SETTINGS_KEY].Anna.skin, "gold");
    assert.equal(SavedGlowColor(WithGlowColor(saved, "Anna", undefined), "Anna"), undefined);
    assert.equal(SavedGlowColor({ [SAVE_DATA_PLAYER_SETTINGS_KEY]: { Anna: { glowColor: "gone" } } }, "Anna"), undefined);
});
