[Mapping API](README.md) › **14. Prefabs** · [← Water zones](13-water-zones.md) · [Checking your map →](15-checking.md)

# 14. Prefabs

The map is built from prefabs in `maps/prefabs/`, placed in
`maps/melon_racer.vmap` (and in each other). Hammer keeps a prefab's
entities in its own `.vmap` and only merges them into the map when it
compiles, **with their names unchanged** — so every rule in this Mapping
API applies inside a prefab exactly as it does in the main map. The script
never knows whether an entity came from a prefab.

## The prefabs

| Prefab | Placed in | What's in it | Set per copy |
|---|---|---|---|
| `hub.vmap` | `melon_racer.vmap` | the hub: `hub_start_trigger` (`hub_enter`/`hub_leave`), `hub_spawn`, the teleporters into the tutorial sections | — |
| `podium.vmap` | `melon_racer.vmap` | the hub's [podium](05-hub.md#podium): `podium_spawn_1` … `_3` and the [confetti](05-hub.md#confetti) `particle_podium_confetti` | — |
| `route_canals.vmap` | `melon_racer.vmap` | track 1 with its checkpoints, zones and gates | — |
| `route_bridge.vmap` | `melon_racer.vmap` | track 2 with its checkpoints, zones and gates | — |
| `route_side_slice.vmap` | `melon_racer.vmap` | track 3, a 2D section: `start_3`, `start_spawn`, `finish_3` (built in, not gate prefabs) and two [side-view zones](11-camera-zones.md#side-view-zones) | — |
| `route_tutorial.vmap` | `melon_racer.vmap` | the tutorial area: [`intro_spawn`](02-core-entities.md#spawn-points), [paint triggers](06-paint-triggers.md), [lift zones](10-lift-zones.md), a [camera zone](11-camera-zones.md), water, the [checkpoint teleporters](07-teleporters.md#name-variants) and the [`hub_teleport`](05-hub.md#sending-melons-to-the-hub) back to the hub | — |
| `start_gate.vmap` | a route | a track's [start line](#start-gate): start trigger, `start_spawn`, full-heal zone | `track` = `start_<trackId>[_laps<M>]` |
| `checkpoint_gate.vmap` | a route | a [checkpoint](#checkpoint-gate): checkpoint trigger, `checkpoint_spawn` | `checkpoint` = `checkpoint_<trackId>_<index>` |
| `jump_pad.vmap` | a route | a [jump pad](#jump-pad): pad trigger (`jump_pad_enter`/`jump_pad_leave`) and its two marker particle systems | `jump_pad_high_far` = `jump_pad_<up>[_<forward>]` (optional) |
| `finish_gate.vmap` | a route | a track's [finish line](#finish-gate): finish trigger | `track` = `finish_<trackId>` |
| `heal_gate.vmap` | a route | a [full-heal](09-heal-zones.md#full-heal-zone) gate: `heal_zone_full` (`heal_enter`/`heal_leave`) | — |
| `obstacle_mover.vmap` | a route | an [obstacle mover](#obstacle-mover): a [mover](16-movers.md) and a [kill trigger](08-kill-triggers.md#kill-trigger) riding along on it | `Mover Name` = `mover_<anything>`, plus direction, distance, speed, kill on/off |
| `refill_jumps.vmap` | — (not placed yet) | a [jump recharge zone](#refill-jumps): trigger (`jump_recharge_enter`/`jump_recharge_leave`) and its marker particles | — |

A route prefab's **file name is the route's name** in the hub window's heat
cards (`route_side_slice.vmap` → "SIDE SLICE"), and a keyword in it picks
the card's icon (aqueduct, truss bridge, melon wedge; a checkered flag for any
other — `ROUTE_ICONS` in the tool). Both are generated: after adding or
renaming a route, run `node tools/make-route-icons.mjs` (`npm test` fails
on a track without them).

A route prefab holds one whole track, so it's placed **once**: the track
ids are in its gates' overrides (and in any checkpoint placed without the
gate).

## Map variables

A prefab is set up per copy through **map variables**: a variable defined
in the prefab, bound to an entity property inside it, and given its own
value on each placed copy. The gates use one to name their trigger.

**Inside the prefab** (open its `.vmap`):

1. Prefab Properties → **Map Variables** → **Add Variable**. For an entity
   name the type must be **`target_source`** — a `string` variable can't be
   bound to a Name ("The variable … has the wrong type").
2. Select the entity, click the small icon next to the property (e.g.
   **Name**) and pick the variable. The field turns orange; the variable
   panel now shows "1 references".
3. Select the variable: **Value** under Variable Properties is its default.

**On each copy** (in the map that places it): select the prefab instance —
don't step into it — and set the variable's **Override** under Map
Variables. The override is saved in *that* map: a gate's override lives in
its route's `.vmap`.

A variable replaces the property's **whole value**, and an output's
parameter can't take one. That's why the gates fire the generic
`start_line`/`checkpoint`/`finish_line`, which read the track (and
checkpoint) from the trigger's own name, instead of a numbered
`start_<trackId>`.

**Every gate copy needs its override.** The gates' defaults are
deliberately no track (`start_unset`, `checkpoint_trackid_checkpoint`,
`finish_unset`): a copy left on the default fails `npm test` (its
`start_line`/`checkpoint`/`finish_line` names no track) and logs in
game, instead of quietly joining some track. Hammer also doesn't keep an
override that equals the default — another reason the default is never a
real value. A set override shows the variable's label in color.

## Start gate

| Inside `start_gate.vmap` | Set to |
|---|---|
| start trigger's **Name** | bound to `track` (`target_source`) |
| its output | `OnStartTouch` → `start_line` |
| `info_target` | `start_spawn` — the shared start spawn the script finds next to the trigger |
| `trigger_multiple` | `heal_zone_full` — every start is a full-heal zone |

Override `track` with the start trigger's name: `start_2`, `start_1_laps3`,
… Details on the start line, `start_line` and the shared `start_spawn`:
[Tracks: start gate prefab](04-tracks.md#start-gate-prefab).

## Checkpoint gate

| Inside `checkpoint_gate.vmap` | Set to |
|---|---|
| checkpoint trigger's **Name** | bound to `checkpoint` (`target_source`), default `checkpoint_trackid_checkpoint` |
| its output | `OnStartTouch` → `checkpoint` |
| `info_target` | `checkpoint_spawn` — the shared checkpoint spawn the script finds next to the trigger |

Override `checkpoint` with the trigger's name: `checkpoint_2_3`, … Details:
[Tracks: checkpoint gate prefab](04-tracks.md#checkpoint-gate-prefab).

## Jump pad

| Inside `jump_pad.vmap` | Set to |
|---|---|
| pad trigger's **Name** | bound to `jump_pad_high_far` (`target_source`), default `jump_pad_1000_1000` |
| its outputs | `OnStartTouch` → `jump_pad_enter`, `OnEndTouch` → `jump_pad_leave` |
| `info_particle_system` × 2 | `particles/melon_racer/jump_pad_rings.vpcf` and `jump_pad_sparks.vpcf`, Start Active — the pad's marker |

Unlike the gates, the override is **optional**: the default is a real pad
(1000 u/s up, +1000 u/s forward), so a copy left on it works. Override
`jump_pad_high_far` for another launch, e.g. `jump_pad_1200_500` — the name
variants are in [Jump pads](12-jump-pads.md#name-variants-and-launch-height).
Jump pads may repeat, so the prefab can be placed any number of times.

## Finish gate

| Inside `finish_gate.vmap` | Set to |
|---|---|
| finish trigger's **Name** | bound to `track` (`target_source`) |
| its output | `OnStartTouch` → `finish_line` |

Override `track` with `finish_<trackId>`, e.g. `finish_2`. On a loop track
place a finish gate on the start line, overlapping the start gate. Never add
`finish_line` to the start gate itself — see
[Tracks: finish gate prefab](04-tracks.md#finish-gate-prefab).

## Obstacle mover

| Inside `obstacle_mover.vmap` | Set to |
|---|---|
| `func_movelinear` | a [mover](16-movers.md): **Name**, **Move Direction**, **Move Distance** and **Speed** bound to the variables below |
| `trigger_multiple` `melon_killer` | a [kill trigger](08-kill-triggers.md#kill-trigger): `OnStartTouch` → `melon_break`, **Parent** bound to `Mover Name` (so it moves along), **Start Disabled** bound to `Disable Melon Break` |

| Variable | Default | Override with |
|---|---|---|
| `Mover Name` | `mover_<uniqe_name>` | the mover's name: `mover_<anything>` or `mover_wait<seconds>[_<anything>]` ([Movers](16-movers.md)) — **one name per copy**, see below |
| `movdir` | — | the direction it goes from its start |
| `Moving Distance` | `220` | how far it goes, in units |
| `Moving Speed` | `100` | units/sec |
| `Disable Melon Break` | `0` | `1`: touching it doesn't break the melon (it's still a wall and hits as an impact) |

Movers may share a name, but this prefab's kill trigger finds its mover
**by name** (its Parent): two copies with the same `Mover Name` can leave
a kill trigger riding on the other copy's mover. Give every copy its own.

## Refill jumps

| Inside `refill_jumps.vmap` | Set to |
|---|---|
| `trigger_multiple` | a [jump recharge zone](17-jump-recharge-zones.md): `OnStartTouch` → `jump_recharge_enter`, `OnEndTouch` → `jump_recharge_leave` |
| `info_particle_system` | `particles/melon_racer/jump_recharge_rings.vpcf`, Start Active — the zone's marker |

Nothing to set per copy; place it as often as needed.

## Rules

- **"Fix Up Entity Names" stays off** on every placed prefab. With it on,
  Hammer prefixes every entity name inside with the instance's name — the
  script no longer finds `start_2`, `start_spawn`, `hub_start_trigger`, …
  and the triggers do nothing in-game.
- **Names that must be unique stay in prefabs placed once**: `hub_spawn`,
  `hub_start_trigger`, `intro_spawn`, a track's `start_<trackId>`/`checkpoint_<trackId>_<index>`.
  Names that may repeat (`heal_zone_full`, `start_spawn`,
  `checkpoint_spawn`, `jump_pad_*`, zone triggers) can go into prefabs
  placed many times.
- **Gates stay apart**: the shared `start_spawn` / `checkpoint_spawn` is
  matched to the start / checkpoint trigger it's nearest to, within
  `START_SPAWN_SHARED_MAX_DISTANCE` / `CHECKPOINT_SPAWN_SHARED_MAX_DISTANCE`
  (1024 units each) — keep each gate's spawn nearer to its own trigger than
  to the next gate's.
- **Save the prefab's `.vmap`** after editing it — `npm test` reads the
  prefab files, not what's open in Hammer.

## Checked by `npm test`

`test/helpers/vmap.mjs` reads every placed prefab (nested ones too, a prefab
placed twice twice) with its map variables resolved the way Hammer compiles
them — the copy's override, else the default — so every check in
[Checking your map](15-checking.md) covers the entities inside prefabs.

| Mistake | |
|---|---|
| a placed prefab with "Fix Up Entity Names" ticked | ✗ |
| two start triggers for one track (e.g. two gate copies with the same override) | ✗ |
| `start_line`/`checkpoint`/`finish_line` from a trigger whose name names no track (e.g. a gate copy without its override) | ✗ |

---
[← Water zones](13-water-zones.md) · [Mapping API](README.md) · [Checking your map →](15-checking.md)
