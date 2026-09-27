// Spawning: the melon template, spawn entities, intro logo, and the frozen pawn.

export const MELON_TEMPLATE_NAME = "melon_template";

// How long the Melon Racer logo (intro_logo in speedometer.xml) shows after
// a player picks a team, before their melon spawns at the intro.
export const INTRO_LOGO_SECONDS = 5;

// How far above the floor under a spawn entity (hub_spawn, intro_spawn) the
// melon's origin appears — straight above it, no sideways offset (see
// PositionAboveFloor in spawn-points.js). Just enough to clear the floor:
// a long drop lands hard enough for the engine's own physics to destroy the
// melon on impact (it used to be 128 plus the template's offset, ~180 units,
// and the melon broke on every landing and respawned in a loop).
export const SPAWN_UP_OFFSET = 40;
// The floor trace for that starts FLOOR_TRACE_UP above the spawn entity (in
// case it's sunk into the floor) and looks FLOOR_TRACE_DOWN below it (in case
// it's floating above the floor).
export const FLOOR_TRACE_UP = 32;
export const FLOOR_TRACE_DOWN = 512;

// Spawn entities — resolved in spawn-points.js.
// hub_spawn (info_player_start, required): where melons go in the hub.
// hub_spawn_facing (info_target, optional): only its angle counts — which
// way a melon at hub_spawn faces; without it, hub_spawn's own angle.
// intro_spawn (info_player_start, optional): a player's very first melon
// (the tutorial), facing its own angle; without it, hub_spawn.
export const HUB_SPAWN_NAME = "hub_spawn";
export const HUB_SPAWN_FACING_NAME = "hub_spawn_facing";
export const INTRO_SPAWN_NAME = "intro_spawn";

// The frozen pawn (CSMoveType.NOCLIP: non-solid, but WASD still flies it)
// stays where it spawned — see HoldPawn in kart-spawn.js. It's only put back
// once it has drifted further than this, not every tick.
export const PAWN_DRIFT_TOLERANCE = 16;
