# Melon Racer — Gameplay & Logic

This file holds everything about the **game itself**: concept, round flow,
and gameplay-specific conventions. [AGENTS.md](AGENTS.md) stays focused on
the CS2 engine/`cs_script` API and addon-editing rules and `@`-imports this
file, so it's loaded automatically whenever AGENTS.md is — keep gameplay
design changes here rather than back in AGENTS.md.

## Concept

A CS2 Workshop racing map ("Melon Racer"). Players race along a track;
`prop_physics` melon props are the map's signature gimmick (pushed/launched
rather than shot). Exact vehicle/movement feel (on-foot racing vs.
pushing/riding a melon vs. something else) is not yet locked down — see
Open Questions.

## Track layout (inferred from existing assets)

The addon ships ambience for both outdoor (`bird_01.wav`…`bird_06.wav`) and
interior (`interior_01.wav`, `vent_01.wav`) sections, so the track is
expected to move between outdoor and interior segments. Keep new
`soundevents/soundevents_addon.vsndevts` entries split the same way —
one ambient loop per section type, not one global soundscape — and place
`env_soundscape`/ambient-trigger volumes at the outdoor↔interior
transitions once the layout exists in Hammer.

## Round flow (current design, subject to change)

1. **Warmup/Freeze** — players join, get placed at the start line.
   `Instance.OnPlayerActivate`/`OnPlayerReset` is the hook to place a
   fresh/respawning player at the start (or their last checkpoint, if
   mid-race state should survive a respawn — TBD, see Open Questions).
2. **Start** — a start trigger begins that player's timer
   (`Instance.GetGameTime()` captured per player) and enables checkpoint
   tracking for them.
3. **Checkpoints** — sequential `trigger_multiple` volumes along the track.
   Each fires `RunScriptInput` on a `point_script` entity with a
   checkpoint-index parameter; script records "highest checkpoint reached"
   per player.
4. **Out-of-bounds / fall reset** — a catch-volume teleports the player back
   to their last checkpoint (`pawn.Teleport({ position, velocity: {x:0,y:0,z:0} })`)
   rather than killing/respawning them, so mid-race state isn't lost.
5. **Finish** — stops that player's timer, records their time, updates the
   HUD/leaderboard.

## Checkpoint logic

- Track progress per player in a `Map` keyed by `CSPlayerController` (or
  pawn) — not by array index — so it survives disconnects/reconnects
  cleanly.
- A checkpoint should only ever move a player's progress *forward*; touching
  an earlier checkpoint again (e.g. doubling back) must not regress it.
- Respawn/reset position = the *last checkpoint's* stored position/angle,
  not the map's start line, once past checkpoint 1.

## Timing & HUD

- Per-player start/finish times captured via `Instance.GetGameTime()`, not
  wall-clock or per-tick accumulation.
- Live timer + checkpoint counter surfaced through a `custom_hud_layout`
  entity, driven by `SetDialogVariableStringForPlayer` — see AGENTS.md's
  "Custom HUD" section for the mechanism.
- Best-time persistence (e.g. per-player best lap) can use
  `Instance.SetSaveData`/`GetSaveData` — decide scope (per map, global
  across melon_racer versions) before relying on it long-term.

## Melon props & boost pads

- Melon props are `prop_physics`. Boost pads are triggers that fire an
  entity input (`EntFireAtName`/`EntFireAtTarget`) on touch rather than
  scripting velocity directly, so mass/friction/boost-force tuning stays in
  Hammer entity properties and doesn't require a script edit to iterate on.
- If a boost needs a feel that pure physics forces can't give (an
  instant/guaranteed launch), use `Teleport({ velocity })` on the touched
  entity as the exception, not the default.

## Melon health & breaking (decided)

The melon has a health pool (`MELON_MAX_HEALTH` in `melon_drive.js`) that's
worn down by hard impacts — crashing into geometry or landing a big fall —
not by fall distance or a fixed "you touched the ground" event. Each tick the
velocity the script commanded last tick is compared against the melon's
actual velocity now; physics only overrides that gradually (steering,
gravity) unless something forcibly stopped it (a wall, the ground after a
fall), so a large gap is read as an impact and scaled into damage. At 0
health the melon "breaks": it's teleported back to the position/angles of
the last checkpoint it reached (or the player's spawn point, if none yet),
velocity zeroed, health reset to full. The melon entity itself isn't
destroyed/recreated (keeps the camera's `followEntity` and other references
valid) — there's no visual/audio "it broke" cue yet, just the reset; that'd
be a good follow-up (glow flash, a break sound, briefly hiding the model).

Tune via `IMPACT_DAMAGE_THRESHOLD` (units/sec of sudden velocity change
before damage starts) and `IMPACT_DAMAGE_SCALE` (health lost per unit/sec
beyond that).

## Multiple tracks & checkpoints (implemented)

The map has more than one track, so checkpoint identity is `(trackId,
index)`, not just an index. Checkpoint tracking lives in `melon_drive.js`
(not a separate script — see AGENTS.md's note on one `point_script` entity
per independent subsystem; checkpoints are tightly coupled to kart/melon
state, so they stay together). `MAX_TRACKS` × `MAX_CHECKPOINTS_PER_TRACK`
script inputs are pre-registered as `checkpoint_<trackId>_<index>` — e.g.
track 2's 3rd checkpoint is `checkpoint_2_3`. Hammer setup per checkpoint,
not yet done in the map:

- A `trigger_multiple` volume placed along the track, positioned/angled at
  the spot a broken melon should respawn facing.
- Filtered (via a `filter_activator_class` set to `prop_physics`, or by name
  if that's ever ambiguous) so only melons — not the frozen/parked player
  pawns — can trigger it.
- Its `OnStartTouch` output fires `RunScriptInput` on this map's
  `point_script` entity, with the parameter set to `checkpoint_<trackId>_N`
  matching that track's id and this checkpoint's position along it (starting
  at 1).

A kart isn't considered "on" any track until it touches that track's `_1`
checkpoint — that's what both picks a track (a racer can drive into whichever
track's start they want) and restarts a lap (driving through `_1` again
resets progress on that track). Checkpoints past `_1` only advance progress
if the kart is already on that same track, so cutting across into a
different track's later checkpoints doesn't skip anything — and, as before,
progress only ever moves forward, never backward. Progress is tracked per
kart (keyed by melon entity). The last-touched checkpoint's position/angles
are also where a broken melon respawns (see above).

While on a track, the HUD shows `<checkpoints reached> / <total on this
track>` (hidden entirely otherwise). cs_script has no way to ask Hammer how
many checkpoint triggers exist for a given track, so the total is a manually
maintained lookup, `TRACK_CHECKPOINT_COUNTS` in `melon_drive.js` — **update
it whenever checkpoints are added/removed/reordered on a track in Hammer**,
or the HUD will show "?" (a track missing from that map) or a wrong total.

**Open question this raises**: should different tracks be mutually
exclusive lap-wise (finishing/leaving one clears `trackId` back to
"undecided"), or can a racer freely hop between tracks mid-run with each
track's progress remembered independently? Currently it's the latter by
accident (switching tracks only overwrites `checkpointIndex`/position, a
track's own progress isn't stored separately) — fine for now, but worth
deciding before a real lap/finish system is built on top.

## Movement model (decided)

Free-look: each player automatically gets their own `prop_physics` melon
(spawned per-player from a `point_template` named `melon_template` — see
`maps/scripts/melon_drive.js`) on every `OnPlayerReset`. The player's own
pawn is frozen (`CSMoveType.NONE`), hidden (`SetColor` alpha 0), and
teleported straight up (`PAWN_PARK_HEIGHT`, currently 3000 units) right
after its melon spawns — it deliberately does **not** track the melon's
position afterward. An earlier version left it parked at ground level and
had it follow the melon every tick; either way, cs_script has no
"disable collision" call for a pawn, so its still-solid hitbox kept
overlapping the melon's physics collision and the two would violently
shove each other apart. Parking it high in the sky sidesteps the missing
API by making it physically unreachable instead. There's no separate turn control —
steering direction is wherever the player is looking (mouse): W/S
accelerate/brake along that look direction, A/D strafe left/right relative
to it, Space jumps (only while grounded). A third-person
`CustomPlayerCamera` in `FOLLOW_POSITION` mode chase-cams behind the melon
directly, so it doesn't need the pawn nearby to work.

**Consequence for checkpoint/out-of-bounds work below**: since the pawn no
longer moves with the melon, checkpoint triggers, lap progress, and the
out-of-bounds catch-volume all need to key off the **melon** entity (e.g.
`OnStartTouch` filtered to the `prop_physics` classname, or comparing
`caller`/`activator` against the tracked kart's melon), not the player
pawn — the pawn's position is no longer meaningful for race progress.

Tuning constants (accel, max speed, friction, jump speed, spawn offset,
camera offsets) live at the top of `melon_drive.js` — iterate them in-game
via hot reload
rather than guessing.

## Open design questions (not yet decided — ask before assuming)

- **Race format**: single lap vs. multiple laps? Free-for-all simultaneous
  race vs. time-trial (one player at a time, ghost/best-time comparison)?
- **Win condition**: first across the finish, or best time over N attempts?
- **Combat**: should weapons/damage be disabled entirely for a pure-racing
  feel (`OnModifyPlayerDamage` → `{ abort: true }`), or is there an
  attack/sabotage mechanic between racers?
- **Respawn-on-death vs. never-die**: given out-of-bounds already teleports
  back to a checkpoint, does the player ever actually need to die/respawn?
