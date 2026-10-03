[Mapping API](README.md) › **10. Lift zones** · [← Heal zones](09-heal-zones.md) · [Camera zones →](11-camera-zones.md)

# 10. Lift zones

For shafts and high walls that melons climb by bouncing between walls.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | anything, or `lift_zone_<speed>` |
| Pattern | `^lift_zone_(\d+(?:\.\d+)?)$` |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `lift_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `lift_leave` |

Both outputs are required. Size the zone to cover the whole climb, top
included.

## Name variants and height per bounce

The kick is the melon's upward speed right after a wall bounce. Height
gained ≈ kick² / 1600 units (gravity 800).

| Name | Kick | Height / bounce | PERFECT bounce (×1.2) |
|---|---|---|---|
| *(outside a lift zone)* | 220 u/s | ~30 | ~44 |
| any other name | 450 u/s | ~127 | ~182 |
| `lift_zone_600` | 600 u/s | ~225 | ~324 |

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `WALL_BOUNCE_UP_SPEED` | 220 u/s | normal kick, outside lift zones | `movement/wall-bounce/constants.js` |
| `LIFT_ZONE_UP_SPEED` | 450 u/s | kick for lift zones without a number | `zones/lift/constants.js` |
| `PERFECT_BOUNCE_UP_MULTIPLIER` | ×1.2 | kick multiplier for a PERFECT bounce | `movement/wall-bounce/constants.js` |
| `WALL_BOUNCE_MIN_IMPACT` | 200 u/s | minimum impact for a bounce at all | `movement/wall-bounce/constants.js` |
| `LIFT_ZONE_MIN_BOUNCE_SPEED` | 450 u/s | minimum sideways speed off the wall in a zone | `zones/lift/constants.js` |
| `LIFT_ZONE_WALL_JUMP_COOLDOWN` | 0.1 s | between two wall jumps (normally `WALL_JUMP_COOLDOWN`, 0.45 s) | `zones/lift/constants.js` |
| `LIFT_ZONE_JUMP_BUFFER` | 0.2 s | a jump pressed this early before touching the wall still fires | `zones/lift/constants.js` |
| `LIFT_ZONE_WALL_JUMP_WINDOW` | 0.2 s | a wall contact stays jumpable this long | `zones/lift/constants.js` |
| `LIFT_CAMERA_EXTRA_DISTANCE` | 220 units | chase camera eases this much further back | `camera/lift-zoom/constants.js` |
| `LIFT_CAMERA_EXTRA_HEIGHT` | 30 units | … and this much higher | `camera/lift-zoom/constants.js` |
| `LIFT_CAMERA_EASE_SECONDS` | 0.6 s | camera ease time | `camera/lift-zoom/constants.js` |

## Rules

- Only wall **bounces** get the kick — not driving through. A fall is
  cancelled; a melon already rising faster keeps its own speed (kicks don't
  add up).
- A shaft must be wide enough for the melon to gather `WALL_BOUNCE_MIN_IMPACT`
  between walls. Inside the zone every bounce leaves the wall with at least
  `LIFT_ZONE_MIN_BOUNCE_SPEED` sideways, so the chain doesn't die.
- A `lift_zone_<speed>` below `WALL_BOUNCE_UP_SPEED` kicks with
  `WALL_BOUNCE_UP_SPEED` — a lift zone never kicks weaker than outside one.
- Wall jumps inside cost no wall-jump charge, are always full strength and
  don't cut a bounce's kick short (still alternating walls). They aren't
  rated by angle: no PERFECT/GOOD speed bonus, spark or bounce-panel
  feedback — the shaft is climbed, not raced.
- The camera looks through the shaft walls instead of being pulled in.
- Overlapping zones don't stack (the strongest counts). Teleports and
  respawns keep the melon in its zones, like [heal zones](09-heal-zones.md#rules).

## Marker effect (optional, not script-driven)

Two `info_particle_system`s at the bottom of the shaft, "Start Active" on:
`particles/melon_racer/lift_updraft.vpcf` (swaying glow motes) and
`particles/melon_racer/lift_updraft_streaks.vpcf` (fast rising streaks).

---
[← Heal zones](09-heal-zones.md) · [Mapping API](README.md) · [Camera zones →](11-camera-zones.md)
