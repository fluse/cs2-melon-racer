// Chase camera offsets.

// Offsets for CameraFollowConfig — behind and above the melon. cameraOffset
// is rotated by the player's eye angles: x is forward (negative = behind),
// z is up. The same for every player (see GetCameraOffsetFor in
// camera/follow.js); lift and camera zones zoom out/in from there.
export const FOLLOW_OFFSET = { x: 0, y: 0, z: 20 };
export const CAMERA_LATERAL = 0;
// How far behind the melon the chase camera sits (was a user-menu preset,
// 50..400 — the closest one felt best in play).
// Higher: more overview, the melon gets smaller on screen.
// Lower: closer, more speed feel; walls and slopes block the view sooner.
export const CAMERA_DISTANCE = 50;
// How high above FOLLOW_OFFSET it sits (was a preset too, 0..160 — the
// lowest felt best).
// Higher: looks down on the melon — a better view ahead over hills.
// Lower: flat, close-to-the-ground view.
export const CAMERA_HEIGHT = 0;

// Walls between the melon and the chase camera pull the camera in — done by
// the script (camera/wall-clip.js), not the engine, so it eases both ways:
// the engine's own clipping pulls in instantly, which jerks the view at every
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
// The break camera (camera/break-zoom.js) still uses the engine's clipping —
// this is how fast it returns after being pulled in there
// (CameraFollowConfig.cameraOffsetReturnStrength; 1 = instantly, the
// engine's default; pulling in is always instant).
export const CAMERA_OFFSET_RETURN_STRENGTH = 0.2;

// Lift zones (see zones/lift/constants.js): while the melon is inside one, the
// chase camera eases back and up by this much on top of the normal
// CAMERA_DISTANCE/CAMERA_HEIGHT, so the climb and the opposite wall stay in view;
// it eases back in after leaving. While zoomed out, the camera is NOT pulled
// in at walls (clipCameraOffset off) — in a shaft the wall right behind the
// melon would undo the zoom — so it looks through the shaft walls instead.
// Higher: more overview, the melon gets smaller on screen.
export const LIFT_CAMERA_EXTRA_DISTANCE = 220; // units further back (was 150)
export const LIFT_CAMERA_EXTRA_HEIGHT = 30; // units higher up (was 120 — too high)
export const LIFT_CAMERA_EASE_SECONDS = 0.6; // seconds to zoom fully out (or back in)

// Camera zones (docs/mapping-api/11-camera-zones.md): a trigger_multiple (filtered to
// prop_physics) with OnStartTouch -> RunScriptInput "camera_enter" and
// OnEndTouch -> "camera_leave". While the melon is inside, the chase camera
// eases to the normal offset plus the zone's: further back (negative =
// closer) and higher up (negative = lower). The values come from the name:
//   camera_zone_<distance>_<height>          e.g. camera_zone_250_40 (out), camera_zone_-30_0 (in)
//   camera_zone_<distance>                   height 0
//   camera_zone_noclip_<distance>_<height>   same, but the camera isn't pulled in at walls
//   camera_zone_front_<ahead>_<height>       camera IN FRONT of the melon: <ahead> units ahead,
//                                            <height> units above the melon's center (default
//                                            CAMERA_ZONE_FRONT_HEIGHT) — e.g. camera_zone_front_40_0,
//                                            a low view just above the ground. Looks the way the
//                                            player looks (forward), so the melon itself is behind it.
//                                            Combines with noclip: camera_zone_noclip_front_40_0.
//   camera_zone_close[_<behind>[_<height>]]  CLOSE-UP for dramatic passages: camera right behind the
//                                            melon, <behind> units behind and <height> units above its
//                                            center (defaults CAMERA_CLOSEUP_DISTANCE/_HEIGHT), eased
//                                            in and out slowly (CAMERA_CLOSEUP_EASE_SECONDS) — e.g.
//                                            camera_zone_close, camera_zone_close_12_2.
//                                            Combines with noclip: camera_zone_noclip_close_15_3.
// Any other name uses CAMERA_ZONE_EXTRA_DISTANCE/_HEIGHT. Overlapping zones:
// the one entered last counts. Adds up with the lift zoom above.
export const CAMERA_ZONE_NAME_PATTERN = /^camera_zone_(noclip_)?(front_)?(-?\d+(?:\.\d+)?)(?:_(-?\d+(?:\.\d+)?))?$/;
export const CAMERA_CLOSEUP_NAME_PATTERN = /^camera_zone_(noclip_)?close(?:_(\d+(?:\.\d+)?)(?:_(-?\d+(?:\.\d+)?))?)?$/;
export const CAMERA_ZONE_EXTRA_DISTANCE = 150; // units further back, for a zone without values in its name
export const CAMERA_ZONE_EXTRA_HEIGHT = 0; // units higher up, same
export const CAMERA_ZONE_EASE_SECONDS = 0.6; // seconds for a whole zoom in or out (also between two zones)
// Zooming in never brings the camera closer than this behind the melon
// (a negative distance past CAMERA_DISTANCE would put it in front) — only
// camera_zone_front_… zones may go past it.
export const CAMERA_ZONE_MIN_DISTANCE = 0;
// A front zone without a height in its name: units above the melon's center
// (which sits ~7 units above the floor), so 0 = just above the ground.
// Negative: lower still — below about -5 the camera ends up in the floor.
export const CAMERA_ZONE_FRONT_HEIGHT = 0;
// Close-up zones (camera_zone_close…) without values in their name: the
// camera's spot behind / above the melon's center (the normal chase camera is
// CAMERA_DISTANCE behind and FOLLOW_OFFSET.z + CAMERA_HEIGHT above it).
// Lower CAMERA_CLOSEUP_DISTANCE: closer still — below the melon's own size
//   (~10 units) the camera ends up inside it.
export const CAMERA_CLOSEUP_DISTANCE = 16;
export const CAMERA_CLOSEUP_HEIGHT = 4;
// Seconds a close-up zone takes to zoom in (and back out after leaving) —
// slower than CAMERA_ZONE_EASE_SECONDS, so it reads as a deliberate shot.
// Higher: a slow, dramatic push-in. Lower: snaps in.
export const CAMERA_CLOSEUP_EASE_SECONDS = 1.2;
