// Pure rules of the melon skins (kart/skin.js): which skin a player has,
// inside the addon's parsed save data.
import { MELON_SKINS, MELON_SKIN_DEFAULT, MELON_SKINS_PER_PAGE } from "../constants/index.js";
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

/** How many pages the user menu's skin grid has (MELON_SKINS_PER_PAGE each, at least one). */
export function SkinPageCount() {
    return Math.max(1, Math.ceil(Object.keys(MELON_SKINS).length / MELON_SKINS_PER_PAGE));
}

/** The page (0-based) a skin is on, in MELON_SKINS order — the first for one that isn't a skin. @param {string} skin */
export function SkinPageOf(skin) {
    const index = Object.keys(MELON_SKINS).indexOf(skin);
    return index < 0 ? 0 : Math.floor(index / MELON_SKINS_PER_PAGE);
}

/** The page `direction` (-1 / +1) steps to from `page`, wrapping around. @param {number} page @param {number} direction */
export function StepSkinPage(page, direction) {
    const count = SkinPageCount();
    return (((page + direction) % count) + count) % count;
}

/** The pager's indicator: "2 / 3". @param {number} page */
export function SkinPageLabel(page) {
    return `${page + 1} / ${SkinPageCount()}`;
}
