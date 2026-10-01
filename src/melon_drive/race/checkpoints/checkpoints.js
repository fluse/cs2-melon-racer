import { Instance } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { FindKartByMelon } from "../../core/kart-registry.js";
import { activeTrackId, FinishKart } from "../heat/race-flow.js";
import { GetTrackConfig } from "../track-config.js";
import { ApplyCheckpointTouch, ApplyLapCompletion, ApplyStartTouch } from "./logic.js";
import { MAX_TRACKS, MAX_CHECKPOINTS_PER_TRACK, TELEPORT_UP_OFFSET } from "../../constants/index.js";
import { Lifted, GetCheckpointSpawnPoint, GetStartSpawnPoint } from "../../kart/spawn-points.js";
import { StartRun, FinishRun, CancelRun, CanRestartTimeTrial } from "../time-trial/time-trial.js";
// Straight from teleport.js, not movement/index.js: that index pulls in the
// whole physics tree, which imports race/heat/race-flow.js — a cycle through here.
import { RespawnKartAtCheckpoint } from "../../kart/teleport.js";

// Start line: a trigger_multiple named "start_<trackId>[_laps<M>]",
// filtered to the melon (prop_physics) so the frozen/parked pawn can't
// trigger it, with its OnStartTouch calling this point_script's
// RunScriptInput with parameter "start_<trackId>" — puts the melon on that
// track and makes the start its respawn point: the info_target named
// "start_spawn_<trackId>" (also where a heat lines racers up), or, without
// one, the trigger's own position/angles.
//
// Checkpoints: a trigger_multiple per checkpoint along the track, named
// like its parameter, OnStartTouch -> RunScriptInput
// "checkpoint_<trackId>_<index>" — e.g. track 2's 3rd checkpoint is
// "checkpoint_2_3", counted from 1 after the start line. If the melon breaks
// after reaching it, it respawns at the info_target named
// "checkpoint_spawn_<trackId>_<index>", facing that entity's yaw — or,
// without one, at the trigger's own position/angles.
//
// The progression rules themselves (which touch counts, one checkpoint at
// a time, the start picks the track, lap counting on a start re-touch) live
// in race/checkpoints/logic.js so they can be unit-tested without the
// engine — this is just the engine side around them.
/** @param {number} trackId @param {number} index @param {import("../../core/kart-registry.js").Kart} kart @param {any} trigger */
function OnCheckpointTouched(trackId, index, kart, trigger) {
    const result = ApplyCheckpointTouch(kart, trackId, index);
    switch (result) {
        case "ignored-finished":
        case "ignored-behind":
            return;
        case "ignored-other-track":
            Debug(`checkpoint_${trackId}_${index}: kart is on track ${kart.trackId}, ignoring (start_${trackId} not crossed)`);
            return;
        case "ignored-skipped":
            Debug(`checkpoint_${trackId}_${index}: kart is at checkpoint ${kart.checkpointIndex}, skipped one — ignoring`);
            return;
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

/** @param {number} trackId @param {import("../../core/kart-registry.js").Kart} kart @param {any} trigger */
function OnStartTouched(trackId, kart, trigger) {
    const config = GetTrackConfig()[trackId];
    const result = ApplyStartTouch(kart, trackId, { activeTrackId, config });
    switch (result) {
        case "ignored-finished":
        case "ignored-mid-lap":
            return;
        case "ignored-foreign-start":
            Debug(`start_${trackId}: kart is racing active track ${activeTrackId}, ignoring foreign track's start`);
            return;
        case "finished":
            LogLapCompleted(trackId, kart, config);
            CompleteRun(trackId, kart);
            if (!kart.racing) {
                // A loop's finish line is its start line: the next attempt
                // starts right here — same as when finish_ fires first.
                OnStartTouched(trackId, kart, trigger);
            }
            return;
        case "lap":
            LogLapCompleted(trackId, kart, config);
            break;
        case "picked":
            if (!kart.racing) {
                StartRun(kart); // a heat's clock starts at GO instead
            }
            break;
    }
    // Respawn at the start (start_spawn_<trackId>, else the trigger) until
    // the first checkpoint.
    const spawn = GetStartSpawnPoint(trackId, trigger);
    kart.checkpointPosition = spawn.position;
    kart.checkpointAngles = spawn.angles;
    Debug(`start_${trackId}: kart ${result === "picked" ? "is now on" : "starts a new lap on"} track ${trackId}`);
}

/**
 * The kart's last lap is done: stops its run clock (recording a best time),
 * then parks it if it's in a heat — or, free-roaming, takes it off the track
 * until it crosses a start line again.
 * @param {number} trackId @param {import("../../core/kart-registry.js").Kart} kart
 */
function CompleteRun(trackId, kart) {
    FinishRun(kart, trackId);
    if (kart.racing) {
        FinishKart(kart);
        return;
    }
    kart.trackId = undefined;
    kart.checkpointIndex = 0;
    kart.lapsCompleted = 0;
}

// Finish: add an OnStartTouch output, RunScriptInput with parameter
// "finish_<trackId>", to whichever trigger_multiple physically sits on that
// track's finish line — on a loop track that's the start_<trackId> trigger
// itself (start and finish are the same line), on a point-to-point track its
// own trigger at the end; only the activator (the melon) is read here, not
// which entity fired it. Filtered to prop_physics like the checkpoints.
// Kept a separate input from start_<trackId> so a track can end somewhere
// else than it starts; on a shared trigger either one may fire first (see
// ApplyStartTouch). See "Hub -> race -> next-track flow" in GAMEPLAY.md.
/** @param {number} trackId @param {import("../../core/kart-registry.js").Kart} kart */
function OnFinishTouched(trackId, kart) {
    const config = GetTrackConfig()[trackId];
    const result = ApplyLapCompletion(kart, trackId, { activeTrackId, config });
    switch (result) {
        case "ignored-finished":
            return;
        case "ignored-other-track":
            Debug(
                `finish_${trackId}: kart isn't on this track ` +
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
            CompleteRun(trackId, kart);
            return;
    }
}

/** @param {number} trackId @param {import("../../core/kart-registry.js").Kart} kart @param {{ lapsToWin: number } | undefined} config */
function LogLapCompleted(trackId, kart, config) {
    Debug(`finish_${trackId}: lap ${kart.lapsCompleted}/${config?.lapsToWin ?? "?"} completed on track ${trackId}`);
}

/**
 * The user menu's "Restart Time Trial": back to the track's start spawn,
 * whole and standing still, clock at zero — it starts again on crossing the
 * start line. Ignored while the melon is breaking (its respawn is already
 * under way) or locked.
 * @param {import("../../core/kart-registry.js").Kart} kart
 * @returns {boolean} whether it restarted
 */
export function RestartTimeTrial(kart) {
    const trackId = kart.trackId;
    if (!CanRestartTimeTrial(kart) || trackId === undefined || kart.breaking || kart.locked) {
        Debug(`RestartTimeTrial: not now (trackId=${trackId}, racing=${kart.racing}, breaking=${kart.breaking}, locked=${kart.locked})`);
        return false;
    }
    const config = GetTrackConfig()[trackId];
    const trigger = config && Instance.FindEntityByName(config.startEntityName);
    if (!trigger) {
        Debug(`RestartTimeTrial: track ${trackId} has no start_${trackId} trigger`);
        return false;
    }
    const spawn = GetStartSpawnPoint(trackId, trigger);
    CancelRun(kart);
    kart.lastRun = undefined;
    kart.trackId = trackId;
    kart.checkpointIndex = 0;
    kart.lapsCompleted = 0;
    kart.checkpointPosition = spawn.position;
    kart.checkpointAngles = spawn.angles;
    kart.teleportGen = (kart.teleportGen ?? 0) + 1;
    RespawnKartAtCheckpoint(kart);
    Debug(`RestartTimeTrial: back to the start of track ${trackId}`);
    return true;
}

/** Registers the start_<trackId>, checkpoint_<trackId>_<index> and finish_<trackId> OnScriptInput handlers for every track/checkpoint slot the map is allowed to use. Called once from index.js. */
export function RegisterCheckpointAndFinishInputs() {
    for (let t = 1; t <= MAX_TRACKS; t++) {
        const trackId = t;
        Instance.OnScriptInput(`start_${trackId}`, ({ caller, activator }) => {
            const kart = activator && FindKartByMelon(activator);
            if (!kart || !caller) {
                Debug(`start_${trackId}: activator wasn't a tracked melon, ignoring`);
                return;
            }
            OnStartTouched(trackId, kart, caller);
        });
    }

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
