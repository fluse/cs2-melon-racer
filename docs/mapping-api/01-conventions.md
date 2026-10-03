[Mapping API](README.md) › **1. Conventions** · next: [Core entities →](02-core-entities.md)

# 1. Conventions

These apply to every page of the Mapping API unless a page says otherwise.

## 1. The name is the config

Track sizes, lap counts, paint colors, teleport destinations, zone strengths
are encoded in entity names and parsed by the script. Adding, removing or
changing one is a pure Hammer edit — no script change, no rebuild.

## 2. Names are exact

Lower case, `_` as separator, case-sensitive, no leading/trailing spaces
(Hammer silently keeps a stray trailing space — `npm test` catches it).

## 3. Every melon trigger is set up the same way

| Setting | Value | Why |
|---|---|---|
| Class | `trigger_multiple` | fires on every touch |
| Spawnflag | **Physics Objects** ticked | the melon is a `prop_physics`; without it the trigger never fires for it (`npm test` checks it) |
| Filter | `filter_activator_class` → `prop_physics` (recommended) | keeps player pawns and other entities out; the script ignores any activator that isn't a melon anyway |
| Thickness | thick (≥ one tick of travel) | melons go well above `MAX_SPEED` (650 u/s) after bounces; a thin trigger is tunneled through |

## 4. Every output goes to the same place

```
<Output> → melon_drive_script → RunScriptInput → <parameter>
```

| Part | Meaning |
|---|---|
| `melon_drive_script` | the `point_script` running `maps/scripts/melon_drive.vjs` ([core entities](02-core-entities.md)) |
| parameter | selects the handler — see [all script inputs](README.md#all-script-inputs) |
| activator | *who* touched — must be a player's melon, anything else is ignored |
| caller | *which trigger* fired — its name and transform, read by some inputs |

## 5. Transforms are used directly

Where an entity marks a spawn/respawn spot, its **origin** is the position
and its **yaw** the facing (pitch/roll ignored). The player's view is turned
to that facing too. The melon is always placed a bit above the point, so
it's fine — even recommended — to sink trigger brushes into the floor.

| Constant | Value | Applies to | Defined in |
|---|---|---|---|
| `TELEPORT_UP_OFFSET` | 40 units | above a trigger's origin / a teleport destination (no floor trace) | `zones/teleport/constants.js` |
| `SPAWN_UP_OFFSET` | 40 units | above the floor traced straight down from a spawn entity (`hub_spawn`, `intro_spawn`, `start_spawn_*`, `start_spawn`, `checkpoint_spawn_*`) | `kart/constants.js` |

Keep spawn entities near the floor — a long drop can break the melon on
landing.

## 6. Limits

Script inputs are pre-registered up to these limits; raise them in
`race/constants.js` (and `npm run build`) if a map needs more.

| Constant | Value | Meaning |
|---|---|---|
| `MAX_TRACKS` | 8 | highest usable `trackId` |
| `MAX_CHECKPOINTS_PER_TRACK` | 32 | highest usable checkpoint `index` |

## 7. Reserved prefixes

Don't give unrelated entities names starting with any of these — the script
or the tests pick them up:

| Prefix | Page |
|---|---|
| `start_`, `checkpoint_`, `finish_` | [Tracks](04-tracks.md) |
| `hub_` | [Hub](05-hub.md), [Core entities](02-core-entities.md) |
| `paint_trigger_` | [Paint triggers](06-paint-triggers.md) |
| `teleport_` | [Teleporters](07-teleporters.md) |
| `melon_break` | [Kill triggers](08-kill-triggers.md), [Effect templates](03-effect-templates.md) |
| `heal_zone_` | [Heal zones](09-heal-zones.md) |
| `lift_zone_` | [Lift zones](10-lift-zones.md) |
| `camera_zone_` | [Camera zones](11-camera-zones.md) |
| `jump_pad_` | [Jump pads](12-jump-pads.md) |

---
[Mapping API](README.md) · next: [Core entities →](02-core-entities.md)
