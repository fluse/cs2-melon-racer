[Mapping API](README.md) › **14. Checking your map** · [← Water zones](13-water-zones.md)

# 14. Checking your map

## `npm test`

Reads `maps/melon_racer.vmap` (save in Hammer first) and fails on:

| Area | Mistake | Page |
|---|---|---|
| Inputs | a `RunScriptInput` parameter the script doesn't register (typo) | [all inputs](README.md#all-script-inputs) |
| Triggers | a trigger feeding the script without "Physics Objects" ticked | [conventions](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way) |
| Names | entity names with leading/trailing whitespace | [conventions](01-conventions.md#2-names-are-exact) |
| Hub | `hub_enter`/`hub_leave` fired by anything but `hub_start_trigger`, or either missing there | [Hub](05-hub.md) |
| Tracks | `start_<t>` from a trigger not named `start_<t>[_laps<M>]`, or a `start_*` trigger without it | [Tracks](04-tracks.md#start-line) |
| Tracks | `start_spawn_<t>` without a `start_<t>` trigger, or any other `start_*` name | [Tracks](04-tracks.md#start-line) |
| Tracks | a checkpoint trigger named differently from the parameter it fires, or a gap in the numbers | [Tracks](04-tracks.md#checkpoints) |
| Tracks | `checkpoint_spawn_<t>_<i>` whose checkpoint no trigger fires | [Tracks](04-tracks.md#checkpoints) |
| Teleporters | `melon_teleport` from a misnamed trigger, a missing destination, or a `teleport_to_*` trigger without the output | [Teleporters](07-teleporters.md) |
| Templates | `melon_template` without a `prop_physics` | [Core entities](02-core-entities.md) |
| Templates | a break template without a `.vpcf` particle system, any extra `melon_break_*` template | [Effect templates](03-effect-templates.md#break-burst) |
| Templates | a missing or duplicated `perfect_hit_particle_template` / `particle_health_template`, or one without a `.vpcf` | [Effect templates](03-effect-templates.md) |
| Templates | `particle_boost_trail_template` without exactly `boost_trail.vpcf` + `boost_trail_juice.vpcf` | [Effect templates](03-effect-templates.md#boost-trail) |
| Templates | two particle templates pointing at the same `info_particle_system` | [Effect templates](03-effect-templates.md) |

## In game

With `DEBUG` on (`src/melon_drive/core/debug.js`), the console logs every
touch the script accepts or ignores (`[melon_drive] checkpoint_1_2: …`).

| Symptom | Cause |
|---|---|
| no console line at all for a trigger | output missing or mistargeted, or filter/spawnflags keep the melon out |
| `[melon_drive] melon_teleport: …` (even with `DEBUG` off) | teleporter misnamed or destination missing at runtime |
| `no info_target "start_spawn_…"` | track has no [start spawn](04-tracks.md#start-line) |
| `no info_target "checkpoint_spawn_…"` | checkpoint has no [checkpoint spawn](04-tracks.md#checkpoints) |
| hub modal never closes | `hub_leave` missing on `hub_start_trigger` |

## Minimal map checklist

- [ ] `point_script` `gamemode` + `point_script` `melon_drive_script` ([core](02-core-entities.md))
- [ ] `custom_hud_layout` `speed_hud` (one)
- [ ] `point_template` `melon_template` with the melon `prop_physics`
- [ ] `hub_spawn` near the hub floor, `hub_start_trigger` with `hub_enter` + `hub_leave` ([hub](05-hub.md))
- [ ] per track ([tracks](04-tracks.md)): `start_<id>[_laps<M>]` firing `start_<id>` + `start_spawn_<id>`; `checkpoint_<id>_1` … `_<N>` each with `checkpoint_spawn_<id>_<n>`; a `finish_<id>` output
- [ ] optional: `intro_spawn`, `hub_spawn_facing`, [effect templates](03-effect-templates.md), [paint triggers](06-paint-triggers.md), [teleporters](07-teleporters.md), [kill triggers](08-kill-triggers.md), [zones](09-heal-zones.md), [jump pads](12-jump-pads.md)
- [ ] every melon trigger: `trigger_multiple`, "Physics Objects", filtered to `prop_physics`
- [ ] `npm test` passes

---
[← Jump pads](12-jump-pads.md) · [Mapping API](README.md)
