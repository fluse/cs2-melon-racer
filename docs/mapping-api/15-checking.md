[Mapping API](README.md) › **15. Checking your map** · [← Prefabs](14-prefabs.md) · [Movers →](16-movers.md)

# 15. Checking your map

## `npm test`

Reads `maps/melon_racer.vmap` and every [prefab](14-prefabs.md) placed in it (save in Hammer first) and fails on:

| Area | Mistake | Page |
|---|---|---|
| Inputs | a `RunScriptInput` parameter the script doesn't register (typo) | [all inputs](README.md#all-script-inputs) |
| Triggers | a trigger feeding the script without "Physics Objects" ticked | [conventions](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way) |
| Names | entity names with leading/trailing whitespace | [conventions](01-conventions.md#2-names-are-exact) |
| Hub | `hub_enter`/`hub_leave` fired by anything but `hub_start_trigger`, or either missing there | [Hub](05-hub.md) |
| Tracks | `start_<t>` from a trigger not named `start_<t>[_laps<M>]`, or a `start_*` trigger without it (or `start_line`) | [Tracks](04-tracks.md#start-line) |
| Tracks | `start_line`/`finish_line` from a trigger whose name names no track, or two start triggers for one track | [Tracks](04-tracks.md#start-gate-prefab) |
| Tracks | `start_spawn_<t>` without a `start_<t>` trigger, or any other `start_*` name | [Tracks](04-tracks.md#start-line) |
| Tracks | `checkpoint` from a trigger not named `checkpoint_<t>_<i>`, a checkpoint trigger without it, any other `checkpoint*` name, or a gap in the numbers | [Tracks](04-tracks.md#checkpoints) |
| Tracks | `checkpoint_spawn_<t>_<i>` whose checkpoint no trigger fires | [Tracks](04-tracks.md#checkpoints) |
| Teleporters | `melon_teleport` from a misnamed trigger, a missing destination, or a `teleport_to_*` trigger without the output | [Teleporters](07-teleporters.md) |
| Prefabs | a placed prefab with "Fix Up Entity Names" ticked (renames every entity the script looks up) | [Prefabs](14-prefabs.md#rules) |
| Prefabs | a map with no prefabs placed at all (sanity check of the prefab reader) | [Prefabs](14-prefabs.md) |
| Templates | `melon_template` missing, duplicated, not a `point_template`, without Template entries or a `prop_physics` | [Core entities](02-core-entities.md) |
| Templates | a break template missing or without a `.vpcf` particle system, any extra `melon_break_*` template | [Effect templates](03-effect-templates.md#break-burst) |
| Templates | a missing or duplicated `perfect_hit_particle_template` / `particle_health_template`, or one without a `.vpcf` | [Effect templates](03-effect-templates.md) |
| Templates | `particle_boost_trail_template` (once placed) without exactly `boost_trail.vpcf` + `boost_trail_juice.vpcf` | [Effect templates](03-effect-templates.md#boost-trail) |
| Templates | two particle templates pointing at the same `info_particle_system` | [Effect templates](03-effect-templates.md) |

`npm test` also checks this Mapping API against the script
(`mapping-api-doc.test.mjs`) and the source folder layout
(`module-layout.test.mjs`).

## In game

With `DEBUG` on (`src/melon_drive/core/debug.js`), the console logs most
touches the script accepts or ignores (`[melon_drive] checkpoint_1_2: …` — named after the checkpoint, not the input).
Some ignores stay silent: a checkpoint already passed, a start line
re-crossed mid-lap, a finished melon, `melon_break`/`melon_respawn` on a
broken or race-locked melon, and every `*_leave`.

| Symptom | Cause |
|---|---|
| no console line at all for a trigger | output missing or mistargeted, or filter/spawnflags keep the melon out — or one of the silent ignores above |
| `[melon_drive] melon_teleport: …` (even with `DEBUG` off) | teleporter misnamed or destination missing at runtime |
| `no info_target "start_spawn_…" or "start_spawn" nearby` | track has no [start spawn](04-tracks.md#start-line) |
| `[melon_drive] start_line` / `finish_line fired by "…", which names no track 1..8` (even with `DEBUG` off) | a [start or finish gate](14-prefabs.md#map-variables) copy's `track` isn't a `start_<id>[_laps<M>]` / `finish_<id>` name |
| `[melon_drive] hub_enter fired by "…", not "hub_start_trigger"` (even with `DEBUG` off) | `hub_enter` on the wrong trigger — use [`hub_teleport`](05-hub.md#sending-melons-to-the-hub) |
| `[melon_drive] SpawnFromTemplate: no point_template named "…"` (for the break templates even with `DEBUG` off) | an [effect template](03-effect-templates.md) missing or misnamed |
| `no info_target "checkpoint_spawn_…" or "checkpoint_spawn" nearby` | checkpoint has no [checkpoint spawn](04-tracks.md#checkpoints) |
| hub modal never closes | `hub_leave` missing on `hub_start_trigger` |

## Minimal map checklist

- [ ] `point_script` `gamemode` + `point_script` `melon_drive_script` ([core](02-core-entities.md))
- [ ] `custom_hud_layout` `speed_hud` (one)
- [ ] `point_template` `melon_template` with the melon `prop_physics`
- [ ] `hub_spawn` near the hub floor, `hub_start_trigger` with `hub_enter` + `hub_leave` ([hub](05-hub.md))
- [ ] per track ([tracks](04-tracks.md)): `start_<id>[_laps<M>]` firing `start_line` (or `start_<id>`) + `start_spawn_<id>` or a `start_spawn` next to it (the [start gate prefab](04-tracks.md#start-gate-prefab) does both); `checkpoint_<id>_1` … `_<N>` firing `checkpoint`, each with `checkpoint_spawn_<id>_<n>` or a `checkpoint_spawn` next to it (the [checkpoint gate prefab](04-tracks.md#checkpoint-gate-prefab) does both); a `finish_<id>` or `finish_line` output (the [finish gate prefab](14-prefabs.md#finish-gate))
- [ ] optional: `intro_spawn`, `hub_spawn_facing`, [effect templates](03-effect-templates.md), [paint triggers](06-paint-triggers.md), [teleporters](07-teleporters.md), [kill triggers](08-kill-triggers.md), [zones](09-heal-zones.md), [jump pads](12-jump-pads.md)
- [ ] every melon trigger: `trigger_multiple`, "Physics Objects", filtered to `prop_physics`
- [ ] `npm test` passes

---
[← Prefabs](14-prefabs.md) · [Mapping API](README.md) · [Movers →](16-movers.md)
