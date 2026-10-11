// Pure rules of the player stats (race/stats/stats.js): the totals in the
// save data, adding to them, and how a value reads. No cs_script import
// (test/race/stats.test.mjs).
import { SAVE_DATA_STATS_KEY, STAT_SLIDES } from "../../constants/index.js";

/** @typedef {Record<string, Record<string, number>>} Stats every player's totals by name, then by stat key */

const STAT_KEYS = new Set(STAT_SLIDES.map((slide) => slide.key));

/**
 * The stats in parsed save data — anything that isn't a known stat with a
 * non-negative number is dropped.
 * @param {Record<string, unknown>} saveData @returns {Stats}
 */
export function GetStats(saveData) {
    const raw = saveData[SAVE_DATA_STATS_KEY];
    /** @type {Stats} */
    const stats = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return stats;
    }
    for (const [name, totals] of Object.entries(raw)) {
        if (!totals || typeof totals !== "object") {
            continue;
        }
        for (const [key, value] of Object.entries(totals)) {
            if (STAT_KEYS.has(key) && typeof value === "number" && Number.isFinite(value) && value >= 0) {
                (stats[name] ??= {})[key] = value;
            }
        }
    }
    return stats;
}

/**
 * Adds `amount` to a player's total, in place. Ignores an empty name and
 * anything that isn't a positive amount.
 * @param {Stats} stats @param {string} name @param {string} key @param {number} amount
 * @returns {boolean} whether anything changed
 */
export function AddStat(stats, name, key, amount) {
    if (name === "" || !STAT_KEYS.has(key) || !(amount > 0)) {
        return false;
    }
    const totals = (stats[name] ??= {});
    totals[key] = (totals[key] ?? 0) + amount;
    return true;
}

/** Every player's total of one stat, by name (players without one left out). @param {Stats} stats @param {string} key */
export function StatTotals(stats, key) {
    /** @type {Record<string, number>} */
    const totals = {};
    for (const [name, values] of Object.entries(stats)) {
        if (values[key] !== undefined) {
            totals[name] = values[key];
        }
    }
    return totals;
}

/**
 * Seconds as a duration: "1h 05m" from an hour on, "4m 12s" from a minute
 * on, else "37s".
 * @param {number} seconds
 */
export function FormatDuration(seconds) {
    const whole = Math.floor(Math.max(seconds, 0));
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${String(secs).padStart(2, "0")}s`;
    }
    return `${secs}s`;
}

/** A stat's value as the leaderboards and the profile show it. @param {{ format: string }} slide @param {number} value */
export function FormatStat(slide, value) {
    return slide.format === "duration" ? FormatDuration(value) : String(Math.round(value));
}
