// Lift zones (see zones/lift/constants.js): while the melon is inside one, the
// chase camera eases back and up by this much on top of the normal
// CAMERA_DISTANCE/CAMERA_HEIGHT, so the climb and the opposite wall stay in view;
// it eases back in after leaving. While zoomed out, the camera is NOT pulled
// in at walls — in a shaft the wall right behind the melon would undo the
// zoom — so it looks through the shaft walls instead.
// Higher: more overview, the melon gets smaller on screen.
export const LIFT_CAMERA_EXTRA_DISTANCE = 220; // units further back
export const LIFT_CAMERA_EXTRA_HEIGHT = 30; // units higher up
export const LIFT_CAMERA_EASE_SECONDS = 0.6; // seconds to zoom fully out (or back in)
