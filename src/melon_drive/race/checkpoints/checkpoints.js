import { Instance } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { FindKartByMelon } from "../../core/kart-registry.js";
import { activeTrackId, FinishKart } from "../heat/race-flow.js";
import { GetTrackConfig } from "../track-config.js";
import { ApplyCheckpointTouch, ApplyLapCompletion, ApplyStartTouch, StartLineTrackId, FinishLineTrackId, CheckpointFromTrigger } from "./logic.js";
import { MAX_TRACKS, MAX_CHECKPOINTS_PER_TRACK, TELEPORT_UP_OFFSET, FINISH_RESTART_START_GUARD } from "../../constants/index.js";
import { Lifted, LevelAngles, GetCheckpointSpawnPoint, GetStartSpawnPoint } from "../../kart/spawn-points.js";
import { StartRun, FinishRun, CancelRun, CanRestartTimeTrial } from "../time-trial/time-trial.js";
// Straight from teleport.js, not movement/index.js: that index pulls in the
// whole physics tree, which imports race/heat/race-flow.js — a cycle through here.
import { RespawnKartAtCheckpoint } from "../../kart/teleport.js";
import { SetFreeLook } from "../../dev/free-look.js";

// Start line: a trigger_multiple named "start_<trackId>[_laps<M>]",
// filtered to the melon (prop_physics) so the frozen/parked pawn can't
// trigger it, with its OnStartTouch calling this point_script's
// RunScriptInput with parameter "start_<trackId>" — puts the melon on that
// track and makes the start its respawn point: the info_target named
// "start_spawn_<trackId>" (also where a heat lines racers up), else the
// nearest "start_spawn", else the trigger's own position/angles (see
// GetStartSpawnPoint). The output may fire the generic "start_line" instead,
// which takes the track from the trigger's name — for a start gate prefab,
// whose trigger name is a prefab variable but whose output is fixed.
//
// Checkpoints: a trigger_multiple per checkpoint along the track, named
// "checkpoint_<trackId>_<index>" — e.g. track 2's 3rd checkpoint is
// "checkpoint_2_3", counted from 1 after the start line — with
// OnStartTouch -> RunScriptInput "checkpoint", which reads the checkpoint
// from that name. If the melon breaks
// after reaching it, it respawns at the info_target named
// "checkpoint_spawn_<trackId>_<index>", facing that entity's yaw — else at
// the nearest "checkpoint_spawn" (a checkpoint gate prefab's), else at the
// trigger's own position/angles.
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
    const spawn = GetCheckpointSpawnPoint(trackId, index, trigger);
    if (spawn) {
        kart.checkpointPosition = spawn.position;
        kart.checkpointAngles = spawn.angles;
    } else {
        Debug(`checkpoint_${trackId}_${index}: no info_target "checkpoint_spawn_${trackId}_${index}" or "checkpoint_spawn" nearby, respawning at the trigger itself`);
        // + TELEPORT_UP_OFFSET for the same reason BeginHeat adds
        // it to their teleport targets: mappers commonly sink a checkpoint
        // trigger's brush into the floor so a fast-moving melon reliably
        // touches it, and teleporting to that exact (embedded) height would
        // otherwise make a later respawn (e.g. after BreakMelon) tunnel the
        // melon down through the floor instead of landing on it.
        kart.checkpointPosition = Lifted(trigger.GetAbsOrigin(), TELEPORT_UP_OFFSET);
        // Only the yaw, like every other spawn: a rotated brush mustn't respawn the melon tilted.
        kart.checkpointAngles = LevelAngles(trigger.GetAbsAngles().yaw);
    }
    Debug(`checkpoint_${trackId}_${index}: kart advanced to checkpoint ${index} on track ${trackId}`);
}

/** @param {number} trackId @param {import("../../core/kart-registry.js").Kart} kart @param {any} trigger */
function OnStartTouched(trackId, kart, trigger) {
    if (kart.finishRestartAt !== undefined && Instance.GetGameTime() - kart.finishRestartAt < FINISH_RESTART_START_GUARD) {
        // The same loop-finish touch whose finish_ already sent the melon back
        // to the start spawn (see CompleteRun) — not a new crossing.
        Debug(`start_${trackId}: right after the finish sent the melon back to the start, ignoring`);
        return;
    }
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
 * then parks it if it's in a heat — or, free-roaming, sends it straight back
 * to the track's start spawn for the next attempt (the finish time stays on
 * the HUD; the clock starts again on crossing the start line).
 * @param {number} trackId @param {import("../../core/kart-registry.js").Kart} kart
 */
function CompleteRun(trackId, kart) {
    FinishRun(kart, trackId);
    if (kart.racing) {
        FinishKart(kart);
        return;
    }
    if (SendToTrackStart(kart, trackId)) {
        kart.finishRestartAt = Instance.GetGameTime();
        return;
    }
    // No start trigger to go back to (can't happen for a track that was
    // picked by one): off the track until a start line is crossed again.
    kart.trackId = undefined;
    kart.checkpointIndex = 0;
    kart.lapsCompleted = 0;
}

/**
 * Puts the kart back at the start of `trackId` — on the track, no
 * checkpoints or laps, the start spawn its respawn point — and the melon
 * there, whole and standing still (a breaking melon is left to its own
 * respawn, which now goes there too). The run clock isn't touched.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} trackId
 * @returns {boolean} false if the track has no start trigger
 */
function SendToTrackStart(kart, trackId) {
    const config = GetTrackConfig()[trackId];
    const trigger = config && Instance.FindEntityByName(config.startEntityName);
    if (!trigger) {
        Debug(`SendToTrackStart: track ${trackId} has no start_${trackId} trigger`);
        return false;
    }
    const spawn = GetStartSpawnPoint(trackId, trigger);
    kart.trackId = trackId;
    kart.checkpointIndex = 0;
    kart.lapsCompleted = 0;
    kart.checkpointPosition = spawn.position;
    kart.checkpointAngles = spawn.angles;
    if (!kart.breaking) {
        kart.teleportGen = (kart.teleportGen ?? 0) + 1;
        RespawnKartAtCheckpoint(kart);
    }
    return true;
}

// Finish: add an OnStartTouch output, RunScriptInput with parameter
// "finish_<trackId>", to whichever trigger_multiple physically sits on that
// track's finish line — on a loop track that's the start_<trackId> trigger
// itself (start and finish are the same line), on a point-to-point track its
// own trigger at the end; only the activator (the melon) is read here, not
// which entity fired it. Filtered to prop_physics like the checkpoints.
// Or the generic "finish_line", which takes the track from the firing
// trigger's name instead: "finish_<trackId>", or the start trigger's own
// name on a loop track — for a finish gate prefab.
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
    // Back to driving: a free-looking player's restart ends free look (pawn
    // back on its anchor, chase camera on the melon) before the melon moves.
    SetFreeLook(kart, false);
    if (!SendToTrackStart(kart, trackId)) {
        return false;
    }
    CancelRun(kart);
    kart.lastRun = undefined;
    Debug(`RestartTimeTrial: back to the start of track ${trackId}`);
    return true;
}

/**
 * The track a start_line / finish_line input is for, from the firing
 * trigger's name — undefined (logged) for a name that names no track or one
 * beyond MAX_TRACKS (the numbered inputs don't go further either).
 * @param {string} input @param {any} caller @param {(name: string) => number | undefined} parse
 */
function TrackIdFromCaller(input, caller, parse) {
    const name = caller?.GetEntityName() ?? "";
    const trackId = parse(name);
    if (trackId === undefined || trackId < 1 || trackId > MAX_TRACKS) {
        Instance.Msg(`[melon_drive] ${input} fired by "${name}", which names no track 1..${MAX_TRACKS} — ignoring. See docs/mapping-api/04-tracks.md.`);
        return undefined;
    }
    return trackId;
}

/** Registers the start_<trackId> and finish_<trackId> OnScriptInput handlers for every track the map is allowed to use, plus the generic start_line / finish_line and checkpoint. Called once from index.js. */
export function RegisterCheckpointAndFinishInputs() {
    Instance.OnScriptInput("start_line", ({ caller, activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart || !caller) {
            Debug("start_line: activator wasn't a tracked melon, ignoring");
            return;
        }
        const trackId = TrackIdFromCaller("start_line", caller, StartLineTrackId);
        if (trackId !== undefined) {
            OnStartTouched(trackId, kart, caller);
        }
    });
    Instance.OnScriptInput("finish_line", ({ caller, activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart) {
            Debug("finish_line: activator wasn't a tracked melon, ignoring");
            return;
        }
        const trackId = TrackIdFromCaller("finish_line", caller, FinishLineTrackId);
        if (trackId !== undefined) {
            OnFinishTouched(trackId, kart);
        }
    });

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

    Instance.OnScriptInput("checkpoint", ({ caller, activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart || !caller) {
            Debug("checkpoint: activator wasn't a tracked melon, ignoring");
            return;
        }
        const name = caller.GetEntityName();
        const checkpoint = CheckpointFromTrigger(name);
        if (!checkpoint || checkpoint.trackId < 1 || checkpoint.trackId > MAX_TRACKS || checkpoint.index < 1 || checkpoint.index > MAX_CHECKPOINTS_PER_TRACK) {
            Instance.Msg(`[melon_drive] checkpoint fired by "${name}", which isn't named checkpoint_<trackId 1..${MAX_TRACKS}>_<index 1..${MAX_CHECKPOINTS_PER_TRACK}> — ignoring. See docs/mapping-api/04-tracks.md.`);
            return;
        }
        OnCheckpointTouched(checkpoint.trackId, checkpoint.index, kart, caller);
    });

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
