[Mapping API](README.md) › **21. Gravity zones** · [← Ball spawner](20-ball-spawner.md) · [Bouncers →](22-bouncers.md)

# 21. Gravity zones

An area with its own gravity: inside, the melon is pulled down with a share
of the normal `GRAVITY`, so jumps go higher and further. It also loses less
speed while rolling, so it keeps its momentum longer. Use it for a low-gravity
jump section, or (gravity unchanged) for a fast rolling stretch where the
melon shouldn't slow down on its own.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | `gravity_zone_<gravity>[_roll<roll>]`, or anything for the defaults |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `gravity_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `gravity_leave` |

Both outputs are required. Without `gravity_leave` the melon keeps the
zone's gravity after leaving.

## Name

Pattern `^gravity_zone_(\d+(?:\.\d+)?)(?:_roll(\d+(?:\.\d+)?))?$`, both values in percent:

- **gravity**: how hard the melon is pulled down, in percent of `GRAVITY`.
  100 = normal, 50 = half (a jump goes twice as high), 0 = it floats.
- **roll**: how much of the speed it normally loses while rolling it loses
  here (the coasting slowdown and the engine's rolling friction). 100 = normal,
  0 = it rolls on without slowing on level ground, 200 = twice the loss.
  Without `_roll` it's the same as the gravity, because a lighter melon presses
  less on the floor and rubs less.

| Name | Gravity | Rolling loss |
|---|---|---|
| any other name (e.g. `gravity_zone`) | `GRAVITY_ZONE_PERCENT` | the same |
| `gravity_zone_50` | half | half |
| `gravity_zone_30_roll100` | 30 % | normal |
| `gravity_zone_100_roll20` | normal | a fifth |
| `gravity_zone_100_roll0` | normal | none |

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `GRAVITY_ZONE_PERCENT` | 50 | gravity and roll of a zone without values in its name, in percent | `zones/gravity/constants.js` |
| `GRAVITY_ZONE_MAX_ROLL_DECEL` | 1500 u/s² | a faster slowdown is a hit (wall, bump), not rolling: the zone leaves it alone | `zones/gravity/constants.js` |
| `GRAVITY` | 800 u/s² | the normal pull | `movement/jump/constants.js` |
| `COAST_FRICTION` | 120 u/s² | slowdown with no input, scaled by the roll | `movement/driving/constants.js` |

## Rules

- Overlapping gravity zones don't add up: the one entered last counts.
- The user menu's physics page "Gravity" still applies on top (both are
  multiplied).
- Hits stay hits: impacts, wall bounces and their damage are unchanged.
  Only the small, steady loss of rolling is reduced.
- Driving up a slope also slows the melon less with a low roll.
- At very low gravity (below about 10 %) the floor can hardly be told apart from
  a fall, so ground jumps there may not work every time.
- Teleports and respawns keep the melon in its zones, like
  [heal zones](09-heal-zones.md#rules).
- Players can't see the trigger. Mark the area in the map, for example with
  a texture or particles.

---
[← Ball spawner](20-ball-spawner.md) · [Mapping API](README.md) · [Bouncers →](22-bouncers.md)
