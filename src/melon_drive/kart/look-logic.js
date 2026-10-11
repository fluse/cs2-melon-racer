// Pure rules of the melon's outline glow color (kart/look.js): a color
// picked in the user menu (a COLOR_PRESETS key, saved per player name like
// the skin), else the paint color once painted, else green. No cs_script
// import (test/kart/look-logic.test.mjs).
import { COLOR_PRESETS, MELON_GLOW_UNPAINTED_COLOR } from "../constants/index.js";
import { PlayerSetting, WithPlayerSetting } from "./player-settings-logic.js";

/** Whether `key` is one of COLOR_PRESETS. @param {unknown} key */
export function IsGlowColor(key) {
    return typeof key === "string" && Object.prototype.hasOwnProperty.call(COLOR_PRESETS, key);
}

/**
 * `playerName`'s glow color (a COLOR_PRESETS key) — undefined unless they
 * picked one, also for a stored one that no longer exists.
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @param {string} playerName
 */
export function SavedGlowColor(saveData, playerName) {
    const key = PlayerSetting(saveData, playerName, "glowColor");
    return IsGlowColor(key) ? key : undefined;
}

/**
 * `saveData` with `playerName`'s glow color set (undefined: none, the glow
 * follows the paint).
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @param {string} playerName @param {string | undefined} key
 * @returns {Record<string, any>}
 */
export function WithGlowColor(saveData, playerName, key) {
    return WithPlayerSetting(saveData, playerName, "glowColor", key);
}

/**
 * The color a melon's outline glows in: the picked glow color, else its
 * paint color once painted, else MELON_GLOW_UNPAINTED_COLOR.
 * @param {string | undefined} glowColor a COLOR_PRESETS key
 * @param {boolean | undefined} painted @param {{ r: number, g: number, b: number, a: number }} paintColor
 */
export function MelonGlowColor(glowColor, painted, paintColor) {
    if (glowColor !== undefined && IsGlowColor(glowColor)) {
        return COLOR_PRESETS[glowColor];
    }
    return painted ? paintColor : MELON_GLOW_UNPAINTED_COLOR;
}
