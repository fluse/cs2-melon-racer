import { Instance } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { FindKartByMelon } from "./kart-registry.js";
import { activeTrackId, FinishKart } from "./race-flow.js";
import { GetTrackConfig } from "./track-config.js";
import { MAX_TRACKS, MAX_CHECKPOINTS_PER_TRACK, TELEPORT_UP_OFFSET } from "./constants.js";

// Checkpoints: place a trigger_multiple per checkpoint, filtered to the
// melon (prop_physics) so the frozen/parked pawn can't trigger it, with its
// OnStartTouch calling this point_script's RunScriptInput and a parameter of
// "checkpoint_<trackId>_<index>" — e.g. track 2's 3rd checkpoint is
// "checkpoint_2_3". The trigger's own position/angles become the respawn
// point if the melon breaks after reaching it.
//
// A kart isn't on any track until it touches a "_1" checkpoint, which picks
// (starts its progress on) that track — this is how a racer picks one of
// several tracks in the map. Checkpoints past index 1 only count while the
// kart is already on that same track (so straying onto a different track's
// later checkpoints doesn't skip progress), and only ever move progress
// forward within it. A kart that's racing can't pick a *different* track's
// checkpoint 1 mid-heat either (straying into another track's start zone is
// ignored outright) — letting it through would silently overwrite
// kart.trackId to the wrong track and then reject the racer's own further
// progress on their actual active track.
//
// Re-touching "_1" while *already on* that track (the normal case of
// crossing the start/finish line every lap) deliberately does **not** touch
// lapsCompleted here — that's OnFinishTouched's job, via a separate
// finish_<trackId> input (see below). Keeping "pick a track" and "count a
// completed lap" in two independent inputs means they can both be wired as
// outputs on the very same trigger without caring which one Hammer fires
// first. It *does* still bump checkpointIndex back up to 1 for the new lap
// though — OnFinishTouched resets it to 0 when a lap completes, and without
// this the HUD's checkpoint counter would sit at 0 for the whole first leg
// of every lap after the first, then jump straight to 2.
/** @param {number} trackId @param {number} index @param {import("./kart-registry.js").Kart} kart @param {any} trigger */
function OnCheckpointTouched(trackId, index, kart, trigger) {
    if (kart.finished) {
        return; // parked after finishing this heat, ignore further touches
    }
    if (index === 1) {
        if (kart.racing && trackId !== activeTrackId) {
            Debug(`checkpoint_${trackId}_1: kart is racing active track ${activeTrackId}, ignoring foreign track's start`);
            return;
        }
        if (kart.trackId !== trackId) {
            kart.trackId = trackId;
            kart.checkpointIndex = 0;
        }
    } else if (kart.trackId !== trackId) {
        Debug(`checkpoint_${trackId}_${index}: kart is on track ${kart.trackId}, ignoring`);
        return;
    }
    if (index <= kart.checkpointIndex) {
        return;
    }
    kart.checkpointIndex = index;
    // + TELEPORT_UP_OFFSET for the same reason BeginHeat/ReturnAllToHub add
    // it to their teleport targets: mappers commonly sink a checkpoint
    // trigger's brush into the floor so a fast-moving melon reliably
    // touches it, and teleporting to that exact (embedded) height would
    // otherwise make a later respawn (e.g. after BreakMelon) tunnel the
    // melon down through the floor instead of landing on it.
    const origin = trigger.GetAbsOrigin();
    kart.checkpointPosition = { x: origin.x, y: origin.y, z: origin.z + TELEPORT_UP_OFFSET };
    kart.checkpointAngles = trigger.GetAbsAngles();
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
    if (kart.finished) {
        return; // already parked after finishing this heat
    }
    if (!kart.racing || trackId !== activeTrackId || kart.trackId !== trackId) {
        Debug(
            `finish_${trackId}: kart isn't actively racing this track ` +
            `(racing=${kart.racing}, trackId=${kart.trackId}, activeTrackId=${activeTrackId}), ignoring`
        );
        return;
    }
    const config = GetTrackConfig()[trackId];
    if (!config || kart.checkpointIndex < config.checkpoints) {
        Debug(`finish_${trackId}: kart hasn't reached all ${config?.checkpoints ?? "?"} checkpoint(s) this lap yet (at ${kart.checkpointIndex}), ignoring`);
        return;
    }
    kart.lapsCompleted += 1;
    Debug(`finish_${trackId}: lap ${kart.lapsCompleted}/${config.lapsToWin} completed on track ${trackId}`);
    if (kart.lapsCompleted >= config.lapsToWin) {
        FinishKart(kart);
    } else {
        // Not done yet — back to "no checkpoints reached" for the next lap
        // (not 1: crossing the finish line itself isn't checkpoint 1 again,
        // it's the boundary between laps).
        kart.checkpointIndex = 0;
    }
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
