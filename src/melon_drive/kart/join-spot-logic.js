// Pure rules of where a joining player's melon appears (kart/join-spot.js):
// the "Start in Tutorial" setting inside the addon's parsed save data.
import { SAVE_DATA_PLAYER_SETTINGS_KEY } from "../constants/index.js";

/**
 * Whether `playerName` starts in the tutorial when joining — true unless
 * they switched it off (also for an unreadable entry).
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @param {string} playerName
 */
export function StartsInTutorial(saveData, playerName) {
    return saveData[SAVE_DATA_PLAYER_SETTINGS_KEY]?.[playerName]?.startInTutorial !== false;
}

/**
 * `saveData` with `playerName`'s "Start in Tutorial" set to `on` — the rest
 * (best times, other players, other settings) kept. The default (on) isn't
 * stored, so players who never touched it leave no entry.
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @param {string} playerName @param {boolean} on
 * @returns {Record<string, any>}
 */
export function WithStartsInTutorial(saveData, playerName, on) {
    const raw = saveData[SAVE_DATA_PLAYER_SETTINGS_KEY];
    const all = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
    const mine = { ...(all[playerName] && typeof all[playerName] === "object" ? all[playerName] : {}) };
    if (on) {
        delete mine.startInTutorial;
    } else {
        mine.startInTutorial = false;
    }
    if (Object.keys(mine).length > 0) {
        all[playerName] = mine;
    } else {
        delete all[playerName];
    }
    return { ...saveData, [SAVE_DATA_PLAYER_SETTINGS_KEY]: all };
}
