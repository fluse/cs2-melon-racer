// Pure checkpoint/lap progression rules — no cs_script import, so they're
// unit-testable in Node (see test/checkpoint-progress.test.mjs).
// checkpoints.js wires these to the start_<trackId> /
// checkpoint_<trackId>_<index> / finish_<trackId> script inputs and handles
// the engine side (respawn position, FinishKart, debug logging). See
// "Multiple tracks & checkpoints" in GAMEPLAY.md for the design.
//
// All three functions mutate the kart's progress fields in place and return
// what happened, so the caller can log it and react (e.g. call FinishKart).

/**
 * @typedef {{ trackId: number | undefined, checkpointIndex: number, lapsCompleted: number, racing: boolean, finished: boolean }} KartProgress
 * @typedef {{ checkpoints: number, lapsToWin: number }} TrackRules
 * @typedef {{ activeTrackId: number | undefined, config: TrackRules | undefined }} ProgressContext
 *   config is the touched track's own config (undefined if the map has no
 *   start_* trigger for it)
 */

/**
 * @typedef {"ignored-finished" | "ignored-other-track" | "ignored-incomplete" | "lap" | "finished"} LapResult
 *   "finished" = that lap was the kart's last one — the run is over: the
 *   caller stops its clock and, in a heat, must FinishKart it.
 */

/**
 * finish_<trackId>: counts a completed lap if the kart is on this track (in
 * a heat: racing the heat's track) and has reached its last checkpoint
 * since the previous lap. Counts outside a heat too — a free-roaming run is
 * a time trial (see time-trial.js).
 * @param {KartProgress} kart @param {number} trackId @param {ProgressContext} ctx
 * @returns {LapResult}
 */
export function ApplyLapCompletion(kart, trackId, ctx) {
    if (kart.finished) {
        return "ignored-finished"; // already parked after finishing this heat
    }
    if (kart.trackId !== trackId || (kart.racing && trackId !== ctx.activeTrackId)) {
        return "ignored-other-track";
    }
    if (!ctx.config || kart.checkpointIndex < ctx.config.checkpoints) {
        return "ignored-incomplete";
    }
    kart.lapsCompleted += 1;
    if (kart.lapsCompleted >= ctx.config.lapsToWin) {
        return "finished";
    }
    // Not done yet — back to "no checkpoints reached" for the next lap.
    kart.checkpointIndex = 0;
    return "lap";
}

/**
 * @typedef {"ignored-finished" | "ignored-foreign-start" | "ignored-mid-lap" | "picked" | "lap" | "finished"} StartResult
 *   "picked" = a new run on this track starts here, no checkpoints reached
 *   (the caller starts its clock); "lap" = a lap counted, next one started;
 *   "finished" = ...and it was the kart's last one — the run is over (see
 *   LapResult). "picked"/"lap" make the start the kart's respawn point.
 */

/**
 * start_<trackId>: the start line.
 *
 * A kart isn't on any track until it crosses a start line, which picks
 * (starts its progress on) that track. Outside a heat, crossing it again
 * before checkpoint 1 starts the run over (e.g. after respawning behind the
 * line). A racing kart can't pick a
 * *different* track's start mid-heat — that would silently overwrite
 * kart.trackId to the wrong track and then reject the racer's own further
 * progress on their actual active track. (A heat puts its racers on the
 * track itself, see BeginHeat, so crossing the line right after the
 * countdown changes nothing.)
 *
 * On a loop track start_ and finish_ sit on the same trigger, and Hammer
 * doesn't guarantee which fires first — so crossing the start with the whole
 * lap already run counts the lap right here (via ApplyLapCompletion);
 * finish_<trackId> firing afterwards then sees no checkpoints reached and is
 * ignored. A track without checkpoints never counts a lap here (it would
 * count the very first crossing) — only finish_ does, so a point-to-point
 * track needs none.
 * @param {KartProgress} kart @param {number} trackId @param {ProgressContext} ctx
 * @returns {StartResult}
 */
export function ApplyStartTouch(kart, trackId, ctx) {
    if (kart.finished) {
        return "ignored-finished"; // parked after finishing this heat
    }
    if (kart.racing && trackId !== ctx.activeTrackId) {
        return "ignored-foreign-start";
    }
    const freshStart = !kart.racing && kart.checkpointIndex === 0 && kart.lapsCompleted === 0;
    if (kart.trackId !== trackId || freshStart) {
        kart.trackId = trackId;
        kart.checkpointIndex = 0;
        kart.lapsCompleted = 0;
        return "picked";
    }
    if (!ctx.config || ctx.config.checkpoints === 0 || kart.checkpointIndex < ctx.config.checkpoints) {
        return "ignored-mid-lap"; // doubling back over the line must not reset progress
    }
    // Can only be "lap" or "finished" here: the kart is on this track (a
    // racing one on the heat's, see above) with the whole lap run.
    return ApplyLapCompletion(kart, trackId, ctx) === "finished" ? "finished" : "lap";
}

/**
 * @typedef {"ignored-finished" | "ignored-other-track" | "ignored-skipped" | "ignored-behind" | "advanced"} CheckpointResult
 *   Only "advanced" moved checkpointIndex forward, i.e. the touched
 *   checkpoint is the kart's new respawn point.
 */

/**
 * checkpoint_<trackId>_<index>.
 *
 * Only counts while the kart is on that same track (picked by its start
 * line, start_<trackId>), and only ever moves progress forward, one
 * checkpoint at a time (no skipping ahead).
 * @param {KartProgress} kart @param {number} trackId @param {number} index
 * @returns {CheckpointResult}
 */
export function ApplyCheckpointTouch(kart, trackId, index) {
    if (kart.finished) {
        return "ignored-finished"; // parked after finishing this heat
    }
    if (kart.trackId !== trackId) {
        return "ignored-other-track";
    }
    // Strictly the next checkpoint in sequence — skipping ahead (e.g. 1 -> 5
    // via a shortcut) must not count, or touching just the last checkpoint
    // would be enough for finish_<trackId> to accept the lap.
    if (index !== kart.checkpointIndex + 1) {
        return index > kart.checkpointIndex ? "ignored-skipped" : "ignored-behind";
    }
    kart.checkpointIndex = index;
    return "advanced";
}
