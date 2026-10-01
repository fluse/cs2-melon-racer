// Walls between the melon and the chase camera pull the camera in — done by
// the script (camera/wall-clip/wall-clip.js), not the engine, so it eases
// both ways: the engine's own clipping is instant and jerks the view at every
// pillar. A line trace from the melon to where the camera wants to be finds
// the wall; the camera's distance then eases towards it.
// The price: while it eases in, the camera is briefly behind or inside the
// wall — keep the pull-in rate high.
// Rates are per second (exponential: about 1 − e^(−rate·t) of the way after
// t seconds — at 15, 90 % in 0.15 s; at 4, 90 % in 0.6 s).
// Higher pull-in: hides walls sooner, but jerks again towards instant.
export const CAMERA_WALL_PULL_IN_RATE = 15;
// Higher return: back to full distance sooner after the wall; lower: calmer.
export const CAMERA_WALL_RETURN_RATE = 4;
// Units the camera stays in front of the wall it was pulled in by, so the
// view doesn't graze the wall's surface.
export const CAMERA_WALL_MARGIN = 8;
