[Mapping API](README.md) › **11. Camera zones** · [← Lift zones](10-lift-zones.md) · [Jump pads →](12-jump-pads.md)

# 11. Camera zones

Areas where the chase camera zooms out (overview of a big jump, an open
hall), in (tight tunnels), moves in front of the melon or right up behind
it — or, in a [side-view zone](#side-view-zones), looks at it from one side
like a 2D jump & run.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | anything, or one of the [name variants](#name-variants) |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `camera_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `camera_leave` |

Both outputs are required.

## Name variants

Values are units, decimals allowed. The normal chase camera sits
`CAMERA_DISTANCE` (50) behind and `CAMERA_HEIGHT` (0) above the melon.

| Name | Example | Camera | Ease |
|---|---|---|---|
| any other name | — | 150 further back, 0 higher (`CAMERA_ZONE_EXTRA_*`) | 0.6 s |
| `camera_zone_<distance>` | `camera_zone_-30` | 30 closer | 0.6 s |
| `camera_zone_<distance>_<height>` | `camera_zone_250_40` | 250 further back, 40 higher | 0.6 s |
| `camera_zone_front_<ahead>_<height>` | `camera_zone_front_40_0` | 40 **in front of** the melon's center, 0 above (just over the ground) | 0.6 s |
| `camera_zone_close` | — | close-up: 16 behind, 4 above the center | 1.2 s |
| `camera_zone_close_<behind>_<height>` | `camera_zone_close_12_2` | close-up: 12 behind, 2 above | 1.2 s |
| `camera_zone_noclip_…` | `camera_zone_noclip_250_40`, `camera_zone_noclip_front_40_0`, `camera_zone_noclip_close_12_2` | any of the above, but walls don't pull the camera in | same |

Normal zones are **added** to the normal offset (negative = closer /
lower); front and close-up zones are the camera's **spot** relative to the
melon's center (~7 units above the floor). The slower close-up ease applies
going into a close-up and from it back to no zone; from a close-up straight
into another camera zone it's 0.6 s.

Name patterns:

| Variant | Pattern |
|---|---|
| zoom / front | `^camera_zone_(noclip_)?(front_)?(-?\d+(?:\.\d+)?)(?:_(-?\d+(?:\.\d+)?))?$` |
| close-up | `^camera_zone_(noclip_)?close(?:_(\d+(?:\.\d+)?)(?:_(-?\d+(?:\.\d+)?))?)?$` |

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `CAMERA_DISTANCE` | 50 units | normal chase camera distance | `camera/follow/constants.js` |
| `CAMERA_HEIGHT` | 0 units | normal chase camera height | `camera/follow/constants.js` |
| `CAMERA_ZONE_EXTRA_DISTANCE` | 150 units | zoom for zones without numbers | `zones/camera-zone/constants.js` |
| `CAMERA_ZONE_EXTRA_HEIGHT` | 0 units | height for zones without numbers | `zones/camera-zone/constants.js` |
| `CAMERA_ZONE_EASE_SECONDS` | 0.6 s | ease in and out | `zones/camera-zone/constants.js` |
| `CAMERA_ZONE_MIN_DISTANCE` | 0 units | zooming in never gets closer (not for front/close-up) | `zones/camera-zone/constants.js` |
| `CAMERA_ZONE_FRONT_HEIGHT` | 0 units | front zone height without a number | `zones/camera-zone/constants.js` |
| `CAMERA_CLOSEUP_DISTANCE` | 16 units | close-up distance without numbers | `zones/camera-zone/constants.js` |
| `CAMERA_CLOSEUP_HEIGHT` | 4 units | close-up height without numbers | `zones/camera-zone/constants.js` |
| `CAMERA_CLOSEUP_EASE_SECONDS` | 1.2 s | close-up ease in and out | `zones/camera-zone/constants.js` |

## Close-up zones

For dramatic passages. `<behind>` can't be negative, `<height>` can. Below
~10 units behind, the camera ends up inside the melon.

## Front zones

The camera still looks where the player looks, so the melon is behind it (a
low bumper view); easing in/out passes through the melon. If walls or the
floor keep pulling it back in, use `camera_zone_noclip_front_…`.

## Rules

- Walls pull the camera in as usual, which can cancel a zoom-out next to a
  wall — `noclip_` turns that off while the zone's zoom is on.
- Overlapping camera zones don't add up: the one entered last counts;
  moving from one into another eases straight to the new zoom. A
  [lift zone](10-lift-zones.md)'s zoom does add on top.
- Teleports and respawns keep the melon in its zones — respawning inside a
  camera zone keeps its zoom.

## Side-view zones

A 2D jump & run section: the camera stops following the mouse and looks at
the melon from one fixed side, at a set distance. Only A/D drive, left/right on
screen; W/S do nothing (except in a [depth zone](#depth-zones)), Space jumps. Wall
jumps there aren't rated by angle (no boost, no PERFECT), as in a
[lift zone](10-lift-zones.md), but always go a bit higher and further, and
use a lift zone's longer contact window — and, as there, they use up no charges. The melon stays on the plane it entered on — nothing moves it towards or away
from the camera.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | `side_view_<yaw>[_<distance>[_<height>]]`, or anything for the defaults |
| Pattern | `^side_view_(-?\d+(?:\.\d+)?)(?:_(\d+(?:\.\d+)?)(?:_(-?\d+(?:\.\d+)?))?)?$` |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `side_view_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `side_view_leave` |

Both outputs are required.

| Name | Example | Camera |
|---|---|---|
| `side_view_<yaw>` | `side_view_90` | looks north (Hammer yaw 90), 300 away, 40 above the melon's center — D drives east |
| `side_view_<yaw>_<distance>` | `side_view_0_500` | looks east from 500 away — D drives south |
| `side_view_<yaw>_<distance>_<height>` | `side_view_180_250_0` | looks west from 250 away, level with the melon |
| any other name | — | yaw 90, 300 away, 40 above |

`<yaw>` is the way the camera **looks** (Hammer's yaw: 0 = +x, 90 = +y);
screen right is `<yaw>` − 90. The camera always aims at the melon, so a
`<height>` looks down at it (negative: up from below). Build the section
along the screen axis — the trigger should cover the whole of it, with a
bit of room above for jumps.

- Entering, the camera swings from behind the melon to the side over
  `SIDE_VIEW_EASE_SECONDS`; leaving, the player's view is turned the way the
  melon was facing on screen and the camera swings back behind it —
  unless it was teleported out (hub, a checkpoint, a teleporter): then the
  camera cuts straight back behind it and the view keeps the facing the
  teleport gave it.
- Walls don't pull the side camera in: keep the space between the track and
  the camera clear (or let it look through a wall on purpose).
- Overlapping side-view zones: the one entered last counts; entering a new
  one starts on the plane the melon is on right then. Normal camera and lift
  zones have no effect while the side view is on.
- While the melon breaks, the camera stays put watching the crash site;
  respawning inside the zone keeps the side view.

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `SIDE_VIEW_DEFAULT_YAW` | 90° | yaw for a name without numbers | `zones/side-view/constants.js` |
| `SIDE_VIEW_DISTANCE` | 300 units | distance without a number | `zones/side-view/constants.js` |
| `SIDE_VIEW_HEIGHT` | 40 units | height without a number | `zones/side-view/constants.js` |
| `SIDE_VIEW_PLANE_PULL` | 6 /s | how fast a drift off the plane is pulled back | `zones/side-view/constants.js` |
| `SIDE_VIEW_PLANE_MAX_SPEED` | 200 u/s | that pull at most | `zones/side-view/constants.js` |
| `SIDE_VIEW_WALL_JUMP_UP_SPEED` | 300 u/s | a wall jump's upward speed in the zone (outside: 240) | `zones/side-view/constants.js` |
| `SIDE_VIEW_WALL_JUMP_PUSH_SPEED` | 220 u/s | a wall jump's push off the wall in the zone (outside: 160) | `zones/side-view/constants.js` |
| `SIDE_VIEW_EASE_SECONDS` | 0.8 s | swing to the side and back | `camera/side-view/constants.js` |
| `SIDE_VIEW_TELEPORT_DISTANCE` | 256 units | a move in one tick this far counts as a teleport | `camera/side-view/constants.js` |
| `SIDE_VIEW_TELEPORT_CUT_SECONDS` | 0.25 s | leaving within this long after a teleport cuts back instead of swinging | `camera/side-view/constants.js` |

## Depth zones

A small area inside a side-view zone where the melon may also move in
depth: W drives into the screen (away from the camera), S out of it (towards
the camera), and the melon isn't held on its plane. Leaving it, the melon is
held on the plane it's on right then. Outside a side view it does nothing.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | anything |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `side_view_depth_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `side_view_depth_leave` |

Both outputs are required. The side camera follows the melon in depth on
its own (it always sits at the zone's distance from the melon), so keep the
space towards the camera clear here too.

---
[← Lift zones](10-lift-zones.md) · [Mapping API](README.md) · [Jump pads →](12-jump-pads.md)
