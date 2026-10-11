// Pure rules of the per-player settings in the addon's parsed save data
// (SAVE_DATA_PLAYER_SETTINGS_KEY): one object per player name, holding only
// what isn't at its default. Used by kart/join-spot-logic.js,
// kart/skin-logic.js and kart/look-logic.js.
import { SAVE_DATA_PLAYER_SETTINGS_KEY } from "../constants/index.js";

/**
 * `playerName`'s stored value of `key` (undefined if not stored).
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @param {string} playerName @param {string} key
 */
export function PlayerSetting(saveData, playerName, key) {
    return saveData[SAVE_DATA_PLAYER_SETTINGS_KEY]?.[playerName]?.[key];
}

/**
 * `saveData` with `playerName`'s `key` set to `value` — or removed, for
 * undefined (the default). The rest (best times, other players, other
 * settings) kept; a player left with no settings leaves no entry.
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @param {string} playerName @param {string} key @param {any} value
 * @returns {Record<string, any>}
 */
export function WithPlayerSetting(saveData, playerName, key, value) {
    const raw = saveData[SAVE_DATA_PLAYER_SETTINGS_KEY];
    const all = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
    const mine = { ...(all[playerName] && typeof all[playerName] === "object" ? all[playerName] : {}) };
    if (value === undefined) {
        delete mine[key];
    } else {
        mine[key] = value;
    }
    if (Object.keys(mine).length > 0) {
        all[playerName] = mine;
    } else {
        delete all[playerName];
    }
    return { ...saveData, [SAVE_DATA_PLAYER_SETTINGS_KEY]: all };
}
