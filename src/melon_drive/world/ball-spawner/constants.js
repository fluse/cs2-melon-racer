// Ball spawner: physics balls dropping in at irregular intervals from the
// point_template BALL_SPAWNER_TEMPLATE_NAME, at an info_target named
// BALL_SPAWNER_SPAWN_NAME (with several, a random one each time). Each ball
// is removed after BALL_SPAWNER_LIFETIME; at most BALL_SPAWNER_MAX_BALLS at
// once. No spawn point in the map, no balls. Rules: world/ball-spawner/logic.js,
// applied by world/ball-spawner/ball-spawner.js.

export const BALL_SPAWNER_TEMPLATE_NAME = "template_ball";
export const BALL_SPAWNER_SPAWN_NAME = "spawn_ball";
// Balls alive at the same time, at most.
export const BALL_SPAWNER_MAX_BALLS = 15;
// Seconds a ball lives before it's removed.
export const BALL_SPAWNER_LIFETIME = 20;
// Seconds between two balls: random, evenly between these two.
export const BALL_SPAWNER_MIN_INTERVAL = 0.5;
export const BALL_SPAWNER_MAX_INTERVAL = 4;
// Up to this far off the spawn point each way (so balls don't spawn inside each other).
export const BALL_SPAWNER_SPREAD = 8;
