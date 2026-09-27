# Melon Racer — Mapping API

The complete contract between the map (Hammer) and the gameplay script
(`melon_drive`): every entity name the script looks up, every name pattern
it parses, and every `RunScriptInput` parameter it accepts. If it isn't in
this file, the script doesn't know about it.

- For a step-by-step walkthrough of building a track, see
  [TRACK_CREATION.md](TRACK_CREATION.md).
- For *why* things behave the way they do, see [GAMEPLAY.md](GAMEPLAY.md).
- All names below are defined in
  [src/melon_drive/constants.js](src/melon_drive/constants.js);
  `test/mapping-api-doc.test.mjs` fails if one is missing from this file.

## 1. General conventions

These apply to everything below unless a section says otherwise.

1. **The name is the config.** Track sizes, lap counts, paint colors and
   teleport destinations are encoded in entity names and parsed by the
   script. Adding, removing or changing one of these is a pure Hammer edit —
   no script change, no rebuild.
2. **Names are exact.** Lower case, `_` as separator, case-sensitive, no
   leading/trailing spaces (Hammer silently keeps a stray trailing space —
   `npm test` catches it).
3. **Everything the melon touches is a `trigger_multiple`** with:
   - spawnflag **"Physics Objects"** ticked (the melon is a `prop_physics`;
     without it the trigger never fires for it), and
   - a filter to `prop_physics` (e.g. `filter_activator_class`), so player
     pawns and other entities can't fire it.
4. **Every output goes to the same place:**

   ```
   <Output> → melon_drive_script → RunScriptInput → <parameter>
   ```

   `melon_drive_script` is the `point_script` entity running
   `maps/scripts/melon_drive.vjs`. The parameter selects the handler
   (section 4). The script reads *who* touched (the activator — must be a
   player's melon, anything else is ignored) and, for some inputs, *which
   trigger* fired it (the caller — its name and transform).
5. **Transforms are used directly.** Where a trigger or point entity marks a
   spawn/respawn spot, its origin is the position and its yaw is the facing
   direction (pitch/roll are ignored). The melon is always placed a bit
   above that point (`TELEPORT_UP_OFFSET` = 40 units for triggers and
   teleport destinations, `SPAWN_UP_OFFSET` above the traced floor for spawn
   entities), so it's fine — even recommended — to sink trigger brushes into
   the floor.
6. **Keep triggers thick.** Melons can go well above `MAX_SPEED` after wall
   bounces; a thin trigger can be tunneled through in one tick.
7. **Prefixes are reserved.** Don't give unrelated entities names starting
   with `track_start_`, `checkpoint_`, `paint_trigger_`, `teleport_to_`,
   `melon_break` or `hub_` — the script or tests may pick them up.

## 2. Required core entities

The map doesn't work without these. Exactly one of each.

| Name | Class | Setup |
|---|---|---|
| `gamemode` | `point_script` | `cs_script` = `maps/scripts/gamemode.vjs` (cvars, teams, no combat). The name isn't looked up; it's just the convention. |
| `melon_drive_script` | `point_script` | `cs_script` = `maps/scripts/melon_drive.vjs`. **Target of every output in this file.** |
| `speed_hud` | `custom_hud_layout` | `layout` = `panorama/layout/custom_game/speedometer.vxml`. The whole HUD (speedometer, countdown, hub modal, user menu). |
| `melon_template` | `point_template` | Template01 = a `prop_physics` with the melon model. Spawned once per player. Where it sits doesn't matter — the spawned melon is moved into place. |
| `hub_spawn` | `info_player_start` (any named point entity works) | Where melons go when returning to the hub (heat over, abort, menu button, `hub_teleport`). No fallback — without it melons have nowhere to go. |
| `hub_start_trigger` | `trigger_multiple` | The hub's start area. `OnStartTouch → hub_enter`, `OnEndTouch → hub_leave`. See 4.3. |

## 3. Optional entities

The script works without these, with the fallback shown.

| Name | Class | Purpose | Without it |
|---|---|---|---|
| `intro_spawn` | `info_player_start` | A player's very first melon (tutorial area); also the "Go to Tutorial" menu target. | `hub_spawn` is used. |
| `hub_spawn_facing` | `info_target` | Only its angle counts: which way a melon at `hub_spawn` faces. | `hub_spawn`'s own angle. |
| `melon_break_template` | `point_template` | Main break burst: an `info_particle_system` with a `.vpcf` effect. Moved onto the crash site and started. | No burst on break. |
| `melon_break_chunks_template` | `point_template` | Chunk flecks: an `info_particle_system`, plus up to 9 `prop_physics` break pieces (`models/cs_italy/italy_food_melon/italy_food_melon/piece.vmdl`, `piece1.vmdl` … `piece8.vmdl`) arranged roughly melon-shaped. Pieces are tinted, flung outward and left lying for a while. | No chunks on break. |
| `particle_perfect_spark` | `info_particle_system` (a plain entity, **not** inside a template) | Moved onto the melon and restarted on every PERFECT wall bounce. | No spark. |
| `prediction_dot_template` | `point_template` | Only used when `PREDICTION_RENDER_MODE = "dots"` (default is `"debug"`): one small dot entity, e.g. a "Never Solid" `func_brush`. | Falls back to the debug line. |

There are exactly **two** break templates — don't add other
`melon_break_*` templates; put extra pieces into the chunks template.

## 4. Script inputs (`RunScriptInput` parameters)

All fired as `OnStartTouch` (unless noted) on a `trigger_multiple` that
follows the general conventions in section 1.

| Parameter | Fired by | Reads from the trigger | Effect |
|---|---|---|---|
| `checkpoint_<trackId>_<index>` | the checkpoint's trigger | transform | Checkpoint progress + respawn point. See 4.1. |
| `finish_<trackId>` | any trigger on the finish line | — | Counts a lap. See 4.2. |
| `hub_enter` | **only** `hub_start_trigger` | name (checked) | Shows the hub modal (start / race running / abort). |
| `hub_leave` | `hub_start_trigger`, **`OnEndTouch`** | — | Hides the hub modal. |
| `hub_teleport` | any trigger | — | Sends the melon to `hub_spawn`, takes it out of a running heat, resets its track progress. |
| `melon_paint` | `paint_trigger_<r>_<g>_<b>` | name (color) | Paints the melon. See 4.4. |
| `melon_teleport` | `teleport_to_<destination>` | name (destination) | Teleports the melon. See 4.5. |

Anything else is ignored by the script, and `npm test` fails on it.

### 4.1 Tracks and checkpoints

A track is three kinds of trigger, all numbered by `trackId`
(1 … `MAX_TRACKS` = 8). Heats run in ascending `trackId` order.

**Start trigger** — exactly one per track:

```
track_start_<trackId>_cp<checkpointCount>_laps<lapsToWin>     e.g. track_start_1_cp8_laps3
```

- Pattern `^track_start_(\d+)_cp(\d+)_laps(\d+)$`, parsed once at map start
  from every `trigger_multiple`.
- Its transform is where racers are teleported when the heat starts (spread
  sideways by `RACE_SPAWN_LATERAL_SPACING`), so place it at/just behind
  checkpoint 1, facing down the track.
- Needs no outputs of its own — but may carry `finish_<trackId>` (4.2).
- A track without a start trigger doesn't exist for the race flow (the HUD
  shows "?").

**Checkpoint triggers** — one per checkpoint, `index` = 1 …
`checkpointCount` (at most `MAX_CHECKPOINTS_PER_TRACK` = 32), in driving
order:

```
OnStartTouch → melon_drive_script → RunScriptInput → checkpoint_<trackId>_<index>
```

- Name the trigger like its parameter (`checkpoint_1_3`) — only the
  parameter is functionally required, but the name keeps the map readable.
- Its transform is the respawn point after a break once this checkpoint is
  reached: place and turn it the way a respawning melon should face.
- `_1` picks the track; later checkpoints only count on that track and
  strictly in order (skipping one doesn't count). Progress never goes
  backwards.

**Finish signal** — `finish_<trackId>`, see 4.2.

### 4.2 Finish line

```
OnStartTouch → melon_drive_script → RunScriptInput → finish_<trackId>
```

- Counts a lap only if the melon has reached the track's last checkpoint
  since the lap started.
- Which trigger fires it doesn't matter. Usual choices: a second output on
  the start trigger or on `checkpoint_<trackId>_1` (start = finish line), or
  a separate trigger where the track ends.

### 4.3 Hub

`hub_start_trigger` is the only trigger allowed to fire `hub_enter` /
`hub_leave` (the script checks the caller's name; `npm test` checks the
.vmap). Both outputs are required — without `hub_leave` the modal never
closes:

```
OnStartTouch → melon_drive_script → RunScriptInput → hub_enter
OnEndTouch   → melon_drive_script → RunScriptInput → hub_leave
```

Every melon inside it when someone clicks "start" joins the heat. To just
*send* melons to the hub from elsewhere (e.g. the tutorial's exit), use a
trigger with `hub_teleport` instead — never `hub_enter`.

### 4.4 Paint triggers

```
name:   paint_trigger_<r>_<g>_<b>        e.g. paint_trigger_255_0_0 (red)
output: OnStartTouch → melon_drive_script → RunScriptInput → melon_paint
```

- Pattern `^paint_trigger_(\d+)_(\d+)_(\d+)$`, each channel 0–255.
- The color comes from the name, not the parameter — every paint trigger
  uses the same `melon_paint`.
- The color stays until the melon touches another paint trigger (it
  survives breaks, heats and hub returns).

### 4.5 Teleporters

```
destination: any named point entity, e.g. info_target "tp_dest_hub_back"
trigger:     teleport_to_<destination>   e.g. teleport_to_tp_dest_hub_back
output:      OnStartTouch → melon_drive_script → RunScriptInput → melon_teleport
```

- Pattern `^teleport_to_(.+)$`; everything after `teleport_to_` is the
  destination's exact name.
- The melon arrives at the destination's origin (+ `TELEPORT_UP_OFFSET`),
  facing its yaw; the player's view is turned with it. With
  `TELEPORT_KEEP_SPEED` it keeps its horizontal speed along the new facing.
- Only moves the melon: health, respawn point and checkpoint/lap progress
  stay as they were — a teleporter can't skip checkpoints.
- Ignored for broken melons and melons locked by the race flow (countdown,
  finished).
- Prefix destination names with `tp_dest_` by convention.

## 5. Limits

| Constant | Value | Meaning |
|---|---|---|
| `MAX_TRACKS` | 8 | highest usable `trackId` |
| `MAX_CHECKPOINTS_PER_TRACK` | 32 | highest usable checkpoint `index` |
| `TELEPORT_UP_OFFSET` | 40 | units a melon is lifted above a trigger / teleport destination |
| `SPAWN_UP_OFFSET` | 40 | units above the floor under `hub_spawn` / `intro_spawn` — keep spawn entities near the floor, a long drop can break the melon |

Script inputs are pre-registered up to these limits; raise them in
`constants.js` (and rebuild) if a map needs more.

## 6. Checking your map

`npm test` reads `maps/melon_racer.vmap` (save in Hammer first) and fails on:

- a `RunScriptInput` parameter the script doesn't register (typos),
- `hub_enter`/`hub_leave` fired by anything but `hub_start_trigger`, or
  either of them missing there,
- a `melon_teleport` from a trigger not named `teleport_to_<destination>`,
  a destination that doesn't exist, or a `teleport_to_*` trigger without the
  output,
- a trigger feeding the script without "Physics Objects" ticked,
- `melon_template` without a `prop_physics`, a break template without a
  `.vpcf` particle system, any extra `melon_break_*` template,
- a missing or duplicated `particle_perfect_spark`,
- entity names with leading/trailing whitespace.

In game, with `DEBUG` on (`src/melon_drive/debug.js`), the console logs
every touch the script accepts or ignores (`[melon_drive] checkpoint_1_2:
…`). Wiring mistakes that `npm test` can't see from the .vmap (a teleporter
pointing at a missing entity at runtime, `hub_enter` from the wrong trigger)
are logged even with `DEBUG` off. If a trigger produces no line at all, its
output is missing, mistargeted, or its filter/spawnflags keep the melon out.

## 7. Minimal map checklist

- [ ] `point_script` `gamemode` + `point_script` `melon_drive_script`
- [ ] `custom_hud_layout` `speed_hud` (one)
- [ ] `point_template` `melon_template` with the melon `prop_physics`
- [ ] `hub_spawn` near the hub floor, `hub_start_trigger` with `hub_enter` + `hub_leave`
- [ ] per track: `track_start_<id>_cp<N>_laps<M>`, `checkpoint_<id>_1` … `_<N>`, a `finish_<id>` output
- [ ] optional: `intro_spawn`, `hub_spawn_facing`, both break templates, `particle_perfect_spark`, paint triggers, teleporters
- [ ] every melon trigger: `trigger_multiple`, "Physics Objects", filtered to `prop_physics`
- [ ] `npm test` passes
