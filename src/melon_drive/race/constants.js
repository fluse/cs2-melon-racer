// Tracks, checkpoints and the hub -> race -> next-track flow.

// The map has multiple separate tracks, so a checkpoint trigger's name
// says both which track it belongs to and its position along that track:
// "checkpoint_<trackId>_<index>", e.g. "checkpoint_2_5" is track 2's 5th
// checkpoint. The start_<trackId>/finish_<trackId> inputs are registered up
// front for every track (see race/checkpoints/checkpoints.js) — raise these
// if a track ends up needing more checkpoints, or the map more tracks, than
// currently allowed for.
export const MAX_TRACKS = 8;
export const MAX_CHECKPOINTS_PER_TRACK = 32;

// Race flow: HUB (default/gather) -> COUNTDOWN (locked, pre-race) -> RACING
// -> BREAK (finished, waiting for the next heat) -> back to COUNTDOWN on the
// next track, or back to HUB after the last one. See GAMEPLAY.md's "Hub ->
// race -> next-track flow" for the full design.
export const RacePhase = /** @type {const} */ ({
    HUB: "HUB",
    COUNTDOWN: "COUNTDOWN",
    RACING: "RACING",
    BREAK: "BREAK",
});

export const HUB_TRIGGER_NAME = "hub_start_trigger";

export const COUNTDOWN_SECONDS = 3;
export const GO_DISPLAY_SECONDS = 0.7; // how long "GO" stays on screen once the countdown ends — its grow-and-fade (speedometer.css) is done by .62s
export const BREAK_SECONDS = 10; // fixed by the original request
// A racer who reaches no new checkpoint (and counts no lap) for this long
// after GO or their last one is out of the Grand Prix (DNF) and back in the
// hub — so one player who stops driving can't block a heat for everyone.
export const DNF_NO_PROGRESS_SECONDS = 60;
// The last this-many seconds of that are counted down on the racer's HUD
// (dnf_warning), so it doesn't come as a surprise.
export const DNF_WARNING_SECONDS = 15;
// Spacing between racers teleported onto the same start line side-by-side,
// so they don't spawn stacked on top of each other.
export const RACE_SPAWN_LATERAL_SPACING = 120;

// Start trigger of a track: a trigger_multiple named "start_<trackId>",
// optionally "start_<trackId>_laps<lapsToWin>" (e.g. "start_1_laps3";
// without _laps it's DEFAULT_LAPS_TO_WIN). Its OnStartTouch fires
// RunScriptInput "start_<trackId>" (always without the _laps part), which
// puts a free-roaming melon on that track; its transform is where racers
// line up when a heat starts. The finish is the separate "finish_<trackId>"
// input — on the same trigger for a loop track, at the end of the track
// for a point-to-point one. See GetTrackConfig() in race/track-config.js.
// Instead of "start_<trackId>" the output may fire the generic "start_line",
// which reads the track from the firing trigger's own name — so a start
// gate prefab only needs its trigger's name set per track (a prefab
// variable), not its output too.
export const START_TRIGGER_NAME_PATTERN = /^start_(\d+)(?:_laps(\d+))?$/;
export const DEFAULT_LAPS_TO_WIN = 1;

// A point-to-point track's finish trigger may be named "finish_<trackId>"
// (e.g. "finish_2") and fire the generic "finish_line", which reads the
// track from that name — like start_line, for a finish gate prefab. A
// finish_line from a start_<trackId>[_laps<M>] trigger (a loop track's
// shared start/finish line) works too.
export const FINISH_TRIGGER_NAME_PATTERN = /^finish_(\d+)$/;

// Spawn point of a track's start: an info_target named
// "start_spawn_<trackId>" (e.g. "start_spawn_1"). Racers line up there when
// a heat starts (on the floor under it, facing its yaw), and a melon that
// breaks before checkpoint 1 respawns there. Without one, the nearest
// info_target named just "start_spawn" within START_SPAWN_SHARED_MAX_DISTANCE
// of the start trigger is used (every copy of a start gate prefab carries
// one), and without that the start trigger's own transform.
export const START_SPAWN_NAME_PATTERN = /^start_spawn_(\d+)$/;
/** @param {number} trackId */
export function StartSpawnName(trackId) {
    return `start_spawn_${trackId}`;
}
export const START_SPAWN_SHARED_NAME = "start_spawn";
export const START_SPAWN_SHARED_MAX_DISTANCE = 1024;

// Checkpoint triggers are named "checkpoint_<trackId>_<index>" and all fire
// the one script input "checkpoint", which reads track and index from the
// firing trigger's name — GetTrackConfig() counts a track's checkpoints from
// these names too. (Not a parameter per checkpoint, named like its trigger:
// Hammer warns about a RunScriptInput parameter that matches an entity name.)
export const CHECKPOINT_TRIGGER_NAME_PATTERN = /^checkpoint_(\d+)_(\d+)$/;

// Respawn point of a checkpoint: an info_target named
// "checkpoint_spawn_<trackId>_<index>" (e.g. "checkpoint_spawn_1_3"). A
// broken melon respawns there, facing the entity's yaw. Without one, the
// nearest info_target named just "checkpoint_spawn" within
// CHECKPOINT_SPAWN_SHARED_MAX_DISTANCE of the checkpoint trigger is used
// (every copy of a checkpoint gate prefab carries one, like start_spawn),
// and without that the checkpoint trigger's own transform.
export const CHECKPOINT_SPAWN_NAME_PATTERN = /^checkpoint_spawn_(\d+)_(\d+)$/;
export const CHECKPOINT_SPAWN_SHARED_NAME = "checkpoint_spawn";
export const CHECKPOINT_SPAWN_SHARED_MAX_DISTANCE = 1024;
/** @param {number} trackId @param {number} index */
export function CheckpointSpawnName(trackId, index) {
    return `checkpoint_spawn_${trackId}_${index}`;
}
