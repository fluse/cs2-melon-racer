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

// Lift zones (see constants/lift.js): while the melon is inside one, the
// chase camera eases back and up by this much on top of the player's own
// distance/height setting, so the climb and the opposite wall stay in view;
// it eases back in after leaving. While zoomed out, the camera is NOT pulled
// in at walls (clipCameraOffset off) — in a shaft the wall right behind the
// melon would undo the zoom — so it looks through the shaft walls instead.
// Higher: more overview, the melon gets smaller on screen.
export const LIFT_CAMERA_EXTRA_DISTANCE = 300; // units further back (was 150)
export const LIFT_CAMERA_EXTRA_HEIGHT = 30; // units higher up (was 120 — too high)
export const LIFT_CAMERA_EASE_SECONDS = 0.6; // seconds to zoom fully out (or back in)

// Camera zones (MAPPING_API.md 4.8): a trigger_multiple (filtered to
// prop_physics) with OnStartTouch -> RunScriptInput "camera_enter" and
// OnEndTouch -> "camera_leave". While the melon is inside, the chase camera
// eases to the player's own offset plus the zone's: further back (negative =
// closer) and higher up (negative = lower). The values come from the name:
//   camera_zone_<distance>_<height>          e.g. camera_zone_250_40 (out), camera_zone_-30_0 (in)
//   camera_zone_<distance>                   height 0
//   camera_zone_noclip_<distance>_<height>   same, but the camera isn't pulled in at walls
// Any other name uses CAMERA_ZONE_EXTRA_DISTANCE/_HEIGHT. Overlapping zones:
// the one entered last counts. Adds up with the lift zoom above.
export const CAMERA_ZONE_NAME_PATTERN = /^camera_zone_(noclip_)?(-?\d+(?:\.\d+)?)(?:_(-?\d+(?:\.\d+)?))?$/;
export const CAMERA_ZONE_EXTRA_DISTANCE = 150; // units further back, for a zone without values in its name
export const CAMERA_ZONE_EXTRA_HEIGHT = 0; // units higher up, same
export const CAMERA_ZONE_EASE_SECONDS = 0.6; // seconds for a whole zoom in or out (also between two zones)
// Zooming in never brings the camera closer than this behind the melon
// (a negative distance past the player's own setting would put it in front).
export const CAMERA_ZONE_MIN_DISTANCE = 20;
