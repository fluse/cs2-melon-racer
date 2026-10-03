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
| `route_canals.vmap` | `melon_racer.vmap` | track 1 with its checkpoints, zones and gates | — |
| `route_bridge.vmap` | `melon_racer.vmap` | track 2 with its checkpoints, zones and gates | — |
| `start_gate.vmap` | a route | a track's [start line](#start-gate): start trigger, `start_spawn`, full-heal zone | `track` = `start_<trackId>[_laps<M>]` |
| `finish_gate.vmap` | a route | a track's [finish line](#finish-gate): finish trigger | `track` = `finish_<trackId>` |
| `heal_gate.vmap` | a route | a [full-heal](09-heal-zones.md#full-heal-zone) gate: `heal_zone_full` (`heal_enter`/`heal_leave`) | — |

A route prefab holds one whole track, so it's placed **once**: the track
ids are in its checkpoint names and its gates' overrides.

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
`start_line`/`finish_line`, which read the track from the trigger's own
name, instead of a numbered `start_<trackId>`.

**Always set the override**, even where the default happens to be right:
a copy without one follows the prefab's default, so changing the default
later silently moves that copy to another track.

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

## Finish gate

| Inside `finish_gate.vmap` | Set to |
|---|---|
| finish trigger's **Name** | bound to `track` (`target_source`) |
| its output | `OnStartTouch` → `finish_line` |

Override `track` with `finish_<trackId>`, e.g. `finish_2`. On a loop track
place a finish gate on the start line, overlapping the start gate. Never add
`finish_line` to the start gate itself — see
[Tracks: finish gate prefab](04-tracks.md#finish-gate-prefab).

## Rules

- **"Fix Up Entity Names" stays off** on every placed prefab. With it on,
  Hammer prefixes every entity name inside with the instance's name — the
  script no longer finds `start_2`, `start_spawn`, `hub_start_trigger`, …
  and the triggers do nothing in-game.
- **Names that must be unique stay in prefabs placed once**: `hub_spawn`,
  `hub_start_trigger`, a track's `start_<trackId>`/`checkpoint_<trackId>_<index>`.
  Names that may repeat (`heal_zone_full`, `start_spawn`, zone triggers)
  can go into prefabs placed many times.
- **Gates of different tracks stay apart**: the shared `start_spawn` is
  matched to the start trigger it's nearest to, within
  `START_SPAWN_SHARED_MAX_DISTANCE` (1024 units).
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
| two start triggers for one track (e.g. a gate copy without its override) | ✗ |
| `start_line`/`finish_line` from a trigger whose name names no track | ✗ |

---
[← Water zones](13-water-zones.md) · [Mapping API](README.md) · [Checking your map →](15-checking.md)
