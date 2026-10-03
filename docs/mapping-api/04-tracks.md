[Mapping API](README.md) › **4. Tracks** · [← Effect templates](03-effect-templates.md) · [Hub →](05-hub.md)

# 4. Tracks

A track is a **start line → checkpoints → finish line**, all numbered by
`trackId` (1 … `MAX_TRACKS` = 8). Heats run in ascending `trackId` order.
Step-by-step build guide: [TRACK_CREATION.md](../TRACK_CREATION.md).

| Shape | Layout | Laps |
|---|---|---|
| **Loop** | `[start_1_laps3 + finish_1]` → `checkpoint_1_1` → … → `checkpoint_1_N` → back to the start line | any; needs ≥ 1 checkpoint |
| **Point-to-point** | `[start_2]` → `checkpoint_2_1` → … → `checkpoint_2_N` → `[finish_2]` | 1; may have 0 checkpoints |

## Entities per track

| Entity | Class | Name | Count | Output → parameter |
|---|---|---|---|---|
| Start trigger | `trigger_multiple` | `start_<trackId>` or `start_<trackId>_laps<M>` | exactly 1 | `OnStartTouch` → `start_line` (or `start_<trackId>`, always without `_laps`) |
| Start spawn | `info_target` | `start_spawn_<trackId>`, or `start_spawn` next to the start trigger | 1 (recommended) | — |
| Checkpoint trigger | `trigger_multiple` | `checkpoint_<trackId>_<index>` | 0 … 32 | `OnStartTouch` → `checkpoint_<trackId>_<index>` (same as its name) |
| Checkpoint spawn | `info_target` | `checkpoint_spawn_<trackId>_<index>` | 1 per checkpoint (recommended) | — |
| Finish | any trigger on the finish line | any; `finish_<trackId>` for `finish_line` | 1 | `OnStartTouch` → `finish_<trackId>` or `finish_line` |

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `MAX_TRACKS` | 8 | highest `trackId` | `race/constants.js` |
| `MAX_CHECKPOINTS_PER_TRACK` | 32 | highest checkpoint `index` | `race/constants.js` |
| `DEFAULT_LAPS_TO_WIN` | 1 | laps without `_laps<M>` | `race/constants.js` |
| `RACE_SPAWN_LATERAL_SPACING` | 120 units | gap between racers lined up at the start spawn | `race/constants.js` |
| `START_SPAWN_SHARED_MAX_DISTANCE` | 1024 units | how far a shared-name `start_spawn` may be from its start trigger | `race/constants.js` |
| `COUNTDOWN_SECONDS` | 3 s | countdown before GO | `race/constants.js` |
| `BREAK_SECONDS` | 10 s | pause after a heat before the next track / hub | `race/constants.js` |

## Start line

| Name | Pattern | Example | Meaning |
|---|---|---|---|
| trigger | `^start_(\d+)(?:_laps(\d+))?$` | `start_1`, `start_1_laps3` | track 1; 1 lap / 3 laps |
| spawn | `^start_spawn_(\d+)$` | `start_spawn_1` | where track 1's racers line up |
| shared spawn | `start_spawn` | `start_spawn` | the start spawn of whichever start trigger it's nearest to |

- Parsed once at map start from every `trigger_multiple`. Only this trigger
  may fire `start_<trackId>` or `start_line` (`npm test` checks it), and
  only one trigger per track may carry the name.
- **`start_line`** — the generic form of the output: the script takes the
  track from the name of the trigger that fired it (`start_2_laps3` →
  track 2). Same effect as `start_2`, but the output never changes from
  track to track — see [Start gate prefab](#start-gate-prefab).
- **Start spawn:** when a heat starts, racers are teleported
  `SPAWN_UP_OFFSET` above the floor under `start_spawn_<trackId>`, facing
  its yaw, lined up side by side across that direction,
  `RACE_SPAWN_LATERAL_SPACING` apart, centered on it — 4 racers need ~360
  units of width. Place it just behind the start line, facing down the
  track. Outside a heat it's the melon's respawn point until checkpoint 1.
- **Shared-name start spawn:** without a `start_spawn_<trackId>`, the
  `info_target` named just `start_spawn` that's nearest to the start
  trigger is used — if it's within `START_SPAWN_SHARED_MAX_DISTANCE`. Every
  copy of a start gate prefab carries its own; keep two gates further apart
  than each gate's spawn is from its own trigger.
- **Without a start spawn:** the start trigger's own origin (lifted
  `TELEPORT_UP_OFFSET`, no floor trace) and yaw are used, and the heat logs
  `no info_target "start_spawn_…"`.
- Crossing the trigger puts a free-roaming melon on that track and starts
  its [time trial](../../GAMEPLAY.md#time-trial-decided-implemented).
- A track without a start trigger doesn't exist for the race flow (the HUD
  shows "?").

## Start gate prefab

`maps/prefabs/start_gate.vmap` is a whole start line — trigger, spawn and
outputs — that's set to a track by a single value:

| Inside the prefab | Set to |
|---|---|
| start trigger's **Name** | bound to the prefab variable `track` (type `target_source`, default `start_1`) |
| its output | `OnStartTouch` → `start_line` |
| `info_target` | `start_spawn` (shared name) |

Per placed copy: select the prefab instance (not inside it) → Map
Variables → **Override** `track` = the trigger name, e.g. `start_2` or
`start_3_laps2`. Don't add `finish_line` to the start gate: the same gate
starts point-to-point tracks too, and on one without checkpoints that would
finish the run at the start line. A copy left on the default `start_1` next
to another `start_1` fails `npm test` (two start triggers for one track).

## Finish gate prefab

`maps/prefabs/finish_gate.vmap`, the same idea for the finish line:

| Inside the prefab | Set to |
|---|---|
| finish trigger's **Name** | bound to the prefab variable `track` (type `target_source`, default `finish_1`) |
| its output | `OnStartTouch` → `finish_line` |

Per placed copy: **Override** `track` = `finish_<trackId>`, e.g. `finish_2`.
On a loop track place one right on the start line, overlapping the start
gate — whichever of the two triggers fires first, the lap counts exactly
once (as with both outputs on one trigger).

## Checkpoints

| Name | Pattern | Example | Meaning |
|---|---|---|---|
| trigger | `^checkpoint_(\d+)_(\d+)$` | `checkpoint_1_3` | track 1, 3rd checkpoint after the start line |
| spawn | `^checkpoint_spawn_(\d+)_(\d+)$` | `checkpoint_spawn_1_3` | respawn spot once `checkpoint_1_3` is reached |

- **The name must equal the parameter** — the script counts a track's
  checkpoints from the trigger names (the highest index), since it can't see
  which parameter an output fires.
- **No gaps:** `index` = 1 … N in driving order. With `_1`, `_2`, `_4` the
  track needs 4 and the finish is never reached.
- Checkpoints only count once the melon crossed the track's start line, and
  strictly in order (skipping one doesn't count). Progress never goes
  backwards.
- **Checkpoint spawn:** a broken melon respawns `SPAWN_UP_OFFSET` above the
  floor under it, facing its yaw. Without one, the trigger's own transform
  (lifted `TELEPORT_UP_OFFSET`) is used and the touch logs
  `no info_target "checkpoint_spawn_…"`.

## Finish line

```
OnStartTouch → melon_drive_script → RunScriptInput → finish_<trackId>
```

| Track shape | Where the output goes |
|---|---|
| Loop | a **second output on the `start_<trackId>` trigger** — whichever of the two Hammer fires first, the lap counts exactly once |
| Point-to-point | its own trigger where the track ends (any name) |

| Name | Pattern | Example | Meaning |
|---|---|---|---|
| finish trigger | `^finish_(\d+)$` | `finish_2` | track 2's finish, read by `finish_line` |

- **`finish_line`** — the generic form: the track comes from the firing
  trigger's name, `finish_<trackId>` or (loop) the start trigger's
  `start_<trackId>[_laps<M>]`. For a finish gate prefab whose trigger name
  is a prefab variable — see [Finish gate prefab](#finish-gate-prefab).
- Counts a lap only if the melon has reached the track's last checkpoint
  since the lap started; the last lap (`_laps<M>`) finishes the melon.
- Only the melon is read, not which trigger fired it.

## Checked by `npm test`

| Mistake | |
|---|---|
| `start_<t>` fired by a trigger not named `start_<t>[_laps<M>]`, or a `start_*` trigger without it (or `start_line`) | ✗ |
| `start_line` from a trigger not named `start_<t>[_laps<M>]`, `finish_line` from one not named `finish_<t>` or `start_<t>[_laps<M>]` | ✗ |
| two start triggers for the same track (e.g. a start gate copy left on its default) | ✗ |
| `start_spawn_<t>` without a `start_<t>` trigger, or any other `start_*` name (typo) | ✗ |
| checkpoint trigger named differently from the parameter it fires | ✗ |
| gap in a track's checkpoint numbers | ✗ |
| `checkpoint_spawn_<t>_<i>` whose checkpoint no trigger fires | ✗ |

---
[← Effect templates](03-effect-templates.md) · [Mapping API](README.md) · [Hub →](05-hub.md)
