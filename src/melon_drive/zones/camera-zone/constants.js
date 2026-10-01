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
// the one entered last counts. Adds up with the lift zoom (camera/lift-zoom/).
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
