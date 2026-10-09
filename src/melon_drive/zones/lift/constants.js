// Lift zones: triggers where wall bounces and wall jumps are tuned for
// climbing a shaft or a high wall by bouncing between its walls. What
// changes inside one is gathered in WallRules (zones/lift/logic.js); the camera
// zoom there is LIFT_CAMERA_* in camera/.

// A trigger_multiple (filtered to prop_physics like the other triggers) with
// OnStartTouch -> RunScriptInput "lift_enter" and OnEndTouch -> RunScriptInput
// "lift_leave". While the melon is inside, a wall bounce kicks it up by this
// much instead of WALL_BOUNCE_UP_SPEED. Per zone, the name can set it (see
// LIFT_ZONE_NAME_PATTERN). Overlapping zones: the strongest counts.
// Gravity is 800 u/s², so a kick of v climbs about v² / 1600 units:
// 220 -> ~30, 450 -> ~125, 600 -> ~225 per bounce.
export const LIFT_ZONE_UP_SPEED = 450; // units/sec upward
// Optional per-zone kick: a lift trigger named "lift_zone_<speed>" (e.g.
// "lift_zone_600") kicks <speed> units/sec up instead of LIFT_ZONE_UP_SPEED.
export const LIFT_ZONE_NAME_PATTERN = /^lift_zone_(\d+(?:\.\d+)?)$/;
// In a lift zone a bounce always leaves the wall with at least this much
// horizontal speed, whatever its rating. Shafts are climbed by bouncing
// almost head-on — a MISS (x0.3) — so the melon used to arrive at the
// opposite wall below WALL_BOUNCE_MIN_IMPACT and the chain died there. The
// speed added this way is free (not counted as speed gained for damage).
// Higher: easier to reach the far wall of wide shafts; lower: more skill.
export const LIFT_ZONE_MIN_BOUNCE_SPEED = 450; // units/sec
// Wall jumps in a lift zone cost no charge, are always full strength and
// may follow a wall bounce at once (outside one, a press in the bounce's
// jump-timing window is only timing). And a wall contact stays jumpable this
// long, instead of the tick or two of WALL_JUMP_WINDOW outside: shafts stay
// easy to climb.
export const LIFT_ZONE_WALL_JUMP_WINDOW = 0.2; // seconds
