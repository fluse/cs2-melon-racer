// The melon skin inside the save data (kart/skin-logic.js) and the shared
// per-player settings it's stored in (kart/player-settings-logic.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { IsSkin, SavedSkin, WithSkin } from "../../src/melon_drive/kart/skin-logic.js";
import { StartsInTutorial, WithStartsInTutorial } from "../../src/melon_drive/kart/join-spot-logic.js";
import { MELON_SKINS, MELON_SKIN_DEFAULT, SAVE_DATA_PLAYER_SETTINGS_KEY } from "../../src/melon_drive/constants/index.js";

const OTHER_SKIN = Object.keys(MELON_SKINS).find((skin) => skin !== MELON_SKIN_DEFAULT);

test("skins: the default skin is one of the skins, and there's at least one other", () => {
    assert.ok(IsSkin(MELON_SKIN_DEFAULT));
    assert.ok(OTHER_SKIN);
    assert.equal(IsSkin("no_such_skin"), false);
    assert.equal(IsSkin("toString"), false, "not an inherited property");
});

test("skins: a player who never picked one has the default", () => {
    assert.equal(SavedSkin({}, "Anna"), MELON_SKIN_DEFAULT);
});

test("skins: a picked skin is saved for that player only", () => {
    const data = WithSkin({}, "Anna", OTHER_SKIN);
    assert.equal(SavedSkin(data, "Anna"), OTHER_SKIN);
    assert.equal(SavedSkin(data, "Ben"), MELON_SKIN_DEFAULT);
});

test("skins: back to the default leaves no entry", () => {
    const data = WithSkin(WithSkin({}, "Anna", OTHER_SKIN), "Anna", MELON_SKIN_DEFAULT);
    assert.deepEqual(data[SAVE_DATA_PLAYER_SETTINGS_KEY], {});
});

test("skins: a stored skin that no longer exists reads as the default", () => {
    const data = { [SAVE_DATA_PLAYER_SETTINGS_KEY]: { Anna: { skin: "neon" } } };
    assert.equal(SavedSkin(data, "Anna"), MELON_SKIN_DEFAULT);
});

test("skins: the skin and Start in Tutorial live side by side, the rest of the save data kept", () => {
    let data = { bestTimes: { 1: { Anna: 61.5 } } };
    data = WithStartsInTutorial(data, "Anna", false);
    data = WithSkin(data, "Anna", OTHER_SKIN);
    assert.equal(StartsInTutorial(data, "Anna"), false);
    assert.equal(SavedSkin(data, "Anna"), OTHER_SKIN);
    assert.deepEqual(data.bestTimes, { 1: { Anna: 61.5 } });
    data = WithStartsInTutorial(data, "Anna", true);
    assert.equal(SavedSkin(data, "Anna"), OTHER_SKIN, "switching the other setting keeps the skin");
});
