// Side-view camera (zones/side-view/constants.js): how it takes over from the
// chase camera and hands back.
// Seconds the camera takes to swing from behind the melon to the side (and
// back after leaving). Higher: a slower, smoother swing. 0: cuts.
export const SIDE_VIEW_EASE_SECONDS = 0.8;
// Units the melon moves in one tick that only a teleport does (hub,
// checkpoint respawn, a teleporter) — far beyond any boosted speed.
export const SIDE_VIEW_TELEPORT_DISTANCE = 256;
// Seconds after such a jump in which leaving the side view cuts straight back
// to the chase camera instead of swinging (the zone's OnEndTouch can arrive a
// tick or two after the teleport).
export const SIDE_VIEW_TELEPORT_CUT_SECONDS = 0.25;
// The side camera follows the melon on a damped spring instead of sticking
// to it: followed 1:1 it stopped dead when the melon hit a wall and jerked
// round at every wall jump. Roughly the seconds it takes to catch up along
// the screen; it aims ahead by the melon's speed times this, so at a steady
// speed the melon still stays centered. Lower: tighter, harsher; higher:
// softer, swings further past a sudden stop.
export const SIDE_VIEW_CAMERA_SMOOTH_SECONDS = 0.12;
// The same for its height, without aiming ahead: jumps and the small hops
// of a rolling melon move it up and down on screen instead of shaking the
// camera.
export const SIDE_VIEW_CAMERA_HEIGHT_SMOOTH_SECONDS = 0.15;
