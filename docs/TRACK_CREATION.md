# Creating a Track (Hammer Guide)

This is a step-by-step guide for building a new race track in Hammer. It
covers only the Hammer-side setup (entities, names, I/O connections) — no
script changes are needed to add, remove, or resize a track. For the
*design* reasoning behind this system (why it works this way), see
[GAMEPLAY.md](../GAMEPLAY.md)'s "Hub → race → next-track flow" and "Multiple
tracks & checkpoints" sections. All script inputs below are handled in
[maps/scripts/melon_drive.js](../maps/scripts/melon_drive.js). For every other
entity the map uses (hub, spawns, paint triggers, teleporters, effects) and
the general conventions, see the [Mapping API](mapping-api/README.md).

## The core idea

A track's entire configuration — how many checkpoints it has, how many laps
win it, and where racers spawn — is read from **entity names and I/O
connections you set up in Hammer**. There is no separate config file and
nothing to touch in the script. Every track needs exactly three kinds of
trigger:

1. One **start trigger** (`start_<trackId>`, optionally `_laps<M>`) — the
   start line: marks the track's spawn point and its lap count.
2. One **checkpoint trigger per checkpoint** (`checkpoint_<trackId>_<index>`)
   along the way — the script counts them.
3. One **finish signal** (`finish_<trackId>`) — counts a completed lap.

A track can be a **loop** (start and finish on the same line, one or more
laps) or **point-to-point** (the finish is somewhere else, usually the
other end; one lap).

Tracks are numbered (`trackId`) starting at 1, and heats run in ascending
`trackId` order — track 1 first, then track 2, and so on, until the last
track sends everyone back to the hub. So the `trackId` you pick for a new
track also decides where it falls in that sequence.

## 1. The start trigger

**Quickest way: the start gate prefab.** Place
`maps/prefabs/start_gate.vmap` on the start line, select the placed
instance, open Map Variables and set the **Override** of `track` to this
track's trigger name (`start_2`, `start_1_laps3`, …). The prefab's trigger
already fires `start_line` (which reads the track from that name) and holds
a `start_spawn` the script finds next to it — nothing else to set. Details:
[Mapping API: start gate prefab](mapping-api/04-tracks.md#start-gate-prefab),
and [Prefabs](mapping-api/14-prefabs.md) for how map variables work.
The rest of this section is what the prefab contains, for building a start
by hand.

Place a `trigger_multiple` on the start line, plus an `info_target` just
behind it where racers line up when this track's heat begins:

```
trigger_multiple  start_<trackId>[_laps<M>]   e.g. start_1_laps3
info_target       start_spawn_<trackId>       e.g. start_spawn_1
```

The racers appear just above the floor below the `info_target`, facing its
yaw (turn it in Hammer; pitch/roll don't matter), side by side across that
direction, 120 units apart (`RACE_SPAWN_LATERAL_SPACING`) — make the start
wide enough (4 racers ≈ 360 units). A melon that breaks before checkpoint 1
respawns there too. Without `start_spawn_<trackId>` the `info_target` named
just `start_spawn` nearest to the trigger is used (within 1024 units — the
start gate prefab's), and without that the trigger's own origin and angles
— no floor trace, and Hammer doesn't always turn a brush entity's angles
along with its geometry, so an `info_target` is the reliable way.

Name the trigger:

```
start_<trackId>                  e.g. start_2        (1 lap)
start_<trackId>_laps<lapsToWin>  e.g. start_1_laps3  (3 laps)
```

- `trackId` — this track's number (1, 2, 3, …). Must be unique per track.
- `lapsToWin` — how many laps a racer must complete to finish this track's
  heat. Leave `_laps…` off for 1 lap (point-to-point tracks).

**Output** (always without the `_laps` part):

| Output | Target entity | Via this input | Parameter |
|---|---|---|---|
| `OnStartTouch` | the map's `point_script` entity | `RunScriptInput` | `start_<trackId>` |

Or the parameter `start_line` instead: same effect, but the track is read
from the trigger's own name, so the output is the same for every track.

Crossing it is what makes a kart "pick" this track (outside a heat; in a
heat, racers are put on their track the moment it starts) and makes the
start spawn (`start_spawn_<trackId>`, else the nearest `start_spawn`, else
the trigger) its respawn point until checkpoint 1.

## 2. Checkpoint triggers

**Quickest way: the checkpoint gate prefab.** Place
`maps/prefabs/checkpoint_gate.vmap` where racers should pass, select the
placed instance and set the **Override** of its map variable `checkpoint`
to this checkpoint's trigger name (`checkpoint_2_3`, …). Its trigger
already fires `checkpoint` and it holds a `checkpoint_spawn` the script
finds next to it. Details:
[Mapping API: checkpoint gate prefab](mapping-api/04-tracks.md#checkpoint-gate-prefab).
The rest of this section is what the prefab contains.

For each checkpoint after the start line (numbered 1 through N, in the order
racers should reach them), place a `trigger_multiple` where racers should
pass it, plus an `info_target` where a broken melon should respawn after
reaching this checkpoint:

```
trigger_multiple  checkpoint_<trackId>_<index>         e.g. checkpoint_1_3
info_target       checkpoint_spawn_<trackId>_<index>   e.g. checkpoint_spawn_1_3
```

**Every checkpoint trigger fires the same parameter, `checkpoint`** — the
script reads which checkpoint it is from the trigger's name, and counts a
track's checkpoints from these names (the highest index). Number them
without gaps; `npm test` fails on a misnamed checkpoint trigger or a gap.

The melon respawns just above the floor below the `info_target`, facing the
`info_target`'s yaw (turn it in Hammer; pitch/roll don't matter). It can sit
anywhere — in front of, behind or beside the trigger. Without
`checkpoint_spawn_<trackId>_<index>` the `info_target` named just
`checkpoint_spawn` nearest to the trigger is used (within 1024 units — the
gate prefab's), and without that the trigger's own position/angles.

**Outputs** (on each checkpoint trigger):

| Output | Target entity | Via this input | Parameter |
|---|---|---|---|
| `OnStartTouch` | the map's `point_script` entity | `RunScriptInput` | `checkpoint` |

Every checkpoint, e.g. track 1's 3rd (the trigger named `checkpoint_1_3`):

```
OnStartTouch → melon_drive_script → RunScriptInput → checkpoint
```

Checkpoints only count once the kart crossed this track's start line, one
at a time in order, and only ever move progress forward — touching an
earlier checkpoint again does nothing. A loop track needs at least one
checkpoint; a point-to-point track may have none.

**Filter every checkpoint trigger to `prop_physics`** (the melon prop), the
same way as all other race triggers in this map — a player's own pawn is
non-solid and held at its player spawn away from the tracks anyway, but the
filter keeps things unambiguous if that ever changes.

**Marking it for racers (optional):** a trigger itself is invisible, so to
show "you respawn from here", put a thin non-solid gate at the checkpoint
(e.g. a `func_brush`, Solidity "Never Solid") textured with
`materials/melon_racer/holo/holo_checkpoint.vmat`: gold/amber circular-arrow
respawn signs that drift sideways, with a bright band sweeping across them.
It's generated by `tools/make-holo.mjs` (`node tools/make-holo.mjs
holo_checkpoint`), the same way `holo_heal` marks heal gates.

## 3. The finish signal

**Quickest way: the finish gate prefab.** Place
`maps/prefabs/finish_gate.vmap` on the finish line and set the **Override**
of its `track` variable to `finish_<trackId>` (e.g. `finish_2`). On a loop
track place it on the start line, overlapping the start gate. Details:
[Mapping API: finish gate prefab](mapping-api/04-tracks.md#finish-gate-prefab).
The rest of this section is building a finish by hand.

Add one more Output, **`finish_<trackId>`**, that fires whenever a racer
crosses this track's finish line:

| Output | Target entity | Via this input | Parameter |
|---|---|---|---|
| `OnStartTouch` | the map's `point_script` entity | `RunScriptInput` | `finish_<trackId>` |

This is what actually counts a completed lap and, once the required number
of laps is reached, ends that racer's heat. It doesn't matter which trigger
fires it, only that *some* trigger on the finish line does:

- **Loop track** (start = finish line): add `finish_<trackId>` as a
  **second** Output on the **start trigger** from step 1. Whichever of the
  two outputs Hammer fires first, the lap counts exactly once.
- **Point-to-point track**: place its own `trigger_multiple` where the track
  ends (any name with `finish_<trackId>`; named `finish_<trackId>` with
  `finish_line`), filtered to `prop_physics` like the others, with just
  this one Output.

`finish_line` works like `start_line`: the track comes from the firing
trigger's name — `finish_<trackId>` at the end of a point-to-point track,
or the start trigger's own name on a loop.

A lap only counts if the racer already reached the last checkpoint since
their last lap started — crossing the finish line early (e.g. cutting the
course) is ignored, not counted.

## Filtering triggers to the melon

Every trigger above should only react to the melon prop, not anything else.
Set the trigger's activator filter (`filter_activator_class` pointing at a
filter entity configured for `prop_physics`, or an equivalent filter) so
only melons — never player pawns or other props — can fire it.

## Putting it together

**A loop track with 2 checkpoints and 3 laps (track 1):**

1. `trigger_multiple` **"start_1_laps3"** on the start/finish line, and an
   `info_target` **"start_spawn_1"** just behind it, facing down the track.
   Outputs on the trigger:
   - `OnStartTouch → melon_drive_script → RunScriptInput → start_1`
   - `OnStartTouch → melon_drive_script → RunScriptInput → finish_1`
2. `trigger_multiple` **"checkpoint_1_1"** partway round.
   Output: `OnStartTouch → melon_drive_script → RunScriptInput → checkpoint`
3. `trigger_multiple` **"checkpoint_1_2"** further round.
   Output: `OnStartTouch → melon_drive_script → RunScriptInput → checkpoint`

Driving flow: spawn on the line → `checkpoint_1_1` → `checkpoint_1_2` →
back across the start line → lap 1/3 done → repeat two more times → heat
ends once `lapsCompleted` reaches 3.

**A point-to-point track with 2 checkpoints (track 2):**

1. `trigger_multiple` **"start_2"** at the beginning, `info_target`
   **"start_spawn_2"** just behind it.
   Output: `OnStartTouch → melon_drive_script → RunScriptInput → start_2`
2. **"checkpoint_2_1"**, **"checkpoint_2_2"** along the way, as above.
3. A `trigger_multiple` at the end (e.g. **"finish_2"**).
   Output: `OnStartTouch → melon_drive_script → RunScriptInput → finish_2`

Driving flow: spawn at the start → `checkpoint_2_1` → `checkpoint_2_2` →
finish → done.

## Adding a second (or third, …) track

Just repeat the whole process above with the next `trackId`:

```
start_2[_laps<M>]
checkpoint_2_1 .. checkpoint_2_<N>
finish_2
```

No script changes, no registration step — the moment these entities exist
with the right names, the track is picked up automatically and slotted into
the race sequence after track 1 (by ascending `trackId`). There's room for
up to 8 tracks and 32 checkpoints per track (`MAX_TRACKS` /
`MAX_CHECKPOINTS_PER_TRACK` in `race/constants.js` — raise these constants
if you ever need more).

## Testing your track

Set `DEBUG = true` in `src/melon_drive/core/debug.js` (off by default) and
`npm run build` while testing a track: the script then logs every
start/checkpoint/finish touch and race-flow transition to the console
(`[melon_drive] ...`). While testing a new track, watch for lines like:

```
[melon_drive] GetTrackConfig: found track(s) {"1":{"checkpoints":2,"lapsToWin":3,...}}
[melon_drive] start_1: kart is now on track 1
[melon_drive] checkpoint_1_2: kart advanced to checkpoint 2 on track 1
[melon_drive] finish_1: lap 2/3 completed on track 1
[melon_drive] UpdateRaceFlow: heat on track 1 complete, break started
```

If a checkpoint or finish line doesn't seem to register when you drive
through it, the corresponding debug line simply won't appear — that means
the Output on that trigger is missing, mistargeted, or using the wrong
parameter name, not a script problem. Run `npm test` too: it checks the
.vmap for most naming/wiring mistakes.

## Checklist

- [ ] Start trigger named `start_<trackId>` or `start_<trackId>_laps<M>`,
      firing `start_line` (or `start_<trackId>`) — or a start gate prefab
      with its `track` override set.
- [ ] `info_target` `start_spawn_<trackId>` (or `start_spawn` right at the
      start trigger) behind the start line, facing down the track, with room
      for the racers side by side.
- [ ] One `checkpoint_<trackId>_<index>` trigger per checkpoint, `1..N`, each
      firing `checkpoint`.
- [ ] A `finish_<trackId>` output — on the start trigger (loop) or on a
      trigger at the end (point-to-point).
- [ ] Every trigger above filtered to `prop_physics`.
- [ ] `npm test` passes.
- [ ] Tested in-game with the console open, watching for the debug lines
      above.
