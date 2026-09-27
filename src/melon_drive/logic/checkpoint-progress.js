// Pure checkpoint/lap progression rules — no cs_script import, so they're
// unit-testable in Node (see test/checkpoint-progress.test.mjs).
// checkpoints.js wires these to the checkpoint_<trackId>_<index> /
// finish_<trackId> script inputs and handles the engine side (respawn
// position, FinishKart, debug logging). See "Multiple tracks & checkpoints"
// in GAMEPLAY.md for the design.
//
// Both functions mutate the kart's progress fields in place and return what
// happened, so the caller can log it and react (e.g. call FinishKart).

/**
 * @typedef {{ trackId: number | undefined, checkpointIndex: number, lapsCompleted: number, racing: boolean, finished: boolean }} KartProgress
 * @typedef {{ checkpoints: number, lapsToWin: number }} TrackRules
 * @typedef {{ activeTrackId: number | undefined, config: TrackRules | undefined }} ProgressContext
 *   config is the touched track's own config (undefined if the map has no
 *   track_start_* trigger for it)
 */

/**
 * @typedef {"ignored-finished" | "ignored-not-racing" | "ignored-incomplete" | "lap" | "finished"} LapResult
 *   "finished" = that lap was the kart's last one — the caller must FinishKart it.
 */

/**
 * finish_<trackId>: counts a completed lap if the kart is actively racing
 * this track and has reached its last checkpoint since the previous lap.
 * @param {KartProgress} kart @param {number} trackId @param {ProgressContext} ctx
 * @returns {LapResult}
 */
export function ApplyLapCompletion(kart, trackId, ctx) {
    if (kart.finished) {
        return "ignored-finished"; // already parked after finishing this heat
    }
    if (!kart.racing || trackId !== ctx.activeTrackId || kart.trackId !== trackId) {
        return "ignored-not-racing";
    }
    if (!ctx.config || kart.checkpointIndex < ctx.config.checkpoints) {
        return "ignored-incomplete";
    }
    kart.lapsCompleted += 1;
    if (kart.lapsCompleted >= ctx.config.lapsToWin) {
        return "finished";
    }
    // Not done yet — back to "no checkpoints reached" for the next lap
    // (not 1: crossing the finish line itself isn't checkpoint 1 again,
    // it's the boundary between laps).
    kart.checkpointIndex = 0;
    return "lap";
}

/**
 * @typedef {"ignored-finished" | "ignored-foreign-start" | "ignored-other-track" | "ignored-skipped" | "ignored-behind" | "advanced" | "lap-advanced" | "finished"} CheckpointResult
 *   "lap-advanced" = crossing checkpoint 1 also completed a lap (see below);
 *   "finished" = ...and that lap was the kart's last one — the caller must
 *   FinishKart it. Only "advanced"/"lap-advanced" moved checkpointIndex
 *   forward, i.e. the touched checkpoint is the kart's new respawn point.
 */

/**
 * checkpoint_<trackId>_<index>.
 *
 * A kart isn't on any track until it touches a "_1" checkpoint, which picks
 * (starts its progress on) that track. Checkpoints past index 1 only count
 * while the kart is already on that same track, and only ever move progress
 * forward, one checkpoint at a time (no skipping ahead). A racing kart can't
 * pick a *different* track's checkpoint 1 mid-heat either — that would
 * silently overwrite kart.trackId to the wrong track and then reject the
 * racer's own further progress on their actual active track.
 *
 * Re-touching "_1" with the whole lap already run counts the lap right here
 * (via ApplyLapCompletion), so it doesn't matter whether Hammer fires this
 * or finish_<trackId> first when both sit on the same trigger —
 * finish_<trackId> firing afterwards then sees checkpointIndex 1 and is
 * ignored. Outside a heat nothing is counted, but progress still resets, or
 * a free-roaming kart could never start a second lap.
 * @param {KartProgress} kart @param {number} trackId @param {number} index @param {ProgressContext} ctx
 * @returns {CheckpointResult}
 */
export function ApplyCheckpointTouch(kart, trackId, index, ctx) {
    if (kart.finished) {
        return "ignored-finished"; // parked after finishing this heat
    }
    let lapCounted = false;
    if (index === 1) {
        if (kart.racing && trackId !== ctx.activeTrackId) {
            return "ignored-foreign-start";
        }
        if (kart.trackId !== trackId) {
            kart.trackId = trackId;
            kart.checkpointIndex = 0;
        } else if (ctx.config && kart.checkpointIndex >= ctx.config.checkpoints) {
            // Crossing the start line with the whole lap already run.
            const lap = ApplyLapCompletion(kart, trackId, ctx);
            if (lap === "finished") {
                return "finished";
            }
            lapCounted = lap === "lap";
            kart.checkpointIndex = 0;
        }
    } else if (kart.trackId !== trackId) {
        return "ignored-other-track";
    }
    // Strictly the next checkpoint in sequence — skipping ahead (e.g. 1 -> 5
    // via a shortcut) must not count, or touching just the last checkpoint
    // would be enough for finish_<trackId> to accept the lap.
    if (index !== kart.checkpointIndex + 1) {
        return index > kart.checkpointIndex ? "ignored-skipped" : "ignored-behind";
    }
    kart.checkpointIndex = index;
    return lapCounted ? "lap-advanced" : "advanced";
}
