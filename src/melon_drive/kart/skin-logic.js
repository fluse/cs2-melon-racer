// Pure rules of the melon skins (kart/skin.js): which skin a player has,
// inside the addon's parsed save data.
import { MELON_SKINS, MELON_SKIN_DEFAULT } from "../constants/index.js";
import { PlayerSetting, WithPlayerSetting } from "./player-settings-logic.js";

/** Whether `skin` is one of MELON_SKINS. @param {unknown} skin */
export function IsSkin(skin) {
    return typeof skin === "string" && Object.prototype.hasOwnProperty.call(MELON_SKINS, skin);
}

/**
 * `playerName`'s skin — the default unless they picked another, and also for
 * a stored skin that no longer exists.
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @param {string} playerName
 */
export function SavedSkin(saveData, playerName) {
    const skin = PlayerSetting(saveData, playerName, "skin");
    return IsSkin(skin) ? skin : MELON_SKIN_DEFAULT;
}

/**
 * `saveData` with `playerName`'s skin set — the default isn't stored.
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @param {string} playerName @param {string} skin
 * @returns {Record<string, any>}
 */
export function WithSkin(saveData, playerName, skin) {
    return WithPlayerSetting(saveData, playerName, "skin", skin === MELON_SKIN_DEFAULT ? undefined : skin);
}
