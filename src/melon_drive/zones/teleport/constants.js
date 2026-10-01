// Teleporters and the lift applied to every trigger/destination teleport target.

// Generic teleporters, same name-carries-the-config convention: a
// trigger_multiple named "teleport_to_<destination>" (filtered to
// prop_physics) with OnStartTouch -> RunScriptInput "melon_teleport" sends
// the touching melon to the entity named <destination> (e.g. an
// info_target), facing that entity's yaw. One shared handler for every
// teleporter — adding one is a pure Hammer edit. A teleport only moves the
// melon; it never changes its checkpoint progress, and its respawn point
// only with "checkpoint_" (below).
// Optional mode between "teleport_" and "to_", per teleporter:
//   teleport_stop_to_<destination> — arrives standing still
//   teleport_keep_to_<destination> — keeps its speed
//   teleport_to_<destination>      — TELEPORT_KEEP_SPEED decides
// and, after the mode, an optional "checkpoint_": the destination also
// becomes the melon's respawn point (e.g. tutorial sections, so a break
// doesn't send it back to the start of the tutorial):
//   teleport_stop_checkpoint_to_<destination>, teleport_checkpoint_to_<destination>, …
export const TELEPORT_TRIGGER_NAME_PATTERN = /^teleport_(?:(stop|keep)_)?(checkpoint_)?to_(.+)$/;
// Default for teleport_to_<destination> without a mode. true: keep the
// melon's horizontal speed, redirected along the destination's facing;
// false: arrive standing still.
export const TELEPORT_KEEP_SPEED = true;

// Race-flow teleports (heat start, checkpoint respawns) target a trigger_multiple's
// raw GetAbsOrigin() — Hammer mappers commonly sink a trigger's brush a bit
// into the floor so a fast-moving physics prop reliably touches it instead
// of tunneling past a paper-thin volume. Teleporting the melon to that exact
// height would embed it in solid ground; VPhysics can't resolve that
// overlap upward and the melon tunnels down through the floor instead. Lift
// the target up by this much so the melon always drops onto the floor from
// just above it, same trick as SPAWN_UP_OFFSET (spawn.js).
export const TELEPORT_UP_OFFSET = 40;
