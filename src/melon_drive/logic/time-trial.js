// Pure time-trial rules — no cs_script import, so they're unit-testable in
// Node (see test/time-trial.test.mjs). time-trial.js applies them: starts
// and stops a kart's run clock, and reads/writes the best times through
// Instance.GetSaveData/SetSaveData.
import { SAVE_DATA_BEST_TIMES_KEY } from "../constants/index.js";

/**
 * Best time (seconds) per track id per player name.
 * @typedef {Record<string, Record<string, number>>} BestTimes
 */

/**
 * "m:ss.cc", e.g. 83.456 -> "1:23.45". Truncated, not rounded, like a
 * stopwatch — a run is never shown faster than it was.
 * @param {number} seconds
 */
export function FormatRaceTime(seconds) {
    const centis = Math.floor(Math.max(0, seconds) * 100 + 1e-6);
    const minutes = Math.floor(centis / 6000);
    const secs = Math.floor(centis / 100) % 60;
    const rest = centis % 100;
    return `${minutes}:${String(secs).padStart(2, "0")}.${String(rest).padStart(2, "0")}`;
}

/**
 * The addon's whole save data as an object — anything unreadable (empty on
 * first run, or written by something else) counts as empty rather than
 * throwing, so a broken file can't stop the script.
 * @param {string} raw
 * @returns {Record<string, any>}
 */
export function ParseSaveData(raw) {
    if (!raw) {
        return {};
    }
    try {
        const data = JSON.parse(raw);
        return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch {
        return {};
    }
}

/**
 * The best times inside parsed save data (a fresh object if there are none).
 * Drops entries that aren't positive numbers.
 * @param {Record<string, any>} saveData
 * @returns {BestTimes}
 */
export function GetBestTimes(saveData) {
    const raw = saveData[SAVE_DATA_BEST_TIMES_KEY];
    /** @type {BestTimes} */
    const best = {};
    if (!raw || typeof raw !== "object") {
        return best;
    }
    for (const [trackId, players] of Object.entries(raw)) {
        if (!players || typeof players !== "object") {
            continue;
        }
        for (const [name, time] of Object.entries(players)) {
            if (typeof time === "number" && time > 0 && Number.isFinite(time)) {
                (best[trackId] ??= {})[name] = time;
            }
        }
    }
    return best;
}

/**
 * Records a finished run. Only a faster time than the player's best on
 * that track replaces it.
 * @param {BestTimes} best @param {number} trackId @param {string} playerName @param {number} time
 * @returns {boolean} whether it's a new best
 */
export function RecordRunTime(best, trackId, playerName, time) {
    const previous = best[trackId]?.[playerName];
    if (previous !== undefined && previous <= time) {
        return false;
    }
    (best[trackId] ??= {})[playerName] = time;
    return true;
}
