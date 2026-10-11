// Pure rules of where a joining player's melon appears (kart/join-spot.js):
// the "Start in Tutorial" setting inside the addon's parsed save data.
import { PlayerSetting, WithPlayerSetting } from "./player-settings-logic.js";

/**
 * Whether `playerName` starts in the tutorial when joining — true unless
 * they switched it off (also for an unreadable entry).
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @param {string} playerName
 */
export function StartsInTutorial(saveData, playerName) {
    return PlayerSetting(saveData, playerName, "startInTutorial") !== false;
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
    return WithPlayerSetting(saveData, playerName, "startInTutorial", on ? undefined : false);
}
