import { Instance } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { FormatRaceTime, ParseSaveData, GetBestTimes, RecordRunTime } from "./logic.js";
import { SAVE_DATA_BEST_TIMES_KEY } from "../../constants/index.js";

// Time trial: every run over a track is timed, for every player on their
// own — from crossing the start line (outside a heat) or GO (in a heat) to
// the finish of the last lap. Breaking doesn't stop the clock (the lost time
// is the penalty); leaving the track (hub, tutorial, a new heat) cancels the
// run. Each player's best time per track is kept in the addon's save data,
// keyed by player name — the API has no stable player id. The rules are in
// race/time-trial/logic.js; race/checkpoints/checkpoints.js and race/heat/race-flow.js call in here.

// Parsed from the save data, re-parsed only when that string changes (the
// HUD asks for the best time every tick; the engine itself reads the file
// from disk only once).
/** @type {import("./logic.js").BestTimes} */
let bestTimes = {};
/** @type {string | undefined} */
let bestTimesSource = undefined;

function BestTimes() {
    const raw = Instance.GetSaveData();
    if (raw !== bestTimesSource) {
        bestTimes = GetBestTimes(ParseSaveData(raw));
        bestTimesSource = raw;
    }
    return bestTimes;
}

function SaveBestTimes() {
    // Re-read so keys other systems may keep in the save data survive.
    const data = ParseSaveData(Instance.GetSaveData());
    data[SAVE_DATA_BEST_TIMES_KEY] = bestTimes;
    const raw = JSON.stringify(data);
    Instance.SetSaveData(raw);
    bestTimesSource = raw; // already what bestTimes holds — no re-parse
}

/** @param {import("../../core/kart-registry.js").Kart} kart */
function PlayerName(kart) {
    return kart.pawn.GetPlayerController()?.GetPlayerName() ?? "";
}

/** Starts (or restarts) the kart's run clock. @param {import("../../core/kart-registry.js").Kart} kart @param {number} [now] */
export function StartRun(kart, now = Instance.GetGameTime()) {
    kart.runStartTime = now;
}

/** Stops the clock without a result — the kart left the track. @param {import("../../core/kart-registry.js").Kart} kart */
export function CancelRun(kart) {
    kart.runStartTime = undefined;
}

/**
 * The run is complete: stops the clock, records the time as the player's
 * best if it is one, and keeps it in kart.lastRun for the HUD. No-op without
 * a running clock.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} trackId
 */
export function FinishRun(kart, trackId) {
    if (kart.runStartTime === undefined) {
        return;
    }
    const now = Instance.GetGameTime();
    const time = now - kart.runStartTime;
    kart.runStartTime = undefined;
    const name = PlayerName(kart);
    // RecordRunTime updates the cached object in place; SaveBestTimes then
    // writes exactly that object back.
    const newBest = name !== "" && RecordRunTime(BestTimes(), trackId, name, time);
    if (newBest) {
        SaveBestTimes();
    }
    kart.lastRun = { trackId, time, newBest, at: now };
    Debug(`FinishRun: "${name}" ran track ${trackId} in ${FormatRaceTime(time)}${newBest ? " — new best" : ""}`);
}

/** Seconds on the kart's clock right now (0 if it isn't running). @param {import("../../core/kart-registry.js").Kart} kart @param {number} now */
export function RunElapsed(kart, now) {
    return kart.runStartTime === undefined ? 0 : now - kart.runStartTime;
}

/**
 * Whether the user menu offers "Restart Time Trial" (RestartTimeTrial in
 * race/checkpoints/checkpoints.js): only while the kart is on a track in a free-roaming time
 * trial (a finish puts it back at that track's start, so it stays), and
 * never in a heat (restarting there would be a free reset mid-race).
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function CanRestartTimeTrial(kart) {
    return !kart.racing && kart.trackId !== undefined;
}

/** This player's best time on `trackId`, if any. @param {import("../../core/kart-registry.js").Kart} kart @param {number} trackId */
export function GetBestTime(kart, trackId) {
    return BestTimes()[trackId]?.[PlayerName(kart)];
}
