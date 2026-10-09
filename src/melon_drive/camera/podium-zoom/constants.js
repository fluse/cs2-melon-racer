// Podium (race/podium/): while a melon is held on its step, the chase camera
// eases back and up by this much on top of the normal
// CAMERA_DISTANCE/CAMERA_HEIGHT, so the whole podium is in view; it eases
// back in once the hold ends. Walls don't pull it in meanwhile.
export const PODIUM_CAMERA_EXTRA_DISTANCE = 160; // units further back
export const PODIUM_CAMERA_EXTRA_HEIGHT = 40; // units higher up
export const PODIUM_CAMERA_EASE_SECONDS = 0.8; // seconds to zoom fully out (or back in)
