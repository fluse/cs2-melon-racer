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
