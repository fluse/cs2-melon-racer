// Ball pits: a trigger_multiple around a pit of physics balls keeps them in
// it — OnStartTouch → RunScriptInput "ball_pit_enter", OnEndTouch →
// "ball_pit_leave". A ball (any physics prop that isn't a melon) that leaves
// the trigger is steered back towards its middle, and dropped back in over
// it if it hasn't made it after BALL_PIT_DROP_SECONDS. Melons drive in and
// out freely. Rule: world/ball-pit/logic.js, applied by world/ball-pit/ball-pit.js.

// Horizontal speed (u/s) a ball outside is pulled back towards the middle
// with, at least — one flying back faster keeps its speed.
export const BALL_PIT_RETURN_SPEED = 150;
// Seconds outside before it's dropped back in over the middle.
export const BALL_PIT_DROP_SECONDS = 2;
// …this high above the trigger's origin, and up to this far off its middle
// each way (so dropped balls don't stack up).
export const BALL_PIT_DROP_HEIGHT = 40;
export const BALL_PIT_DROP_SPREAD = 16;
