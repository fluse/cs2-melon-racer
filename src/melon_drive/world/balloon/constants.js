// Balloon balls: every physics ball with the ball model (tools/models/
// make-ball-model.mjs — in ball pits and from the ball spawner) floats like a
// balloon in the air: it sinks slowly towards the floor instead of falling,
// and a melon knocking into it sends it flying far, the air slowing it down
// again. The script keeps its velocity that way every tick; the map is
// searched for new balls every BALLOON_SCAN_SECONDS. Rules:
// world/balloon/logic.js, applied by world/balloon/balloon.js.

// The model that makes a physics prop a balloon (compared without "_c", any case).
export const BALLOON_MODEL = "models/melon_racer/ball.vmdl";
// The physics prop classes searched for it.
export const BALLOON_CLASSES = ["prop_physics", "prop_physics_multiplayer", "prop_physics_override"];
// How fast it sinks, at most (units/s) — a real air-filled balloon drifting down.
export const BALLOON_SINK_SPEED = 35;
// Air drag (per second): a knock's speed is taken away by a factor of e
// every 1/BALLOON_DRAG seconds — sideways, and up or down towards sinking.
export const BALLOON_DRAG = 1.2;
// How often the map is searched for new balls (a spawned one falls freely
// until it's found).
export const BALLOON_SCAN_SECONDS = 0.2;
