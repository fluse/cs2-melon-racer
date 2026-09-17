# Creating a Track (Hammer Guide)

This is a step-by-step guide for building a new race track in Hammer. It
covers only the Hammer-side setup (entities, names, I/O connections) — no
script changes are needed to add, remove, or resize a track. For the
*design* reasoning behind this system (why it works this way), see
[GAMEPLAY.md](GAMEPLAY.md)'s "Hub → race → next-track flow" and "Multiple
tracks & checkpoints" sections. All script inputs below are handled in
[maps/scripts/melon_drive.js](maps/scripts/melon_drive.js).

## The core idea

A track's entire configuration — how many checkpoints it has, how many laps
win it, and where racers spawn — is read from **entity names and I/O
connections you set up in Hammer**. There is no separate config file and
nothing to touch in the script. Every track needs exactly three kinds of
trigger:

1. One **start trigger** (`track_start_...`) — marks the track's spawn point
   and encodes checkpoint/lap count in its name.
2. One **checkpoint trigger per checkpoint** (`checkpoint_<trackId>_<index>`).
3. One **finish signal** (`finish_<trackId>`) — counts a completed lap.

Tracks are numbered (`trackId`) starting at 1, and heats run in ascending
`trackId` order — track 1 first, then track 2, and so on, until the last
track sends everyone back to the hub. So the `trackId` you pick for a new
track also decides where it falls in that sequence.

## 1. The start trigger

Place a `trigger_multiple` at the spot racers should spawn/teleport to when
this track's heat begins. Its own transform (position **and** facing angle)
is used directly for that teleport, so orient it facing down the track.

Name it:

```
track_start_<trackId>_cp<checkpointCount>_laps<lapsToWin>
```

- `trackId` — this track's number (1, 2, 3, …). Must be unique per track.
- `checkpointCount` — how many `checkpoint_<trackId>_N` triggers this track
  will have (see below).
- `lapsToWin` — how many laps a racer must complete to finish this track's
  heat.

Example: a track with 8 checkpoints that takes 3 laps to win, as track 1:

```
track_start_1_cp8_laps3
```

This trigger does **not** need any Outputs wired at all — the script finds
it purely by parsing its name once at map start. (You *can* also use it to
carry the finish signal — see step 3.)

## 2. Checkpoint triggers

For each checkpoint along the track (numbered 1 through `checkpointCount`,
in the order racers should reach them), place a `trigger_multiple`
positioned/angled at the spot a broken melon should respawn facing if it
breaks after reaching this checkpoint.

**Outputs** (on each checkpoint trigger):

| Output | Target entity | Via this input | Parameter |
|---|---|---|---|
| `OnStartTouch` | the map's `point_script` entity | `RunScriptInput` | `checkpoint_<trackId>_<index>` |

Example for track 1's 3rd checkpoint:

```
OnStartTouch → melon_drive_script → RunScriptInput → checkpoint_1_3
```

Checkpoint `_1` is special: touching it is what makes a kart "pick" this
track in the first place (this is also what happens automatically the
instant a heat starts — racers spawn right on top of it). Checkpoints past
`_1` only count while the kart is already on that same track, and only ever
move progress forward — touching an earlier checkpoint again does nothing.

**Filter every checkpoint trigger to `prop_physics`** (the melon prop), the
same way as all other race triggers in this map — a player's own pawn is
parked far overhead and can't reach ground-level triggers anyway, but the
filter keeps things unambiguous if that ever changes.

## 3. The finish signal

Add one more Output, **`finish_<trackId>`**, that fires whenever a racer
crosses this track's finish line:

| Output | Target entity | Via this input | Parameter |
|---|---|---|---|
| `OnStartTouch` | the map's `point_script` entity | `RunScriptInput` | `finish_<trackId>` |

This is what actually counts a completed lap and, once the required number
of laps is reached, ends that racer's heat. It's a script input in its own
right — it doesn't matter which trigger fires it, only that *some* trigger
on the finish line does. In practice you have two options:

- **Start/finish line are the same spot** (the common case): add the
  `finish_<trackId>` output as a **second** Output on the **start trigger**
  from step 1, or on the `checkpoint_<trackId>_1` trigger from step 2 —
  whichever one physically sits on that line. Either works; it makes no
  difference which entity fires it or in what order, if both outputs happen
  to live on the same trigger.
- **Separate finish line**: place its own `trigger_multiple` wherever the
  track actually ends, filtered to `prop_physics` like the others, with just
  this one Output.

A lap only counts if the racer already reached checkpoint `checkpointCount`
(the last one) since their last lap started — crossing the finish line
early (e.g. cutting the course) is ignored, not counted.

## Filtering triggers to the melon

Every trigger above should only react to the melon prop, not anything else.
Set the trigger's activator filter (`filter_activator_class` pointing at a
filter entity configured for `prop_physics`, or an equivalent filter) so
only melons — never player pawns or other props — can fire it.

## Putting it together: a minimal 2-checkpoint, 3-lap track

1. `trigger_multiple` **"track_start_1_cp2_laps3"** at the spawn point,
   facing down the track. No Outputs required (or see the finish-signal
   shortcut below).
2. `trigger_multiple` **"checkpoint_1_1"** at the start/finish line.
   Outputs:
   - `OnStartTouch → point_script → RunScriptInput → checkpoint_1_1`
   - `OnStartTouch → point_script → RunScriptInput → finish_1` (the
     finish signal — start and finish share this same line here)
3. `trigger_multiple` **"checkpoint_1_2"** at the far end of the loop.
   Output: `OnStartTouch → point_script → RunScriptInput → checkpoint_1_2`

Driving flow: spawn on the line → touch `checkpoint_1_1` (picks track 1) →
drive to `checkpoint_1_2` → loop back and touch `checkpoint_1_1`/`finish_1`
again → lap 1/3 done → repeat two more times → heat ends once
`lapsCompleted` reaches 3.

## Adding a second (or third, …) track

Just repeat the whole process above with the next `trackId`:

```
track_start_2_cp<N>_laps<M>
checkpoint_2_1 .. checkpoint_2_<N>
finish_2
```

No script changes, no registration step — the moment these entities exist
with the right names, the track is picked up automatically and slotted into
the race sequence after track 1 (by ascending `trackId`). There's room for
up to 8 tracks and 32 checkpoints per track (`MAX_TRACKS` /
`MAX_CHECKPOINTS_PER_TRACK` in `melon_drive.js` — raise these constants if
you ever need more).

## Testing your track

`melon_drive.js` currently runs with `DEBUG = true`, which logs every
checkpoint/finish touch and race-flow transition to the console
(`[melon_drive] ...`). While testing a new track, watch for lines like:

```
[melon_drive] checkpoint_1_2: kart advanced to checkpoint 2 on track 1
[melon_drive] finish_1: lap 2/3 completed on track 1
[melon_drive] UpdateRaceFlow: heat on track 1 complete, break started
```

If a checkpoint or finish line doesn't seem to register when you drive
through it, the corresponding debug line simply won't appear — that means
the Output on that trigger is missing, mistargeted, or using the wrong
parameter name, not a script problem.

## Checklist

- [ ] Start trigger named `track_start_<trackId>_cp<N>_laps<M>`, positioned
      and facing correctly.
- [ ] One `checkpoint_<trackId>_<index>` trigger per checkpoint, `1..N`, each
      firing `RunScriptInput` with that exact parameter.
- [ ] A `finish_<trackId>` output wired somewhere on the finish line.
- [ ] Every trigger above filtered to `prop_physics`.
- [ ] Tested in-game with the console open, watching for the debug lines
      above.
