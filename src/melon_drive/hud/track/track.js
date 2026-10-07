import { Instance } from "cs_script/point_script";
import { GetTrackConfig } from "../../race/track-config.js";
import { RunElapsed, GetBestTime } from "../../race/time-trial/time-trial.js";
import { FormatRaceTime } from "../../race/time-trial/logic.js";
import { CheckpointStrip } from "./logic.js";
import { GetSpeedHud } from "../layout.js";
import { RUN_RESULT_SECONDS, CHECKPOINT_HUD_SLOTS } from "../../constants/index.js";

/**
 * The track HUD: the time trial panel top left (see race/time-trial/time-trial.js) — run
 * clock, the player's best on the track, and for RUN_RESULT_SECONDS after a
 * finish (in a heat: until it's over) the finish time — and the checkpoint
 * strip top center (start -> checkpoints -> finish, see
 * hud/track/logic.js) with the lap below it on multi-lap tracks. Shown
 * while the kart is on a track — or, right after a free-roaming finish took
 * it off the track, while that result is up.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart
 */
export function UpdateCheckpointHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const now = Instance.GetGameTime();
    const result = kart.lastRun && (kart.finished || now - kart.lastRun.at < RUN_RESULT_SECONDS) ? kart.lastRun : undefined;
    const trackId = kart.trackId ?? result?.trackId;
    hud.SetHasClassForPlayer(slot, "run_panel", "Hidden", trackId === undefined);
    hud.SetHasClassForPlayer(slot, "checkpoint_panel", "Hidden", trackId === undefined);
    if (trackId === undefined) {
        return;
    }
    const config = GetTrackConfig()[trackId];
    // Taken off the track by its finish (or parked after a heat's): show the
    // track as complete.
    const done = kart.trackId === undefined || kart.finished;
    UpdateRunPanel(hud, slot, kart, trackId, now, result);
    UpdateCheckpointStrip(hud, slot, config?.checkpoints ?? 0, kart.checkpointIndex, done);

    const laps = config?.lapsToWin ?? 1;
    hud.SetHasClassForPlayer(slot, "lap_row", "Hidden", laps <= 1);
    hud.SetDialogVariableStringForPlayer(slot, "lap_row", "lap_current", String(done ? laps : Math.min(kart.lapsCompleted + 1, laps)));
    hud.SetDialogVariableStringForPlayer(slot, "lap_row", "lap_total", String(laps));
}

/**
 * @param {any} hud @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} trackId @param {number} now
 * @param {import("../../core/kart-registry.js").Kart["lastRun"]} result the finish time to show, if any
 */
function UpdateRunPanel(hud, slot, kart, trackId, now, result) {
    const clock = kart.runStartTime !== undefined ? RunElapsed(kart, now) : result ? result.time : 0;
    hud.SetDialogVariableStringForPlayer(slot, "run_panel", "time", FormatRaceTime(clock));
    const best = GetBestTime(kart, trackId);
    hud.SetDialogVariableStringForPlayer(slot, "run_panel", "best", best !== undefined ? FormatRaceTime(best) : "-:--.--");
    hud.SetHasClassForPlayer(slot, "run_result", "Hidden", !result);
    if (result) {
        hud.SetHasClassForPlayer(slot, "run_result", "NewBest", result.newBest);
        hud.SetDialogVariableStringForPlayer(slot, "run_result", "result", `${result.newBest ? "NEW BEST" : "FINISH"} ${FormatRaceTime(result.time)}`);
    }
}

/**
 * Sets the strip's CHECKPOINT_HUD_SLOTS circles ("cp_slot_<i>", each with the
 * line "cp_link_<i>" before it), the "…" markers and the finish flag.
 * @param {any} hud @param {number} slot @param {number} total @param {number} reached @param {boolean} done
 */
function UpdateCheckpointStrip(hud, slot, total, reached, done) {
    const strip = CheckpointStrip(total, reached, CHECKPOINT_HUD_SLOTS, done);
    for (let i = 0; i < CHECKPOINT_HUD_SLOTS; i++) {
        const shown = strip.slots[i];
        const state = shown?.state;
        for (const id of [`cp_slot_${i}`, `cp_link_${i}`]) {
            hud.SetHasClassForPlayer(slot, id, "Unused", !shown);
            hud.SetHasClassForPlayer(slot, id, "Reached", state === "reached");
        }
        hud.SetHasClassForPlayer(slot, `cp_slot_${i}`, "Next", state === "next");
        if (shown) {
            hud.SetDialogVariableStringForPlayer(slot, `cp_slot_${i}`, "n", String(shown.number));
        }
    }
    hud.SetHasClassForPlayer(slot, "cp_more_before", "Hidden", !strip.moreBefore);
    hud.SetHasClassForPlayer(slot, "cp_more_after", "Hidden", !strip.moreAfter);
    hud.SetHasClassForPlayer(slot, "cp_link_finish", "Reached", strip.finish === "reached");
    hud.SetHasClassForPlayer(slot, "cp_finish", "Next", strip.finish === "next");
    hud.SetHasClassForPlayer(slot, "cp_finish", "Reached", strip.finish === "reached");
}
