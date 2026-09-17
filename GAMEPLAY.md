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
checkpoint — that's what picks a track (a racer can drive into whichever
track's start they want). Checkpoints past `_1` only advance progress if the
kart is already on that same track, so cutting across into a different
track's later checkpoints doesn't skip anything — and, as before, progress
only ever moves forward, never backward. Progress is tracked per kart (keyed
by melon entity). The last-touched checkpoint's position/angles are also
where a broken melon respawns (see above).

Re-touching `_1` while already on that same track does **not** by itself
restart/complete a lap — that's a separate `finish_<trackId>` input, see
"Hub → race → next-track flow" below. Splitting "pick a track" from "count a
completed lap" into two independent script inputs means they can be wired on
different triggers entirely (e.g. `finish_<trackId>` on the track's own
`track_start_*` trigger, since that's already sitting on the finish line)
without caring which one Hammer fires first, or even whether they're the
same physical trigger at all. It does still move `checkpointIndex` from `0`
to `1` on that re-touch, same as any other forward progress — `finish_<trackId>`
is what resets it to `0` when a lap completes, so this is what makes the next
lap's first leg register at all instead of the HUD sitting at "0" until
checkpoint 2.

While on a track, the HUD shows `<checkpoints reached> / <total on this
track>` (hidden entirely otherwise). The total (and the laps-to-win count
used by the flow below) comes from parsing that track's `track_start_*`
trigger name — see "Hub → race → next-track flow" — so a track missing that
trigger (or missing from the map) shows "?" instead of guessing.

**Open question this raises**: should different tracks be mutually
exclusive lap-wise (finishing/leaving one clears `trackId` back to
"undecided"), or can a racer freely hop between tracks mid-run with each
track's progress remembered independently? Currently it's the latter by
accident (switching tracks only overwrites `checkpointIndex`/position, a
track's own progress isn't stored separately) — this still holds for casual
free-roam driving between race heats, but see the next section: while a race
heat is active, only the currently active track's checkpoints matter for
win/finish purposes.

## Hub → race → next-track flow (decided, implemented)

The map is one continuous space: a **hub** area where players gather/drive
around freely, plus the racing tracks (see above). A full run through the
map is a sequence of race **heats**, one per track, in ascending `trackId`
order — not free late-joining mid-heat, and not a `changelevel` between
"maps": the addon only ships a single `.vmap`, so "next map" from the
original request means *next track in that sequence*, staying in the same
map. All of this lives in `melon_drive.js` alongside the kart/checkpoint
state it's tightly coupled to, not a separate `point_script` — same
reasoning as checkpoints living there instead of their own file.

**Track config lives entirely in the Hammer-authored start trigger**, not in
a hand-maintained JS lookup: each track has one `trigger_multiple` named
`track_start_<trackId>_cp<checkpointCount>_laps<lapsToWin>` (e.g.
`track_start_1_cp8_laps3` = track 1, 8 checkpoints, 3 laps to win). Script
finds every `trigger_multiple` in the map on first use, parses that name
pattern, and builds the track list from it — adding/removing a track or
changing its checkpoint/lap count is a pure Hammer edit, no script change
needed. This trigger's transform is also where racers are teleported to
spawn on that track; it does **not** replace the existing
`checkpoint_<trackId>_1` trigger, which still does the actual
lap/progress-tracking job every time a kart crosses the start line (first
lap and every lap after) — the start trigger only supplies the spawn point
and metadata, so it should be placed at/just behind that track's first
checkpoint.

Phases (module-level state machine, `RacePhase` in `melon_drive.js`):

1. **HUB** — default state, also the state the whole group returns to after
   the last track's heat ends. A `trigger_multiple` named
   `hub_start_trigger`, filtered to `prop_physics` like the checkpoints,
   fires `hub_enter`/`hub_leave` script inputs on touch/untouch. While a
   kart is in it, that player sees a modal ("Jetzt starten" button) on the
   HUD — or, if a heat is already running for other players, a "race in
   progress" message instead of the button. Clicking the button only starts
   a heat if the phase is still `HUB`.
2. Clicking start: **every kart currently standing in the hub trigger**
   (not every connected player) is pulled into the heat — the ones outside
   it stay in the hub. This matches the original request ("all players who
   want to take part must be on the trigger area"). Their laps/checkpoint
   progress resets and they're teleported to the lowest-`trackId` track's
   start trigger (small per-racer lateral offset so they don't spawn
   stacked on each other). `trackId` is set to that track right there,
   rather than waiting for the physical `checkpoint_<trackId>_1` touch to
   report it, so the checkpoint/lap HUD is already visible ("0/N", lap "1/M")
   the instant the countdown starts instead of staying hidden until that
   trigger fires; `checkpointIndex` itself stays `0` until the racer
   actually crosses checkpoint 1, same as any other checkpoint.
3. **COUNTDOWN** — every racing kart is `locked`: `UpdateKart` skips all
   input/friction handling for a locked kart and just holds its horizontal
   velocity at zero every tick (vertical velocity is left alone so gravity
   still applies normally) — melons genuinely cannot be driven until this
   ends. A large, centered "3…2…1" HUD label (see `speedometer.xml`'s
   `countdown_label`) counts down for the racers only. `COUNTDOWN_SECONDS`
   at the top of `melon_drive.js` controls the length.
4. **RACING** — normal driving, existing checkpoint/lap logic, plus a
   dedicated `finish_<trackId>` script input (registered for every
   `1..MAX_TRACKS`, same pattern as `checkpoint_<trackId>_<index>`) that's
   the sole thing that counts a completed lap. Wire it as an `OnStartTouch`
   output, `RunScriptInput` with parameter `finish_<trackId>` (e.g. track 2
   gets `finish_2`), on whichever trigger sits on that track's finish line —
   the handler only reads *who* touched it (the melon), not *which entity*
   fired the input, so this can be the track's own
   `track_start_<trackId>_cp<N>_laps<M>` trigger (a natural fit, since start
   and finish are normally the same line and that trigger already marks that
   spot), the `checkpoint_<trackId>_1` trigger, or its own separate volume —
   whichever matches the map's actual layout. On touch, if the kart is
   actively racing this active track and has already reached its *last*
   checkpoint since the previous lap started, that's a completed lap
   (`kart.lapsCompleted += 1`, `checkpointIndex` reset to `0` — "no
   checkpoints reached yet" — for the next lap); otherwise it's ignored (lap
   not actually run yet). Once
   `lapsCompleted >= lapsToWin`, that kart is marked `finished` (locked in
   place, out of the way, so it doesn't keep re-triggering checkpoints) — it
   does **not** end the heat by itself; see next. Kept as a separate input
   from `checkpoint_<trackId>_1` (which only ever *picks* a track and never
   touches `lapsCompleted`) specifically so both can be wired as outputs on
   the same trigger, if that's how a track's laid out, without depending on
   which one Hammer fires first — see "Multiple tracks & checkpoints" above.
   `checkpoint_<trackId>_1` *does* still bump `checkpointIndex` from `0` back
   to `1` on that re-touch, though, since this input is also what crosses the
   start/finish line for every lap after the first — without that the HUD's
   checkpoint counter would sit at `0` through the whole first leg of each
   later lap and then jump straight to `2`.
5. **BREAK** — once every kart that started this heat is either `finished`
   or has disconnected (the latter already drops its kart entry via
   `OnPlayerDisconnect`, so it can't block the group), the heat is over.
   After a fixed `BREAK_SECONDS` (10, per the original request) the flow
   either starts a fresh COUNTDOWN on the next track in sequence, or, if
   that was the last track, teleports the whole group back to the hub
   trigger's own transform and returns to phase `HUB`.

## Moderator (decided, implemented)

The first player to get a kart (i.e. the first to join the map, tracked via
`moderatorSlot` in `melon_drive.js`) is the **moderator** for as long as
they're connected. If they disconnect, the next-oldest remaining player
(insertion order of the `karts` map) is promoted, so there's always exactly
one moderator whenever anyone is on the map.

The moderator's one power is aborting a heat that's already running
(`COUNTDOWN`, `RACING`, or `BREAK`) — useful if a race was started by
mistake or needs to be redone. There's no separate always-visible button for
this: the moderator gets it the same way anyone reaches the hub's "start"
modal — by standing in `hub_start_trigger`. While a heat is running, a
non-moderator standing there sees the existing "Rennen läuft bereits…"
message; the moderator sees a "Rennen abbrechen" button instead
(`hub_abort_button` in `speedometer.xml`, toggled via the `IsModerator` HUD
class). Clicking it runs the same `ReturnAllToHub` + reset-to-`HUB` path a
heat normally takes when it finishes on its own, just triggered early
instead of after the last track's `BREAK`.

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

## Melon painting (implemented)

Driving over a paint trigger recolors that player's melon — intended for the
hub, so players can pick a color while gathering before a heat, but nothing
restricts placement to there. Color config lives in the trigger's own name
(same convention as `track_start_*`, see above), not a hand-maintained
lookup: a `trigger_multiple` named `paint_trigger_<r>_<g>_<b>` (e.g.
`paint_trigger_255_0_0` for red), filtered to `prop_physics` like the other
triggers, with its `OnStartTouch` firing `RunScriptInput` `melon_paint` on
the `point_script` entity — one shared input handler for every paint
trigger, since the color comes from parsing the touched trigger's name, not
the input's parameter. Adding, removing, or recoloring a paint trigger is a
pure Hammer edit.

The color sticks to that melon (`SetColor`) until it touches a different
paint trigger — it isn't reset on breaking, finishing a heat, or returning
to the hub, only overwritten by touching another paint trigger. A freshly
spawned melon (first join, or after a respawn where the old one was
invalid) starts unpainted (the model's default color).

## Open design questions (not yet decided — ask before assuming)

- **Respawn-on-death vs. never-die**: given out-of-bounds already teleports
  back to a checkpoint, does the player ever actually need to die/respawn?
- **Stragglers**: there's no timeout for a kart that's fallen way behind or
  gotten stuck mid-heat (see "Hub → race → next-track flow" above) other
  than disconnecting — the group is blocked until every racer finishes.
  Worth a "force-finish"/skip vote or a hard timeout once this is actually
  played with real groups.
- **Winner recognition**: `lapsToWin` decides when a kart is *done* with a
  heat, but nothing currently records or displays *who got there first* —
  worth a "1st/2nd/3rd" HUD callout once this is played with real groups.
