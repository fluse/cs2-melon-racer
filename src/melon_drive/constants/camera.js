// Chase camera offsets and the user menu's distance/height presets.

// Offsets for CameraFollowConfig — behind and above the melon. cameraOffset
// is rotated by the player's eye angles: x is forward (negative = behind),
// z is up. Lateral is fixed; the backward distance and the up height are
// both player-adjustable (see CAMERA_DISTANCE_*/CAMERA_HEIGHT_* and
// GetCameraOffsetFor in camera.js, and the user menu's camera controls).
export const FOLLOW_OFFSET = { x: 0, y: 0, z: 20 };
export const CAMERA_LATERAL = 0;
export const CAMERA_DISTANCE_MIN = 50; // was 150 — players wanted it much closer
export const CAMERA_DISTANCE_MAX = 400;
export const CAMERA_DISTANCE_DEFAULT = CAMERA_DISTANCE_MIN; // closest setting feels best in play (was 320)
// The user menu offers the camera distance as a few preset buttons
// (camdist_seg_* in speedometer.xml), evenly spread from MIN to MAX — this
// is how many. Their labels (in meters) come from these values.
export const CAMERA_DISTANCE_STEPS = 3; // must match the camdist_seg_* buttons in speedometer.xml (test/camera-steps.test.mjs checks)

// Same presets as CAMERA_DISTANCE_* above, for how high above the melon the
// chase camera sits — a low, close-to-the-ground view or a higher overview.
export const CAMERA_HEIGHT_MIN = 0; // was 20 — down to the melon's own FOLLOW_OFFSET height
export const CAMERA_HEIGHT_MAX = 160;
export const CAMERA_HEIGHT_DEFAULT = CAMERA_HEIGHT_MIN; // lowest setting feels best in play (was 80)
export const CAMERA_HEIGHT_STEPS = 3; // must match the camheight_seg_* buttons in speedometer.xml
