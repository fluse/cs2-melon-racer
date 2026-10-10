# Melon Racer — Mapping API

The complete contract between the map (Hammer) and the gameplay script
(`melon_drive`): every entity name the script looks up, every name pattern
it parses, and every `RunScriptInput` parameter it accepts. If it isn't in
this folder, the script doesn't know about it.

- Building a track step by step: [TRACK_CREATION.md](../TRACK_CREATION.md).
- *Why* things behave the way they do: [GAMEPLAY.md](../../GAMEPLAY.md).
- Every name the script looks up is defined in a `constants.js` under
  [src/melon_drive/](../../src/melon_drive/), all re-exported by
  `constants/index.js`. `test/map/mapping-api-doc.test.mjs` fails if one is
  missing from this folder. (`melon_drive_script` and `gamemode` are fixed
  by convention instead: outputs target the one by name in Hammer.)

## Pages

| # | Page | What's in it |
|---|---|---|
| 1 | [Conventions](01-conventions.md) | Rules every trigger follows, offsets, limits, reserved prefixes |
| 2 | [Core entities](02-core-entities.md) | Required entities (`point_script`s, HUD, melon template, hub) and spawn points |
| 3 | [Effect templates](03-effect-templates.md) | Break burst, chunks, perfect spark, heal effect, boost trail, prediction dots |
| 4 | [Tracks](04-tracks.md) | Start line, checkpoints, respawn spots, finish line, laps |
| 5 | [Hub](05-hub.md) | Hub start area, `hub_teleport`, podium |
| 6 | [Paint triggers](06-paint-triggers.md) | Recolor the melon |
| 7 | [Teleporters](07-teleporters.md) | Generic teleports, respawn teleporters |
| 8 | [Kill & respawn triggers](08-kill-triggers.md) | Break the melon on the spot, or send it back to its checkpoint |
| 9 | [Heal zones](09-heal-zones.md) | Heal over time, full-heal zones |
| 10 | [Lift zones](10-lift-zones.md) | Climb shafts by bouncing between walls |
| 11 | [Camera zones](11-camera-zones.md) | Zoom out/in, front view, close-up, side view (2D) |
| 12 | [Jump pads](12-jump-pads.md) | Timed launch pads, no damage |
| 13 | [Water zones](13-water-zones.md) | Landing in water stops the melon, no bounces in it |
| 14 | [Prefabs](14-prefabs.md) | Hub, routes, tutorial, start/finish/heal gates, jump pad, obstacle mover, refill jumps; map variables, rules |
| 15 | [Checking your map](15-checking.md) | What `npm test` catches, debug log, minimal checklist |
| 16 | [Movers](16-movers.md) | `func_movelinear`s the script keeps going back and forth |
| 17 | [Jump recharge zones](17-jump-recharge-zones.md) | Wall jumps recharged at once, kept full inside |

## All script inputs

Every output targets `melon_drive_script` → `RunScriptInput` → *parameter*
([conventions](01-conventions.md#4-every-output-goes-to-the-same-place)).
`OnStartTouch` unless marked **End**. Anything else is ignored by the
script, and `npm test` fails on it.

| Parameter | Output | Fired by | Read from the trigger | Page |
|---|---|---|---|---|
| `start_<trackId>` | Start | the track's `start_<trackId>[_laps<M>]` trigger | — | [Tracks](04-tracks.md#start-line) |
| `start_line` | Start | a `start_<trackId>[_laps<M>]` trigger | name (track) | [Tracks](04-tracks.md#start-gate-prefab) |
| `checkpoint` | Start | a `checkpoint_<trackId>_<index>` trigger | name (track, index — also counted) | [Tracks](04-tracks.md#checkpoints) |
| `finish_<trackId>` | Start | any trigger on the finish line | — | [Tracks](04-tracks.md#finish-line) |
| `finish_line` | Start | a `finish_<trackId>` trigger, or a loop's start trigger | name (track) | [Tracks](04-tracks.md#finish-line) |
| `hub_enter` | Start | **only** `hub_start_trigger` | name (checked) | [Hub](05-hub.md) |
| `hub_leave` | **End** | **only** `hub_start_trigger` | — | [Hub](05-hub.md) |
| `hub_teleport` | Start | any trigger | — | [Hub](05-hub.md#sending-melons-to-the-hub) |
| `melon_paint` | Start | `paint_trigger_<r>_<g>_<b>` | name (color) | [Paint triggers](06-paint-triggers.md) |
| `melon_teleport` | Start | `teleport_[stop_\|keep_][checkpoint_]to_<destination>` | name (mode, respawn, destination) | [Teleporters](07-teleporters.md) |
| `melon_break` | Start | any trigger | — | [Kill triggers](08-kill-triggers.md#kill-trigger) |
| `melon_respawn` | Start | any trigger | — | [Respawn triggers](08-kill-triggers.md#respawn-trigger) |
| `heal_enter` | Start | any heal trigger | name (rate / `heal_zone_full`) | [Heal zones](09-heal-zones.md) |
| `heal_leave` | **End** | the same heal trigger | — | [Heal zones](09-heal-zones.md) |
| `lift_enter` | Start | any lift trigger | name (kick) | [Lift zones](10-lift-zones.md) |
| `lift_leave` | **End** | the same lift trigger | — | [Lift zones](10-lift-zones.md) |
| `camera_enter` | Start | any camera trigger | name (zoom) | [Camera zones](11-camera-zones.md) |
| `camera_leave` | **End** | the same camera trigger | — | [Camera zones](11-camera-zones.md) |
| `side_view_enter` | Start | any side-view trigger | name (yaw, distance, height) | [Camera zones](11-camera-zones.md#side-view-zones) |
| `side_view_leave` | **End** | the same side-view trigger | — | [Camera zones](11-camera-zones.md#side-view-zones) |
| `side_view_depth_enter` | Start | any depth trigger inside a side-view zone | — | [Camera zones](11-camera-zones.md#depth-zones) |
| `side_view_depth_leave` | **End** | the same depth trigger | — | [Camera zones](11-camera-zones.md#depth-zones) |
| `jump_pad_enter` | Start | any jump pad trigger | name (launch) | [Jump pads](12-jump-pads.md) |
| `jump_pad_leave` | **End** | the same jump pad trigger | — | [Jump pads](12-jump-pads.md) |
| `water_enter` | Start | any trigger around a `func_water` | — | [Water zones](13-water-zones.md) |
| `water_leave` | **End** | the same water trigger | — | [Water zones](13-water-zones.md) |
| `jump_recharge_enter` | Start | any jump recharge trigger | — | [Jump recharge zones](17-jump-recharge-zones.md) |
| `jump_recharge_leave` | **End** | the same jump recharge trigger | — | [Jump recharge zones](17-jump-recharge-zones.md) |

## All entity names

Fixed names the script looks up (and the two `point_script` names every
output relies on). Laps and checkpoint counts are read from the trigger
names once, when the script first needs the track list.

| Name | Class | Required | Page |
|---|---|---|---|
| `melon_drive_script` | `point_script` | yes | [Core entities](02-core-entities.md) |
| `gamemode` | `point_script` | yes | [Core entities](02-core-entities.md) |
| `speed_hud` | `custom_hud_layout` | yes | [Core entities](02-core-entities.md) |
| `melon_template` | `point_template` | yes | [Core entities](02-core-entities.md) |
| `hub_spawn` | any named point entity (e.g. `info_player_start`) | yes | [Core entities](02-core-entities.md#spawn-points) |
| `hub_start_trigger` | `trigger_multiple` | yes | [Hub](05-hub.md) |
| `intro_spawn` | `info_player_start` | — | [Core entities](02-core-entities.md#spawn-points) |
| `hub_spawn_facing` | `info_target` | — | [Core entities](02-core-entities.md#spawn-points) |
| `heal_zone_full` | `trigger_multiple` | — | [Heal zones](09-heal-zones.md#full-heal-zone) |
| `start_spawn` | `info_target` | — | [Tracks](04-tracks.md#start-gate-prefab) |
| `checkpoint_spawn` | `info_target` | — | [Tracks](04-tracks.md#checkpoint-gate-prefab) |
| `melon_break_template` | `point_template` | — | [Effect templates](03-effect-templates.md#break-burst) |
| `melon_break_chunks_template` | `point_template` | — | [Effect templates](03-effect-templates.md#break-chunks) |
| `perfect_hit_particle_template` | `point_template` | — | [Effect templates](03-effect-templates.md#perfect-spark) |
| `particle_health_template` | `point_template` | — | [Effect templates](03-effect-templates.md#heal-effect) |
| `particle_boost_trail_template` | `point_template` | — | [Effect templates](03-effect-templates.md#boost-trail) |
| `prediction_dot_template` | `point_template` | — | [Effect templates](03-effect-templates.md#prediction-dots) |
| `template_spectator_hat` | `point_template` | — | [Effect templates](03-effect-templates.md#free-look-avatar) |
| `particle_podium_confetti` | `info_particle_system` | — | [Hub](05-hub.md#confetti) |

## All name patterns

Names the script parses — the name carries the config.

| Pattern | Example | Class | Page |
|---|---|---|---|
| `start_<trackId>[_laps<M>]` | `start_1_laps3` | `trigger_multiple` | [Tracks](04-tracks.md#start-line) |
| `start_spawn_<trackId>` | `start_spawn_1` | `info_target` | [Tracks](04-tracks.md#start-line) |
| `finish_<trackId>` | `finish_2` | `trigger_multiple` | [Tracks](04-tracks.md#finish-line) |
| `checkpoint_<trackId>_<index>` | `checkpoint_1_3` | `trigger_multiple` | [Tracks](04-tracks.md#checkpoints) |
| `checkpoint_spawn_<trackId>_<index>` | `checkpoint_spawn_1_3` | `info_target` | [Tracks](04-tracks.md#checkpoints) |
| `podium_spawn_<place>` (1–3) | `podium_spawn_1` | `info_target` | [Hub](05-hub.md#podium) |
| `paint_trigger_<r>_<g>_<b>` | `paint_trigger_255_0_0` | `trigger_multiple` | [Paint triggers](06-paint-triggers.md) |
| `teleport_[stop_\|keep_][checkpoint_]to_<dest>` | `teleport_stop_to_tp_dest_hub_back` | `trigger_multiple` | [Teleporters](07-teleporters.md) |
| `heal_zone_<rate>` | `heal_zone_25` | `trigger_multiple` | [Heal zones](09-heal-zones.md) |
| `lift_zone_<speed>` | `lift_zone_600` | `trigger_multiple` | [Lift zones](10-lift-zones.md) |
| `camera_zone_[noclip_][front_]<a>[_<h>]` | `camera_zone_250_40` | `trigger_multiple` | [Camera zones](11-camera-zones.md) |
| `camera_zone_[noclip_]close[_<b>[_<h>]]` | `camera_zone_close_12_2` | `trigger_multiple` | [Camera zones](11-camera-zones.md#close-up-zones) |
| `side_view_<yaw>[_<distance>[_<height>]]` | `side_view_90_300_40` | `trigger_multiple` | [Camera zones](11-camera-zones.md#side-view-zones) |
| `jump_pad_<up>[_<forward>]` | `jump_pad_1000_400` | `trigger_multiple` | [Jump pads](12-jump-pads.md) |
| `mover[_wait<seconds>][_<anything>]` | `mover_wait1.5_left` | `func_movelinear` | [Movers](16-movers.md) |
