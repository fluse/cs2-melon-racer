[Mapping API](README.md) › **11. Camera zones** · [← Lift zones](10-lift-zones.md) · [Jump pads →](12-jump-pads.md)

# 11. Camera zones

Areas where the chase camera zooms out (overview of a big jump, an open
hall), in (tight tunnels), moves in front of the melon or right up behind
it.

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
melon's center (~7 units above the floor).

Name patterns:

| Variant | Pattern |
|---|---|
| zoom / front | `^camera_zone_(noclip_)?(front_)?(-?\d+(?:\.\d+)?)(?:_(-?\d+(?:\.\d+)?))?$` |
| close-up | `^camera_zone_(noclip_)?close(?:_(\d+(?:\.\d+)?)(?:_(-?\d+(?:\.\d+)?))?)?$` |

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `CAMERA_DISTANCE` | 50 units | normal chase camera distance | `camera/constants.js` |
| `CAMERA_HEIGHT` | 0 units | normal chase camera height | `camera/constants.js` |
| `CAMERA_ZONE_EXTRA_DISTANCE` | 150 units | zoom for zones without numbers | `camera/constants.js` |
| `CAMERA_ZONE_EXTRA_HEIGHT` | 0 units | height for zones without numbers | `camera/constants.js` |
| `CAMERA_ZONE_EASE_SECONDS` | 0.6 s | ease in and out | `camera/constants.js` |
| `CAMERA_ZONE_MIN_DISTANCE` | 0 units | zooming in never gets closer (not for front/close-up) | `camera/constants.js` |
| `CAMERA_ZONE_FRONT_HEIGHT` | 0 units | front zone height without a number | `camera/constants.js` |
| `CAMERA_CLOSEUP_DISTANCE` | 16 units | close-up distance without numbers | `camera/constants.js` |
| `CAMERA_CLOSEUP_HEIGHT` | 4 units | close-up height without numbers | `camera/constants.js` |
| `CAMERA_CLOSEUP_EASE_SECONDS` | 1.2 s | close-up ease in and out | `camera/constants.js` |

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

---
[← Lift zones](10-lift-zones.md) · [Mapping API](README.md) · [Jump pads →](12-jump-pads.md)
