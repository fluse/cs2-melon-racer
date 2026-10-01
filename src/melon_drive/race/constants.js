// Tracks, checkpoints and the hub -> race -> next-track flow.

// The map has multiple separate tracks, so a checkpoint's script input
// parameter names both which track it belongs to and its position along
// that track: "checkpoint_<trackId>_<index>", e.g. "checkpoint_2_5" is
// track 2's 5th checkpoint. Registered up front for every combination (see
// race/checkpoints/checkpoints.js) — raise these if a track ends up needing more checkpoints,
// or the map more tracks, than currently allowed for.
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
export const GO_DISPLAY_SECONDS = 1; // how long "GO!" stays on screen once the countdown ends
export const BREAK_SECONDS = 10; // fixed by the original request
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
export const START_TRIGGER_NAME_PATTERN = /^start_(\d+)(?:_laps(\d+))?$/;
export const DEFAULT_LAPS_TO_WIN = 1;

// Spawn point of a track's start: an info_target named
// "start_spawn_<trackId>" (e.g. "start_spawn_1"). Racers line up there when
// a heat starts (on the floor under it, facing its yaw), and a melon that
// breaks before checkpoint 1 respawns there. Without one, the start
// trigger's own transform is used instead.
export const START_SPAWN_NAME_PATTERN = /^start_spawn_(\d+)$/;
/** @param {number} trackId */
export function StartSpawnName(trackId) {
    return `start_spawn_${trackId}`;
}

// Checkpoint triggers are named like their script input,
// "checkpoint_<trackId>_<index>" — GetTrackConfig() counts a track's
// checkpoints from these names (the script can't see which parameter a
// trigger's output fires), so the name is required, not just tidy.
export const CHECKPOINT_TRIGGER_NAME_PATTERN = /^checkpoint_(\d+)_(\d+)$/;

// Respawn point of a checkpoint: an info_target named
// "checkpoint_spawn_<trackId>_<index>" (e.g. "checkpoint_spawn_1_3"). A
// broken melon respawns there, facing the entity's yaw. Without one, the
// checkpoint trigger's own transform is used instead.
export const CHECKPOINT_SPAWN_NAME_PATTERN = /^checkpoint_spawn_(\d+)_(\d+)$/;
/** @param {number} trackId @param {number} index */
export function CheckpointSpawnName(trackId, index) {
    return `checkpoint_spawn_${trackId}_${index}`;
}
