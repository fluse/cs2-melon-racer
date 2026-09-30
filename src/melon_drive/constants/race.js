// Tracks, checkpoints and the hub -> race -> next-track flow.

// The map has multiple separate tracks, so a checkpoint's script input
// parameter names both which track it belongs to and its position along
// that track: "checkpoint_<trackId>_<index>", e.g. "checkpoint_2_5" is
// track 2's 5th checkpoint. Registered up front for every combination (see
// checkpoints.js) — raise these if a track ends up needing more checkpoints,
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

// Track start/finish trigger naming convention:
// "track_start_<trackId>_cp<checkpointCount>_laps<lapsToWin>" (e.g.
// "track_start_1_cp8_laps3"). See GetTrackConfig() in track-config.js for
// how this is parsed, cached, and used as each track's start position.
export const START_TRIGGER_NAME_PATTERN = /^track_start_(\d+)_cp(\d+)_laps(\d+)$/;

// Respawn point of a checkpoint: an info_target named
// "checkpoint_spawn_<trackId>_<index>" (e.g. "checkpoint_spawn_1_3"). A
// broken melon respawns there, facing the entity's yaw. Without one, the
// checkpoint trigger's own transform is used instead.
export const CHECKPOINT_SPAWN_NAME_PATTERN = /^checkpoint_spawn_(\d+)_(\d+)$/;
/** @param {number} trackId @param {number} index */
export function CheckpointSpawnName(trackId, index) {
    return `checkpoint_spawn_${trackId}_${index}`;
}
