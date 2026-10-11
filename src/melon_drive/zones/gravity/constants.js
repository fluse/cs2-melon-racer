// Gravity zones: a trigger_multiple (filtered to prop_physics like the other
// triggers) with OnStartTouch -> RunScriptInput "gravity_enter" and
// OnEndTouch -> "gravity_leave". Inside, the melon is pulled down with a
// share of GRAVITY and loses a share of the speed it normally loses while
// rolling — so it floats further on a jump and keeps its momentum longer.
// Rule: zones/gravity/logic.js, applied by movement/driving/drive.js
// (test/zones/gravity-zone.test.mjs).

// Pull of a gravity zone without a value in its name, in percent of GRAVITY.
// 100 = normal, 50 = half (jumps twice as high), 0 = floating.
export const GRAVITY_ZONE_PERCENT = 50;
// Per zone, the name sets both: "gravity_zone_<gravity>[_roll<roll>]", in
// percent — gravity of GRAVITY, roll of the speed lost while rolling
// (COAST_FRICTION and the engine's own rolling friction). Without _roll the
// roll is the gravity (a lighter melon presses less on the floor, so it
// rubs less): gravity_zone_50 = half the pull and half the loss,
// gravity_zone_100_roll20 = normal pull, only a fifth of the loss,
// gravity_zone_100_roll0 = rolls on without losing speed on the flat.
export const GRAVITY_ZONE_NAME_PATTERN = /^gravity_zone_(\d+(?:\.\d+)?)(?:_roll(\d+(?:\.\d+)?))?$/;
// Speed lost between two ticks faster than this is a hit (a wall, a bump),
// not rolling — the zone leaves it alone, so impacts and bounces stay as
// they are. Rolling friction stays far below it.
export const GRAVITY_ZONE_MAX_ROLL_DECEL = 1500; // units/sec^2
