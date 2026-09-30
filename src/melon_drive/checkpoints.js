import { Instance } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { FindKartByMelon } from "./kart-registry.js";
import { activeTrackId, FinishKart } from "./race-flow.js";
import { GetTrackConfig } from "./track-config.js";
import { ApplyCheckpointTouch, ApplyLapCompletion } from "./logic/checkpoint-progress.js";
import { MAX_TRACKS, MAX_CHECKPOINTS_PER_TRACK, TELEPORT_UP_OFFSET } from "./constants/index.js";
import { Lifted, GetCheckpointSpawnPoint } from "./spawn-points.js";

// Checkpoints: place a trigger_multiple per checkpoint, filtered to the
// melon (prop_physics) so the frozen/parked pawn can't trigger it, with its
// OnStartTouch calling this point_script's RunScriptInput and a parameter of
// "checkpoint_<trackId>_<index>" — e.g. track 2's 3rd checkpoint is
// "checkpoint_2_3". If the melon breaks after reaching it, it respawns at
// the info_target named "checkpoint_spawn_<trackId>_<index>", facing that
// entity's yaw — or, without one, at the trigger's own position/angles.
//
// The progression rules themselves (which touch counts, one checkpoint at
// a time, "_1" picks the track, lap counting on a "_1" re-touch) live in
// logic/checkpoint-progress.js so they can be unit-tested without the
// engine — this is just the engine side around them.
/** @param {number} trackId @param {number} index @param {import("./kart-registry.js").Kart} kart @param {any} trigger */
function OnCheckpointTouched(trackId, index, kart, trigger) {
    const ctx = { activeTrackId, config: GetTrackConfig()[trackId] };
    const result = ApplyCheckpointTouch(kart, trackId, index, ctx);
    switch (result) {
        case "ignored-finished":
        case "ignored-behind":
            return;
        case "ignored-foreign-start":
            Debug(`checkpoint_${trackId}_1: kart is racing active track ${activeTrackId}, ignoring foreign track's start`);
            return;
        case "ignored-other-track":
            Debug(`checkpoint_${trackId}_${index}: kart is on track ${kart.trackId}, ignoring`);
            return;
        case "ignored-skipped":
            Debug(`checkpoint_${trackId}_${index}: kart is at checkpoint ${kart.checkpointIndex}, skipped one — ignoring`);
            return;
        case "finished":
            LogLapCompleted(trackId, kart, ctx.config);
            FinishKart(kart);
            return;
        case "lap-advanced":
            LogLapCompleted(trackId, kart, ctx.config);
            break;
    }
    const spawn = GetCheckpointSpawnPoint(trackId, index);
    if (spawn) {
        kart.checkpointPosition = spawn.position;
        kart.checkpointAngles = spawn.angles;
    } else {
        Debug(`checkpoint_${trackId}_${index}: no info_target "checkpoint_spawn_${trackId}_${index}", respawning at the trigger itself`);
        // + TELEPORT_UP_OFFSET for the same reason BeginHeat adds
        // it to their teleport targets: mappers commonly sink a checkpoint
        // trigger's brush into the floor so a fast-moving melon reliably
        // touches it, and teleporting to that exact (embedded) height would
        // otherwise make a later respawn (e.g. after BreakMelon) tunnel the
        // melon down through the floor instead of landing on it.
        kart.checkpointPosition = Lifted(trigger.GetAbsOrigin(), TELEPORT_UP_OFFSET);
        kart.checkpointAngles = trigger.GetAbsAngles();
    }
    Debug(`checkpoint_${trackId}_${index}: kart advanced to checkpoint ${index} on track ${trackId}`);
}

// Finish: add an OnStartTouch output, RunScriptInput with parameter
// "finish_<trackId>", to whichever trigger_multiple physically sits on that
// track's finish line — often that's the same trigger as the
// track_start_<trackId>_cp<N>_laps<M> entity itself (start and finish are
// normally the same line), but it can equally be checkpoint_<trackId>_1's
// trigger, or its own separate volume; only the activator (the melon) is
// read here, not which entity fired it, so it doesn't matter which one you
// pick, or whether more than one of them also fires it. Filtered to
// prop_physics like the checkpoints. Deliberately a separate input from
// checkpoint_<trackId>_1 rather than folded into it: this is the one and
// only place that counts a completed lap/finished heat, so it doesn't
// depend on whatever order Hammer fires a trigger's multiple outputs in, and
// gives lap/finish completion its own dedicated debug line to check against
// when a heat won't end. See "Hub -> race -> next-track flow" in
// GAMEPLAY.md.
/** @param {number} trackId @param {import("./kart-registry.js").Kart} kart */
function OnFinishTouched(trackId, kart) {
    const config = GetTrackConfig()[trackId];
    const result = ApplyLapCompletion(kart, trackId, { activeTrackId, config });
    switch (result) {
        case "ignored-finished":
            return;
        case "ignored-not-racing":
            Debug(
                `finish_${trackId}: kart isn't actively racing this track ` +
                `(racing=${kart.racing}, trackId=${kart.trackId}, activeTrackId=${activeTrackId}), ignoring`
            );
            return;
        case "ignored-incomplete":
            Debug(`finish_${trackId}: kart hasn't reached all ${config?.checkpoints ?? "?"} checkpoint(s) this lap yet (at ${kart.checkpointIndex}), ignoring`);
            return;
        case "lap":
            LogLapCompleted(trackId, kart, config);
            return;
        case "finished":
            LogLapCompleted(trackId, kart, config);
            FinishKart(kart);
            return;
    }
}

/** @param {number} trackId @param {import("./kart-registry.js").Kart} kart @param {{ lapsToWin: number } | undefined} config */
function LogLapCompleted(trackId, kart, config) {
    Debug(`finish_${trackId}: lap ${kart.lapsCompleted}/${config?.lapsToWin ?? "?"} completed on track ${trackId}`);
}

/** Registers the checkpoint_<trackId>_<index> and finish_<trackId> OnScriptInput handlers for every track/checkpoint slot the map is allowed to use. Called once from index.js. */
export function RegisterCheckpointAndFinishInputs() {
    for (let t = 1; t <= MAX_TRACKS; t++) {
        for (let i = 1; i <= MAX_CHECKPOINTS_PER_TRACK; i++) {
            const trackId = t;
            const index = i;
            Instance.OnScriptInput(`checkpoint_${trackId}_${index}`, ({ caller, activator }) => {
                const kart = activator && FindKartByMelon(activator);
                if (!kart || !caller) {
                    Debug(`checkpoint_${trackId}_${index}: activator wasn't a tracked melon, ignoring`);
                    return;
                }
                OnCheckpointTouched(trackId, index, kart, caller);
            });
        }
    }

    for (let t = 1; t <= MAX_TRACKS; t++) {
        const trackId = t;
        Instance.OnScriptInput(`finish_${trackId}`, ({ activator }) => {
            const kart = activator && FindKartByMelon(activator);
            if (!kart) {
                Debug(`finish_${trackId}: activator wasn't a tracked melon, ignoring`);
                return;
            }
            OnFinishTouched(trackId, kart);
        });
    }
}
