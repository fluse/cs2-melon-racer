// Side-view zones (docs/mapping-api/11-camera-zones.md#side-view-zones): a
// trigger_multiple (filtered to prop_physics) with OnStartTouch ->
// RunScriptInput "side_view_enter" and OnEndTouch -> "side_view_leave". While
// the melon is inside, it's played like a 2D jump & run: the camera stops
// following the mouse and looks at the melon from one side, A/D drive
// left/right on screen, and the melon stays on the plane it entered on (no
// movement towards or away from the camera). The camera part is in
// camera/side-view/. The values come from the name:
//   side_view_<yaw>                       camera looks along <yaw> (Hammer yaw: 0 = +x/east,
//                                         90 = +y/north) — screen right is then <yaw> - 90,
//                                         e.g. side_view_90: looks north, D drives east
//   side_view_<yaw>_<distance>            ... from <distance> units away
//   side_view_<yaw>_<distance>_<height>   ... and <height> units above the melon's center,
//                                         looking down at it (negative: from below)
// Any other name: SIDE_VIEW_DEFAULT_YAW, SIDE_VIEW_DISTANCE, SIDE_VIEW_HEIGHT.
// Overlapping zones: the one entered last counts.
// Only A/D drive (decided) — W/S do nothing, except inside a side-view depth
// zone: a trigger_multiple (filtered to prop_physics, any name) with
// OnStartTouch -> RunScriptInput "side_view_depth_enter" and OnEndTouch ->
// "side_view_depth_leave", placed inside a side-view zone. There W drives
// into the screen (away from the camera), S out of it (towards the camera),
// the melon isn't held on its plane, and leaving it the plane is wherever the
// melon is then. Outside a side view it does nothing.
export const SIDE_VIEW_NAME_PATTERN = /^side_view_(-?\d+(?:\.\d+)?)(?:_(\d+(?:\.\d+)?)(?:_(-?\d+(?:\.\d+)?))?)?$/;
export const SIDE_VIEW_DEFAULT_YAW = 90; // degrees, for a zone without values in its name
// How far from the melon the camera sits, without a distance in the name.
// Higher: more of the level in view, the melon gets smaller on screen.
export const SIDE_VIEW_DISTANCE = 300; // units
// How high above the melon's center it sits, without a height in the name —
// it always looks at the melon, so higher = looking down at it more.
export const SIDE_VIEW_HEIGHT = 40; // units
// Keeping the melon on its plane: whatever pushes it towards or away from the
// camera (a slanted wall, a bump) is cancelled every tick, and a melon that
// has drifted off the plane anyway is pulled back at this rate (1/s: the
// drift is gone to ~1/e after 1/SIDE_VIEW_PLANE_PULL seconds) ...
export const SIDE_VIEW_PLANE_PULL = 6;
// ... but never faster than this.
export const SIDE_VIEW_PLANE_MAX_SPEED = 200; // units/sec
// Wall jumps in a side-view zone aren't rated (no angle bonus, see
// zones/lift/logic.js WallRules) but go a bit higher and further than
// outside one (WALL_JUMP_UP_SPEED / WALL_JUMP_PUSH_SPEED), for jump & run
// sections. Same rules otherwise (charges, cooldown, never slower upward).
export const SIDE_VIEW_WALL_JUMP_UP_SPEED = 300; // units/sec upward
export const SIDE_VIEW_WALL_JUMP_PUSH_SPEED = 220; // units/sec at least away from the wall
