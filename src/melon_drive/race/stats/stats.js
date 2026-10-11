import { Instance } from "cs_script/point_script";
import { karts } from "../../core/kart-registry.js";
import { ParseSaveData } from "../time-trial/logic.js";
import { GetStats, AddStat, StatTotals } from "./logic.js";
import { SAVE_DATA_STATS_KEY, STATS_SAVE_SECONDS } from "../../constants/index.js";

// Player stats: all-time totals per player name, kept in the addon's save
// data like the best times (the API has no stable player id, so renaming
// starts from scratch). Counted here from wherever they happen — time on the
// server (UpdateStats, every tick for every player with a melon), crashes
// (health/breaking/), finishes (race/time-trial/), boost time
// (movement/driving/drive.js), PERFECT wall hits (movement/wall-bounce/,
// movement/jump/) and time trial restarts (race/checkpoints/) — and shown on the user menu's leaderboards
// page and in its profile (hud/leaderboards/, hud/profile/). Rules: race/stats/logic.js.

// Read from the save data once, then kept in memory and written back every
// STATS_SAVE_SECONDS while something changed (SetSaveData writes the file).
/** @type {import("./logic.js").Stats | undefined} */
let stats = undefined;
let dirty = false;
let nextSaveTime = 0;

function Stats() {
    stats ??= GetStats(ParseSaveData(Instance.GetSaveData()));
    return stats;
}

/** @param {import("../../core/kart-registry.js").Kart} kart */
function PlayerName(kart) {
    return kart.pawn.GetPlayerController()?.GetPlayerName() ?? "";
}

/**
 * Adds to a player's total (`key` from STAT_SLIDES; 1 for a count, seconds
 * for a duration).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {string} key @param {number} [amount]
 */
export function CountStat(kart, key, amount = 1) {
    if (AddStat(Stats(), PlayerName(kart), key, amount)) {
        dirty = true;
    }
}

/** Writes the totals to the save data if anything changed since the last time. */
export function SaveStats() {
    if (!dirty || !stats) {
        return;
    }
    // Re-read so keys other systems keep in the save data survive.
    const data = ParseSaveData(Instance.GetSaveData());
    data[SAVE_DATA_STATS_KEY] = stats;
    Instance.SetSaveData(JSON.stringify(data));
    dirty = false;
}

/**
 * Per tick, from core/think.js: time on the server for every player with a
 * melon, and the periodic save.
 * @param {number} now @param {number} dt
 */
export function UpdateStats(now, dt) {
    for (const kart of karts.values()) {
        CountStat(kart, "playTime", dt);
    }
    if (now >= nextSaveTime) {
        nextSaveTime = now + STATS_SAVE_SECONDS;
        SaveStats();
    }
}

/** Every player's total of one stat, by name, saved ones included. @param {string} key */
export function GetStatTotals(key) {
    return StatTotals(Stats(), key);
}
