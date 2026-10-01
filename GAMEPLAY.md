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

## Time trial (decided, implemented)

Every run over a track is timed, for every player on their own, whether
they're alone on the server or not (decided) — so driving a track alone is
racing against the clock:

- **Outside a heat** the clock starts when the melon crosses the track's
  start line (`start_<trackId>`); crossing it again before checkpoint 1
  (e.g. after breaking and respawning behind the line) starts the attempt
  over. **In a heat** it starts at GO, for every racer at once, and a
  free-roaming run already going is dropped when the heat begins.
- It stops at the finish of the **last lap** (`lapsToWin`) — one total time,
  no separate lap times (decided). Breaking doesn't stop it: the respawn
  costs time, that's the penalty. Leaving the track (hub, tutorial, a new
  heat) cancels the run without a time.
- Outside a heat, finishing takes the melon off the track until it crosses
  a start line again — except on a loop, where the finish line *is* the
  start line: the next attempt starts right there.
- **Restart:** only while the melon is on a track in a free-roaming time
  trial (decided), the user menu shows "Restart Time Trial" under the
  NAVIGATION buttons: the melon goes back to the track's start spawn, whole
  and standing still, the clock at zero until it crosses the start line
  again. Gone once a finish takes the melon off the track (a loop's next
  attempt has it again), in a heat (a free reset mid-race), in the hub or
  tutorial; ignored while the melon is breaking. \`RestartTimeTrial\` in
  \`race/checkpoints/checkpoints.js\`, \`CanRestartTimeTrial\` in \`race/time-trial/time-trial.js\`.
- Each player's **best time per track** is saved with
  `Instance.SetSaveData` (one JSON object for the addon, best times under
  `SAVE_DATA_BEST_TIMES_KEY`), so it survives map restarts. Keyed by
  player name: the API has no stable player id, so renaming starts from
  scratch and two players with the same name share one entry.
- HUD, **top left** (decided): the running clock (`m:ss.cc`) big, the
  player's best on this track below it, and after the finish "FINISH <time>"
  or, in gold, "NEW BEST <time>" for `RUN_RESULT_SECONDS` (in a heat, until
  it's over).

Times are `Instance.GetGameTime()` differences, not wall-clock or per-tick
accumulation. Constants: `race/time-trial/constants.js`; rules:
`race/time-trial/logic.js` (`test/time-trial.test.mjs`), applied by
`race/time-trial/time-trial.js` (`test/time-trial-run.test.mjs`).

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
valid). Before that reset, the break plays out at the crash site: the melon
is hidden and frozen there, the `melon_break_template` and
`melon_break_chunks_template` point_templates are spawned (their
`info_particle_system`s get an explicit `Start` input), and the chase camera
eases back (`BREAK_CAMERA_*`) so the burst is visible. After
`BREAK_RESPAWN_DELAY` the camera snaps back to normal and the melon respawns.
The spawned effects are left lying at the crash site for
`BREAK_EFFECT_LIFETIME` (at most `BREAK_EFFECT_MAX_ACTIVE` breaks at once).

The chunks particle (`break_watermelon_chunks.vpcf`) is only small sprite
flecks that fade within moments, so it can't provide chunks that lie on the
ground. **Decided: there are only these two break templates, no others.**
Lying chunks therefore come from physics props placed *inside* one of them:
any `prop_physics` either template spawns is treated as a break piece —
tinted in the melon's paint color, flung outward from the crash site
(`BREAK_PIECE_SPEED`/`_UP_SPEED`/`_SPIN`), and removed only after
`BREAK_EFFECT_LIFETIME`. To get them, add to `melon_break_chunks_template`
(`Template02`…) up to 9 `prop_physics` with the melon model's own break
pieces, `models/cs_italy/italy_food_melon/italy_food_melon/piece.vmdl`,
`piece1.vmdl` … `piece8.vmdl`, arranged close together in roughly a
melon's shape. Where the templates and their entities sit in Hammer doesn't
matter: `ForceSpawn` would keep each entity's offset from its template, so
script moves particle systems exactly onto the crash site and centers the
pieces' group on it (keeping their layout relative to each other). If lying pieces get in the karts' way, mark them as debris.

`test/map-templates.test.mjs` checks the .vmap to make sure both
templates exist and are wired up, and that no other `melon_break_*`
template creeps in (the `npm test` failure names whatever's
missing). There's no break sound yet.

**Kill triggers:** a `trigger_multiple` (filtered to `prop_physics`) whose
`OnStartTouch` fires `RunScriptInput` `melon_break` breaks the touching
melon at once, whatever its health — the same break as above (effects at
the spot, respawn at the last checkpoint). For lava, spikes, a drop the
fall reset shouldn't forgive, … Broken or race-locked melons ignore it.

Tune via `IMPACT_DAMAGE_THRESHOLD` (units/sec of sudden velocity change
before damage starts) and `IMPACT_DAMAGE_SCALE` (health lost per unit/sec
beyond that).

**Flat landings hurt more:** landing on level ground (floor trace normal z ≥
`FLAT_LANDING_MIN_NORMAL_Z`, and the impact mostly from above —
`FLAT_LANDING_MIN_VERTICAL_SHARE`) multiplies that damage by
`FLAT_LANDING_DAMAGE_MULTIPLIER` (`health/damage/constants.js`, rule in
`health/damage/logic.js`). Landing on a slope, or crashing sideways, stays plain
impact damage; the threshold is the same, so landings that were free stay
free.

## Wall bounce — speed for health (implemented)

Every wall (any surface whose normal is mostly horizontal, `|normal.z| <
WALL_NORMAL_MAX_Z` — so floors, ceilings, and landings never count; other
physics props like melons don't either) bounces the melon back instead of
just stopping it: the melon's *pre-impact* horizontal velocity is reflected
off the wall's normal and scaled by a multiplier. The normal comes from a
`TraceLine` cast from the melon's *previous-tick* position along its
incoming direction (then a short `TraceSphere` from the current position;
if neither finds a wall, there's no bounce). A found wall only counts if the
melon is really touching it (`IsWallContact`): its center is within
`WALL_CONTACT_DISTANCE` of the wall plane, and the impact took away at least
`WALL_CONTACT_MIN_STOP` of its speed into that wall. Otherwise a hard
landing or bump in a small room bounced the melon off whatever wall lay
ahead within trace range, seemingly off thin air. Since a collision often spans two ticks, the incoming velocity
is whichever of the last two commanded velocities still heads more squarely
into the wall. With `DEBUG` on (`core/debug.js`), every bounce logs the velocity
angle next to the look angle (nothing is drawn in the world). There's no global "on/off per wall" — all walls do it.

- **Angle is the skill part.** Angle closeness is 1 at exactly
  `WALL_BOUNCE_OPTIMAL_ANGLE` (45° from the wall normal) and falls off
  linearly to 0 `WALL_BOUNCE_ANGLE_FALLOFF` degrees away from it; it picks
  the rating (`BOUNCE_RATINGS`; PERFECT within ±`PERFECT_BOUNCE_TOLERANCE`,
  8.5°, of 45°), and each rating has a fixed speed
  multiplier (`speedMultiplier`, decided): PERFECT ×1.35, GOOD ×1.1,
  BAD ×0.5, MISS ×0.3 — so only PERFECT and GOOD come out faster than they
  went in, BAD and MISS cost speed.
- **Jump timing** multiplies it again, up to
  `WALL_BOUNCE_PERFECT_JUMP_MULTIPLIER` for a jump on the exact tick of the
  hit, fading linearly to nothing at `WALL_BOUNCE_PERFECT_JUMP_WINDOW`
  seconds before *or* after it. The timing press is the jump button but
  **independent of the normal jump**: it counts in the air and during the
  jump cooldown (no upward push — only timing credit), while the normal
  jump stays ground- and cooldown-gated. Anti-spam: pressing again within
  `WALL_TIMING_SPAM_LOCKOUT` of a previous press **that did nothing** (no
  ground jump, no wall jump) locks timing credit for that long, so mashing
  never counts. A real jump just before doesn't (decided): jumping at a wall
  and then timing the hit works, and so do chained wall jumps in a shaft.
  Rule: `WallTimingPress` in `movement/wall-bounce/logic.js`.
- **Cost — and how skill waives it:** wall hits have their own damage
  rules, separate from landings' `IMPACT_DAMAGE_*`: a base part from the
  impact itself (`WALL_IMPACT_DAMAGE_THRESHOLD`/`_SCALE`) plus
  `WALL_BOUNCE_DAMAGE_PER_SPEED` per unit/sec the bounce *gained*. That
  total is multiplied by `1 − angle closeness` (0..1) — **only the angle
  counts** (decided): any hit the HUD rates PERFECT (`BOUNCE_RATINGS[0]`)
  costs **no health at all**, jumped or not; below that the cost scales with
  angle closeness, and one with no angle bonus pays full price. Jump timing only adds speed
  (and a late jump's extra speed gain is charged too, still waived by a
  perfect angle). The damage is charged once the jump window has closed, not
  on impact; if it takes health to 0 the melon breaks right then, after the
  bounce already happened.
- **No speed ceiling:** a bounce lifts the kart's speed cap above
  `MAX_SPEED` with no upper limit, so chained bounces stack. The cap then
  decays back at `BOOST_DECAY` and never sits above the melon's actual speed
  (braking and re-accelerating can't reclaim a lost boost). It's reset by
  every respawn/race-flow teleport. Very fast melons make tunneling through
  thin checkpoint triggers likelier — keep them thick.
- **Boost trail:** while a bounce has the melon above `MAX_SPEED` +
  `BOOST_TRAIL_START_MARGIN`, a glowing band (white-yellow, fading to
  orange) with a few falling juice droplets follows it — the addon's own
  `particles/melon_racer/boost_trail.vpcf` and `boost_trail_juice.vpcf`,
  one `info_particle_system` each in the `particle_boost_trail_template`
  point_template (the juice as a child system never showed in-game),
  riding along on the melon. It stops once the boost has decayed below
  `MAX_SPEED` + `BOOST_TRAIL_STOP_MARGIN` (lower, so it doesn't flicker)
  and when the melon breaks or is race-locked; the particles already out
  fade over `BOOST_TRAIL_FADE_SECONDS`. **Not after a PERFECT bounce**
  (decided): that speed shows only the perfect-hit spark, no trail, until it
  has decayed back to normal speed (a later non-PERFECT bounce or the attack
  boost shows the trail again). Visible to every player, so the
  others see who's boosting. Rule: `fx/boost-trail/logic.js`, applied by
  `fx/boost-trail/boost-trail.js` (`test/boost-trail.test.mjs`).
- **Upward kick:** every bounce (any rating) also lifts the melon — its
  vertical speed becomes at least `WALL_BOUNCE_UP_SPEED` upward (a fall is
  cancelled; a melon already rising faster keeps its own speed — **not added
  on top** (decided): in a narrow shaft or corridor bounces come faster than
  gravity eats a kick, and adding them up let the upward speed grow with
  every bounce), so a bounce sends
  it up in an arc instead of along the ground. A PERFECT bounce
  (`BOUNCE_RATINGS[0]`) kicks `PERFECT_BOUNCE_UP_MULTIPLIER` (×1.2, decided)
  harder — the normal kick and a lift zone's alike. Inside a **lift zone**
  (`lift_enter`/`lift_leave` trigger, `LIFT_ZONE_UP_SPEED` or
  `lift_zone_<speed>` in its name — see MAPPING_API.md 4.7) the kick is
  stronger, so shafts and high walls can be climbed by bouncing between
  them; bounces there leave the wall with at least
  `LIFT_ZONE_MIN_BOUNCE_SPEED` (a head-on MISS would otherwise be too slow
  to reach the far wall), and wall jumps there cost no charge, are always
  full strength, have a shorter cooldown (`LIFT_ZONE_WALL_JUMP_COOLDOWN`)
  and fire from a press made shortly before touching the wall
  (`LIFT_ZONE_JUMP_BUFFER`); a wall contact there also stays jumpable
  longer (`LIFT_ZONE_WALL_JUMP_WINDOW`, 0.2 s, instead of a tick or two). While in a lift zone the chase camera eases back and
  up (`LIFT_CAMERA_*` in `camera/constants.js`) so the climb stays in view,
  looking through walls instead of being pulled in by them.
- `WALL_BOUNCE_COOLDOWN` stops one wall contact from bouncing (and
  damaging) on consecutive ticks — including the plain landing/crash damage
  rule, which would otherwise charge the same contact a second time; `WALL_BOUNCE_MIN_IMPACT` keeps light
  scrapes as plain physics.
- HUD: the speedometer gets `Boosted` while above `MAX_SPEED` and a short
  `PerfectBounce` flash after a bounce with angle closeness ≥
  `PERFECT_BOUNCE_ANGLE_FACTOR` (`speedometer.css`). Separately, a
  `bounce_panel` in the bottom-right HUD cluster, right above the speedometer (centered below the crosshair it covered the track), shows for `BOUNCE_HUD_SECONDS` after
  each bounce: a rating word by angle closeness (`BOUNCE_RATINGS`:
  PERFECT/GOOD/BAD/MISS), the exact angle hit, a 0°–90° scale in 10°
  segments with the 45° target outlined and the hit segment lit, and a
  jump-timing bar (which still fills in if the jump comes just *after* the
  hit).
- **Perfect spark:** every bounce rated PERFECT (`BOUNCE_RATINGS[0]`, same
  as the HUD) spawns two fresh copies of the `point_template` named
  `perfect_hit_particle_template` (`PERFECT_SPARK_TEMPLATE_NAME`, holding an
  `info_particle_system`) at the melon, starts them, and removes them after
  `PERFECT_SPARK_LIFETIME`: one stays at the hit spot on the wall, the other
  is parented to the melon and rides along — the melon leaves the wall too
  fast for its player to see the first one. Fresh copies per hit, so several karts' perfect hits
  at the same moment each show their own spark; `test/map-templates.test.mjs`
  checks the template exists in the .vmap and points at a particle system.
- **Prediction line** (`fx/prediction/prediction.js`, `PREDICTION_*`): a dotted line in
  front of the melon along its current direction of travel up to the next
  wall, then on along the direction it would bounce off in, colored by the
  rating that hit would get at the current angle (`BOUNCE_RATINGS[].color`,
  same colors as the HUD panel; white = no wall in range). Uses the same
  angle math as the bounce, so steer until it turns yellow (PERFECT).
  **Off by default**, switched on/off per player in the user menu's
  "GUIDE LINE" section (above "COLLISION DEBUG"; `kart.predictionLine`) — only
  that player's own melon gets a line. `PREDICTION_ENABLED` stays the
  map-wide master switch.
  **Decided: a dev/training aid only** — `PREDICTION_RENDER_MODE =
  "debug"` draws it with `Instance.DebugLine`, which only shows in dev
  environments (tools mode), never to real players on a Workshop server;
  that's intended. The alternative `"dots"` mode (entities from a
  `point_template` named `prediction_dot_template`, e.g. a small "Never
  Solid" `func_brush`, visible to everyone — every kart's line to every
  player) still exists but was judged to look worse than the debug line.
  Traces skip dots either way (`core/trace.js`).

## Multiple tracks & checkpoints (implemented)

The map has more than one track, so checkpoint identity is `(trackId,
index)`, not just an index. Checkpoint tracking lives in `melon_drive.js`
(not a separate script — see AGENTS.md's note on one `point_script` entity
per independent subsystem; checkpoints are tightly coupled to kart/melon
state, so they stay together). `MAX_TRACKS` × `MAX_CHECKPOINTS_PER_TRACK`
script inputs are pre-registered as `checkpoint_<trackId>_<index>` — e.g.
track 2's 3rd checkpoint is `checkpoint_2_3` — plus one `start_<trackId>`
and one `finish_<trackId>` per track. A track is **start line →
checkpoints → finish line**, and can be a loop (start and finish on the same
line, several laps) or point-to-point (finish somewhere else, one lap)
(decided). Hammer setup per checkpoint:

- A `trigger_multiple` volume placed along the track, **named exactly like
  its parameter** (`checkpoint_2_3`): the script counts a track's
  checkpoints from these names (see the next section), since it can't see
  which parameter an output fires.
- An `info_target` named `checkpoint_spawn_<trackId>_<index>` where a
  broken melon should respawn after reaching this checkpoint, facing its
  yaw (without one: the trigger's own position/angles).
- Filtered (via a `filter_activator_class` set to `prop_physics`, or by name
  if that's ever ambiguous) so only melons — not the frozen/parked player
  pawns — can trigger it.
- Its `OnStartTouch` output fires `RunScriptInput` on this map's
  `point_script` entity, with the parameter set to `checkpoint_<trackId>_N`
  matching that track's id and this checkpoint's position along it (starting
  at 1 for the first checkpoint *after* the start line).

A kart isn't considered "on" any track until it crosses that track's start
line (`start_<trackId>`) — that's what picks a track (a racer can drive
into whichever track's start they want), and the track's start spawn (see
below) is its respawn point until checkpoint 1. Checkpoints only advance progress if the kart is
already on that same track, so cutting across into a different track's
checkpoints doesn't skip anything — and progress only ever moves forward,
never backward, and strictly one checkpoint at a time: touching checkpoint N
only counts right after N-1, so a shortcut that skips checkpoints doesn't
count toward the lap (a kart that misses one has to go back for it — keep
checkpoint triggers thick enough that a fast melon can't tunnel through
them). Progress is tracked per kart (keyed by melon entity). The
last-touched checkpoint's `checkpoint_spawn_*` info_target is also where a
broken melon respawns (see above). Returning to the hub (heat over, abort,
or the user menu's hub button) clears the kart's track progress and moves
its respawn point to the hub.

Picking a track (`start_<trackId>`) and counting a lap (`finish_<trackId>`)
are two separate inputs, so a track can end somewhere other than where it
starts. On a loop track both are outputs on the same start trigger, and
Hammer doesn't guarantee which fires first — so crossing the start line with
the whole lap already run counts the lap right there too, and
`finish_<trackId>` then sees no checkpoints reached and is ignored (and the
other way round): either order counts the lap exactly once. Crossing it
mid-lap (doubling back) changes nothing. Laps count outside a heat too —
a free-roaming run is a time trial (see "Time trial"). A loop track
needs at least one checkpoint, or the finish would count the very first
crossing; a point-to-point track may have none.

While on a track, a **checkpoint strip** sits top center (hidden entirely
otherwise) — icons, not a "2/5" counter (decided): a start flag, one
numbered circle per checkpoint, a checkered finish flag, joined by lines.
Reached checkpoints are gold, the next one is white and bigger, the rest
dim; the finish flag lights up once it's next. It has
`CHECKPOINT_HUD_SLOTS` (12) circles; a track with more shows a window that
moves along so the next checkpoint stays in view, with "…" at the cut-off
ends. Below it "LAP 1/3", only on tracks with more than one lap. The
checkpoint count (and the laps-to-win count used by the flow below) comes
from that track's trigger names — see "Hub → race → next-track flow".
Flag icons: `tools/make-icons.mjs` (`track-start`, `track-finish`); rule:
`hud/checkpoint-strip-logic.js` (`test/checkpoint-strip.test.mjs`), applied
in `hud/`.

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

**Track config lives entirely in Hammer trigger names**, not in a
hand-maintained JS lookup: each track has one start trigger, a
`trigger_multiple` named `start_<trackId>` or
`start_<trackId>_laps<lapsToWin>` (e.g. `start_1_laps3` = track 1, 3 laps to
win; without `_laps`, `DEFAULT_LAPS_TO_WIN` = 1), and its checkpoint count
is the highest `checkpoint_<trackId>_<index>` trigger name in the map.
Custom keyvalues on the trigger were considered instead (e.g. a `laps`
key) — `cs_script` has no API to read them, so names it is (decided).
Script finds every `trigger_multiple` in the map on first use, parses those
names, and builds the track list from them — adding/removing a track or
changing its checkpoint/lap count is a pure Hammer edit, no script change
needed. Racers are teleported to spawn on that track at an `info_target`
named `start_spawn_<trackId>` (on the floor under it, facing its yaw, lined
up side by side) — without one at the start trigger's own origin/angles,
which is unreliable (no floor trace; Hammer may not turn a brush entity's
angles with its geometry), hence the separate entity (decided). The start
trigger fires `start_<trackId>` itself (see above).

Phases (module-level state machine, `RacePhase` in `melon_drive.js`):

1. **HUB** — default state, also the state the whole group returns to after
   the last track's heat ends. A `trigger_multiple` named
   `hub_start_trigger`, filtered to `prop_physics` like the checkpoints,
   fires `hub_enter`/`hub_leave` script inputs on touch/untouch. While a
   kart is in it, that player sees a modal ("Jetzt starten" button) on the
   HUD — or, if a heat is already running for other players, a "race in
   progress" message instead of the button. Clicking the button only starts
   a heat if the phase is still `HUB`. `hub_enter`/`hub_leave` are accepted
   **only from `hub_start_trigger` itself** (checked by caller name, and in
   the .vmap by `test/map-io.test.mjs`): any other trigger that should just
   get melons to the hub — e.g. the intro's exit — fires `hub_teleport`
   instead, which sends the touching melon to `hub_spawn` without the modal.
2. Clicking start: **every kart currently standing in the hub trigger**
   (not every connected player) is pulled into the heat — the ones outside
   it stay in the hub. This matches the original request ("all players who
   want to take part must be on the trigger area"). Their laps/checkpoint
   progress resets and they're teleported to the lowest-`trackId` track's
   start trigger (small per-racer lateral offset so they don't spawn
   stacked on each other). `trackId` is set to that track right there,
   rather than waiting for the physical `start_<trackId>` touch to
   report it, so the checkpoint/lap HUD is already visible ("0/N", lap "1/M")
   the instant the countdown starts instead of staying hidden until that
   trigger fires — crossing the start line after GO then changes nothing.
3. **COUNTDOWN** — every racing kart is `locked`: `UpdateKart` skips all
   input/friction handling for a locked kart and just holds its horizontal
   velocity at zero every tick (vertical velocity is left alone so gravity
   still applies normally) — melons genuinely cannot be driven until this
   ends. A large, centered "3…2…1…GO" HUD countdown (see `speedometer.xml`'s
   `countdown_panel`: one image per step, `number-3/2/1.png` and `word-go.png`
   in `panorama/images/custom_game/`, switched via `Show3`/`Show2`/`Show1`/
   `ShowGo` classes) counts down for the racers only. `COUNTDOWN_SECONDS`
   in `race/constants.js` controls the length — there are only images for 3..1,
   so a longer countdown shows nothing until 3.
4. **RACING** — normal driving, existing checkpoint/lap logic, plus a
   dedicated `finish_<trackId>` script input (registered for every
   `1..MAX_TRACKS`, same pattern as `checkpoint_<trackId>_<index>`) that's
   the sole thing that counts a completed lap. Wire it as an `OnStartTouch`
   output, `RunScriptInput` with parameter `finish_<trackId>` (e.g. track 2
   gets `finish_2`), on whichever trigger sits on that track's finish line —
   the handler only reads *who* touched it (the melon), not *which entity*
   fired the input, so on a loop track it's a second output on the track's
   own `start_<trackId>` trigger, on a point-to-point track its own trigger
   at the end. On touch, if the kart is
   actively racing this active track and has already reached its *last*
   checkpoint since the previous lap started, that's a completed lap
   (`kart.lapsCompleted += 1`, `checkpointIndex` reset to `0` — "no
   checkpoints reached yet" — for the next lap); otherwise it's ignored (lap
   not actually run yet). Once
   `lapsCompleted >= lapsToWin`, that kart is marked `finished` (locked in
   place, out of the way, so it doesn't keep re-triggering checkpoints) and
   that player immediately sees the big `word-finish.png` image
   (`finish_image`) until the next heat or the hub, with the "next track /
   back to hub in 10s" line under it once BREAK starts — it
   does **not** end the heat by itself; see next. See "Multiple tracks &
   checkpoints" above for how it and `start_<trackId>` share a trigger.
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
`maps/scripts/melon_drive.js`): `EnsurePlayerKarts` (every tick) gives any
alive player on T or CT without a kart one at the intro, after the logo
(see "Spawn points"), moves a kart over to a player's new
pawn, and re-attaches a chase camera the engine reset (joining a team used
to leave the player looking through their frozen body instead). T and CT
are both fine for racing; only unassigned players/spectators are put on CT.
The player's own pawn is frozen and made non-solid (`CSMoveType.NOCLIP` —
`NONE` would leave its hitbox solid for the melon to crash into), hidden
(`SetColor` alpha 0), and **stays at the map's player spawn** it appeared
at, which sits away from the tracks (it's no longer parked high in the
sky). WASD would still fly a noclip pawn around, so `HoldPawn` puts it
back once it drifts more than `PAWN_DRIFT_TOLERANCE`. It deliberately does
**not** track the melon's position. There's
no separate turn control —
steering direction is wherever the player is looking (mouse): W/S
accelerate/brake along that look direction, A/D strafe left/right relative
to it (holding W also turns the melon's existing velocity towards the look
direction at up to `STEER_GRIP_RATE` °/s on the ground and
`STEER_AIR_GRIP_RATE` °/s in the air, speed kept — a "grip" so it goes where
the camera points instead of drifting; only the bounce tick itself is left
unsteered, so a bounce starts off at its computed angle), Space jumps (only with real ground contact, or off a wall in the air — see "Jumping" below). A third-person
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

## Attack boost — speed for health (implemented)

Holding the attack button (mouse1) boosts the melon: it's pushed along the
look direction at an extra `ATTACK_BOOST_ACCEL` and its speed cap rises to
`ATTACK_BOOST_MAX_SPEED` (above `MAX_SPEED`, so the speedometer's `Boosted`
state and the boost trail show too). Letting go, the cap decays back at
`BOOST_DECAY` like a wall-bounce boost. The price: while boosting, the melon
loses `ATTACK_BOOST_HEALTH_PER_SECOND` health. **High risk, high reward
(decided): there's no floor** — boost too long and the health runs out and
the melon breaks, like any other break (respawn at the last checkpoint).
While the attack boost is on, the boost trail shows from the first tick,
whatever the speed (like Rocket League); letting go it keeps going only as
long as the melon is still above the usual trail speed (see "Boost trail").
Works on the ground and in the air, not while broken or race-locked.
Constants: `movement/attack-boost/constants.js`; rule: `movement/attack-boost/logic.js`,
applied in `movement/driving/drive.js` (`test/attack-boost.test.mjs`).
The pawn must hold no weapon: the engine gives it a knife back after spawn,
and every knife swing shoved the melon ~140 u/s — a free boost without the
health cost. `HoldPawn` (`kart/spawn.js`) removes weapons every tick; with
`DEBUG` on, `dev/attack-debug.js` logs what attack does (`[attack debug]`).
That alone didn't stop the push in-game, so on top: while attack is held
and for `ATTACK_PUSH_GUARD_SECONDS` after, physics may not add horizontal
speed beyond what the script commanded last tick (`WithoutEnginePush`) —
speed then only comes from driving (W, up to `MAX_SPEED` as always) and the
paid boost.

## Momentum — top speed that grows (implemented)

Reaching the top speed again and again in quick succession raises that
melon's own top speed by `MOMENTUM_STEP` (2 % of `MAX_SPEED`) per step, as
long as it never drops below `MOMENTUM_MIN_SPEED_KMH` (30 km/h) in between —
that ends the run and it's back to plain `MAX_SPEED`. "Reaching it again"
means: the melon has fallen at least `MOMENTUM_REARM_DIP` below its current
top speed (a curve, a bump, letting go of W) and accelerated back up to it;
just holding top speed doesn't stack. A hit counts as a step only if the
previous hit was at most `MOMENTUM_HIT_WINDOW` seconds ago — the first one
(or one after a longer gap) only starts the chain. At most
`MOMENTUM_MAX_STEPS` steps. **The attack boost has no effect on it**
(decided): neither while boosting nor while the boosted speed cap decays
back (same for a wall bounce's raised cap) does reaching the top speed
count, and the run isn't broken either. Standing still, breaking and
race-locking end the run. Speed earned by momentum isn't a boost: no
`Boosted` HUD state, no boost trail. Constants: `movement/momentum/constants.js`;
rule: `movement/momentum/logic.js`, applied in `movement/driving/drive.js`
(`test/momentum.test.mjs`).

## Jumping (implemented)

- **Ground jump** needs real ground contact — **no cooldown**: touching
  down again is what resets it, and the next jump needs a ground contact
  newer than the last jump (`CanGroundJump`), so a second press right
  after taking off doesn't jump twice. Contact is measured from physics, not guessed from the
  distance to the floor: each tick the vertical velocity the script
  commanded is compared with what physics left of it. Falling freely,
  gravity takes the full `GRAVITY` (800 u/s²) off; anything holding the
  melon up cancels a clear part of that (`IsSupported`,
  `FREE_FALL_FRACTION`). A short trace down confirms the support is
  floor-like (`GROUND_NORMAL_MIN_Z`), not a wall or an edge — a line trace,
  not `TraceSphere` (a sphere probe from the melon's center found no floor
  in-engine at all, which broke jumping). So a melon a
  few units up in the air is "in the air", whatever its (egg) shape.
  `GROUND_COYOTE_TIME` (0.08 s) only bridges the tiny hops a rolling melon
  makes. (Before: a 48-unit ray down from the center counted as ground,
  plus 0.15 s grace — a melon well into a jump could jump again.)
  The floor trace (`GROUND_CHECK_DISTANCE`) is short on purpose: a resting
  melon's center is only ~7 units above the floor, and a longer trace still
  found it ~40 units up in a jump — one tick of measured support there was
  enough for a mid-air jump. Nor does ground contact count for
  `GROUND_LIFTOFF_TIME` after any jump (the floor still pushes the melon up
  for a tick while it takes off).
- **Wall jump**: in the air, touching a wall and pressing jump pushes the
  melon off the wall (`WALL_JUMP_PUSH_SPEED`, more if it's already moving
  away faster — e.g. right after a wall bounce) and up
  (`WALL_JUMP_UP_SPEED` — never slower upward than it already was: right
  after a ground jump, a bounce's kick or a jump pad launch the faster
  upward speed stays), keeping its speed along the wall. **Its strength
  is a charge** (`kart.wallJumpCharge`, shown by the HUD jump bar, which
  no longer shows a ground-jump cooldown): a wall jump is as strong as the
  charge is full and uses up `WALL_JUMP_CHARGE_COST` of it, so chained
  wall jumps get weaker (2 in a row, the second at half strength) until below `WALL_JUMP_MIN_CHARGE`
  there's none; it refills over `WALL_JUMP_RECHARGE_SECONDS` — always, also
  standing still, race-locked or broken — and is full again whenever the
  melon arrives whole (every spawn that restores full health). A wall jump
  never raises the speed cap — chaining them used to make the melon faster
  and faster. **The timing is the distance** (decided): a press only
  counts while the wall is right at the melon — a line trace in any of
  `WALL_PROBE_DIRECTIONS` (16) horizontal directions finds a steep, non-prop
  surface whose plane is within `WALL_JUMP_CONTACT_RADIUS` (10 units) of the
  melon's center, plus the distance it covers towards that wall in one tick
  (`WallContactReach`; at speed it would otherwise go from outside the
  radius into the wall and off it again between two ticks). So a press just
  before the touch counts, one on it too, and the tick after (the melon is
  pushed off a wall at once) via `WALL_JUMP_WINDOW` (0.035 s) — not some
  time later. Measured from the center because traces onto the melon's own
  surface find nothing in-engine; the radius is the melon's half size plus
  a small margin, measured with the collision debug view's distance
  readout: lying right against a wall its center is 6.7 from it, and it's
  only ~10% longer than wide (16 at first let a wall ~9 units off the
  melon's surface count). (Before: a wall anywhere within
  `WALL_CONTACT_DISTANCE`, 56, counted once physics had stopped the melon
  against it, and stayed jumpable for 0.2 s.) A wall bounce also counts as
  a contact. `WALL_JUMP_COOLDOWN`
  between two wall jumps, and one
  wall can't be climbed forever: the next wall jump needs ground contact
  first or a different wall (`WALL_JUMP_SAME_WALL_DOT`) — bouncing between
  two facing walls chains. The same press still counts as wall-bounce
  jump timing — and **while a bounce's timing window
  (`WALL_BOUNCE_PERFECT_JUMP_WINDOW`) is open it's only that**, no wall jump
  (decided): the bounce already is the reaction to the wall, and a timed
  press used to also fire a wall jump that cost charge and cut the bounce's
  upward kick. After the window, a wall jump needs the wall at the melon
  again (it has usually bounced off by then). Lift zones are the exception:
  there a wall jump is free and may follow a bounce at once.
- **Collision debug view** (`dev/collision-debug.js`, all of it in that one file):
  toggled per player in the user menu ("Collision debug: ON/OFF", off by
  default), only for that player's own melon. While on, the contact state
  is on screen every tick (`GROUND` / `AIR` / `AIR + WALL`, whether it's
  supported, the measured vertical acceleration, what the floor trace saw
  and how far below, the nearest wall's distance from the melon's center
  next to the distance that counts and the speed into it, `AT WALL` once it
  counts — read that distance off at a wall to tune
  `WALL_JUMP_CONTACT_RADIUS`), every jump press is logged to the console
  (`[collision debug] … jump pressed: …` — why it was or wasn't allowed), and
  the probes are drawn into the world (tools mode only), every tick:
  - floor trace straight down: green = ground contact, white = hit
    something but not held up by it, grey = nothing below;
  - a light grey ring = `WALL_JUMP_CONTACT_RADIUS` around the center, at its height and flat on the floor below (also on
    the ground: the wall probes run every tick while the view is on, there
    only for the view — a wall jump needs the air)
    (moving at a wall, one tick's travel is added), and the wall probes:
    grey = hit nothing, purple = hit a floor/ceiling or a prop (ignored),
    dark blue = wall too far, cyan = wall at the melon, orange = the
    nearest one at the melon, the one jumped off;
  - at the nearest wall its normal and a small orange sphere (found, too
    far), or a slightly bigger green one when it's *at the melon* this tick;
  - from the melon: blue = its velocity now (the part towards the wall
    widens the reach);
  - a green ring just outside the grey one while a wall jump is possible
    (at a wall, or within `WALL_JUMP_WINDOW` after).
- Rules: `movement/contact/logic.js` (ground/wall contact,
  `test/contact.test.mjs`) and `movement/jump/logic.js` (ground jump, wall
  jump, charge, `test/jump-logic.test.mjs`).
- Tests: those two and `test/jump.test.mjs` (the real
  `UpdateKart` against the fake engine).

## Jump pads (implemented)

A `trigger_multiple` (filtered to `prop_physics`) with `OnStartTouch` →
`RunScriptInput` `jump_pad_enter` and `OnEndTouch` → `jump_pad_leave`.
**Jump must be pressed for the timing** (decided): pressing jump while on
the pad — or up to `JUMP_PAD_BUFFER` before reaching it — launches the melon
`JUMP_PAD_UP_SPEED` up and adds `JUMP_PAD_FORWARD_BOOST` horizontal speed
along its direction of travel (the speed cap rises like after a wall bounce
and decays at `BOOST_DECAY`); driving over it without pressing does nothing.
Per pad the name can set both: `jump_pad_<up>_<forward>`. **No damage**
(decided): on the pad and from the launch until `JUMP_PAD_LANDING_GRACE`
after landing, impacts and wall hits cost nothing (`DamageKart`); the attack
boost's cost and `melon_break` still apply. Marked in the map by two
ambient particle systems (`jump_pad_rings` + `jump_pad_sparks`, lime so
they don't look like the cyan lift updraft). Constants:
`zones/jump-pad/constants.js`; rules: `zones/jump-pad/logic.js`, applied by
`zones/jump-pad/jump-pad.js` (`test/jump-pad.test.mjs`). Details for mappers:
MAPPING_API.md 4.9.

## Spawn points (implemented)

All spawn-entity lookups live in `kart/spawn-points.js`; a melon always appears
`SPAWN_UP_OFFSET` above the floor traced straight down from the entity (no
sideways offset, and exactly there — the `melon_template`'s own offset is
corrected by a teleport right after `ForceSpawn`). Keep that drop short: a
long fall lands hard enough for the engine to destroy the melon on impact.

- Picking a team first shows the Melon Racer logo
  (`logo_melon_racer.png`, `intro_logo` in `speedometer.xml`, full screen
  over a solid dark green backdrop, nothing of the world showing through) for `INTRO_LOGO_SECONDS`, the player's own body
  already frozen and hidden behind it; only then does the melon spawn
  (`ShowIntroLogoThenSpawn` in `kart/spawn.js`). Reconnecting shows it again.
- A player's very first melon (first join, i.e. no kart entry yet) appears
  at the `info_player_start` named `intro_spawn` — the tutorial area —
  facing that entity's own angles. It's also that new kart's respawn point
  until it reaches a checkpoint or is sent to the hub. Without an
  `intro_spawn`, the first spawn uses `hub_spawn`. Reconnecting counts as a
  first join again (the kart is dropped on disconnect).
- Returning to the hub uses `hub_spawn` (required — there's no fallback),
  facing `hub_spawn_facing` if placed, else `hub_spawn`'s own angles.
- The user menu's "Play Tutorial" button ("LEARNING & TUTORIAL") sends that player back to
  `intro_spawn` (or `hub_spawn` without one) the same way its "Return to
  hub" button works: it leaves a running heat, clears track progress, and
  makes that spot the kart's respawn point.
- **Full health on every spawn** (decided): wherever a melon is sent on
  purpose — the user menu's hub, tutorial and respawn buttons,
  `hub_teleport`, a heat's start and its end, a checkpoint respawn after a
  break — it arrives with `MELON_MAX_HEALTH`. Only generic teleporters
  (`melon_teleport`) keep the damage (see "Teleporters").
  `test/spawn-health.test.mjs`.
- A later `OnPlayerReset` for a player who already has a kart never spawns
  or moves a melon — it only re-freezes the pawn and re-attaches the camera.
  A lost melon is brought back solely by the break/respawn logic, at the
  kart's own respawn point, so there's exactly one path that can put it
  anywhere.
- The player's pawn is frozen (non-solid) *before* a new melon spawns, and
  stays at its own player spawn, away from the tracks.

## Melon painting (implemented)

Driving over a paint trigger recolors that player's melon — intended for the
hub, so players can pick a color while gathering before a heat, but nothing
restricts placement to there. Color config lives in the trigger's own name
(same convention as `start_<trackId>`, see above), not a hand-maintained
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

Every whole melon also has an **outline glow** in its paint color — green
(`MELON_GLOW_UNPAINTED_COLOR`) until it's first painted (the engine's
`Glow()`, like CS2's teammate outline),
switched off while it's broken so no outline floats at the crash site.
Each player switches it on/off for **their own melon** in the user menu's
"GLOW" section (below "COLOR"; `kart.melonGlow`, on by default). Everyone
sees a melon's glow the same way — the engine's `Glow()` isn't per viewer,
and the only per-viewer lever (the prop's "Glow Team") was ruled out: teams
stay out of it (decided).
`MELON_GLOW_ENABLED` (`kart/constants.js`) turns it off map-wide; applied
by `kart/look.js`.

## Teleporters (implemented)

Generic, same name-carries-the-config convention as paint triggers — adding
a teleporter is a pure Hammer edit, no script change:

1. Place the destination: any named point entity (e.g. an `info_target`),
   say `tp_dest_hub_back`. Its position is where the melon arrives (lifted
   `TELEPORT_UP_OFFSET` so it drops onto the floor instead of into it), its
   yaw is the direction it arrives facing.
2. Place a `trigger_multiple` named `teleport_to_<destination>` — here
   `teleport_to_tp_dest_hub_back` — filtered to `prop_physics` like the
   other triggers.
3. Its `OnStartTouch` fires `RunScriptInput` `melon_teleport` on the
   `point_script` entity. That parameter is the same for every teleporter;
   the destination comes from the trigger's name.
4. Optional, per teleporter: name it `teleport_stop_to_<destination>` to
   make the melon arrive standing still, or `teleport_keep_to_<destination>`
   to make it keep its speed; plain `teleport_to_` uses the
   `TELEPORT_KEEP_SPEED` default.
5. Optional, per teleporter: `checkpoint_` after the mode
   (`teleport_stop_checkpoint_to_<destination>`, `teleport_checkpoint_to_…`)
   also makes the destination the melon's **respawn point** — for the
   tutorial, so a melon that breaks further in doesn't have to run it all
   from the start again. Track progress still stays untouched.

Behavior (decided): a teleport **only moves** the melon — health, respawn
point (unless `checkpoint_`, see 5.) and checkpoint/lap progress stay as they were, so a teleporter can't
skip or reset a track's checkpoints. Keeping speed (`keep`, or the
`TELEPORT_KEEP_SPEED` default), the melon
keeps its horizontal speed, redirected along the destination's facing
(vertical speed dropped, so a teleport mid-fall doesn't slam it into the
floor); off, it arrives standing still. The player's **view is turned to
the destination's facing** too (pitch kept) — steering follows the view, so
otherwise they'd keep driving the old way. That holds for every teleport
and spawn of a melon, not just teleporters: checkpoint respawns, heat
start, hub/tutorial, the first spawn (`FacePlayerView` in
`kart/spawn-points.js`). Broken or race-locked melons
(countdown, finished) ignore teleporters. Unlike Hammer's own
`trigger_teleport`, this resets the per-tick tracking so the jump isn't
read as a hard impact or wall hit.

A trigger named wrong or pointing at a missing destination logs a
`[melon_drive] melon_teleport: …` console message, and
`test/map-io.test.mjs` fails on it in the .vmap. For sending a melon to the
hub specifically, the existing `hub_teleport` input still works (it also
takes the kart out of a running heat).

## Heal zones (implemented)

Areas where the melon regains health over time: a `trigger_multiple`
(filtered to `prop_physics`) whose `OnStartTouch` fires `RunScriptInput`
`heal_enter` and whose `OnEndTouch` fires `heal_leave`. While inside, the
melon heals every tick at `HEAL_ZONE_RATE` health/second (`health/damage/constants.js`),
or at the rate in the trigger's name if it's called `heal_zone_<rate>`
(e.g. `heal_zone_25`) — pure Hammer edit, same name-carries-the-config
convention as paint triggers. A trigger named exactly `heal_zone_full` is a
**full-heal zone**: the melon is refilled to `MELON_MAX_HEALTH` at once and
kept full while inside. All healing code (constants, rules, zones and the
full refill on respawn) lives in `src/melon_drive/health/heal/`. Capped at `MELON_MAX_HEALTH`; damage still
applies inside, and overlapping zones don't stack (the fastest counts).
Broken or race-locked melons don't heal. Teleports/respawns **keep** the
melon's zones (heal, lift, camera): landing back inside the same trigger —
e.g. respawning at a checkpoint inside the zone it broke in — sends no new
`OnStartTouch`, so clearing them lost the zone (the camera zone's zoom
reset after such a respawn); leaving a zone by teleport still sends its
`OnEndTouch`. Only a brand-new melon entity (the old one was destroyed)
starts with no zones — its own `OnStartTouch` re-adds them. Every entry into a heal
zone plays the `particle_health_template` point_template's particle effect
on the melon, riding along with it (`HEAL_PARTICLE_LIFETIME`; not for broken
or race-locked melons). That effect is `particles/melon_racer/heal_crosses.vpcf`:
a burst of glowing "+" crosses rising off the melon, the same crosses and
green/mint as the `holo_heal` gate material (`tools/make-holo.mjs`), all
gone within the 2 s lifetime. All particle effects (break burst, PERFECT spark,
heal) are spawned through `src/melon_drive/fx/particles.js`
(`test/particles.test.mjs`).

## Camera zones (implemented)

Areas where the chase camera zooms out or in: a `trigger_multiple`
(filtered to `prop_physics`) with `OnStartTouch` → `RunScriptInput`
`camera_enter` and `OnEndTouch` → `camera_leave`. The zoom comes from the
trigger's name, same convention as heal/lift zones:
`camera_zone_<distance>_<height>` (units further back / higher up than the
normal chase camera, `CAMERA_DISTANCE`/`CAMERA_HEIGHT`; negative = closer / lower; e.g.
`camera_zone_250_40`, `camera_zone_-30_0`), with a `camera_zone_noclip_…`
variant that stops walls pulling the camera in while zoomed, and a
`camera_zone_front_<ahead>_<height>` variant that puts the camera *in
front of* the melon, e.g. just above the ground (`camera_zone_front_40_0`), and a
**close-up** `camera_zone_close[_<behind>_<height>]` for dramatic passages:
the camera right up behind the melon (default `CAMERA_CLOSEUP_DISTANCE`/`_HEIGHT`,
16/4 units from its center), zooming in and out slowly
(`CAMERA_CLOSEUP_EASE_SECONDS`). Any other
name uses `CAMERA_ZONE_EXTRA_*` (`camera/constants.js`). The camera eases
over `CAMERA_ZONE_EASE_SECONDS` in and back out, never closer than
`CAMERA_ZONE_MIN_DISTANCE`; overlapping camera zones don't stack (last
entered counts), but a lift zone's zoom adds on top. Rules:
`zones/camera-zone/logic.js` (`test/camera-zone.test.mjs`), applied by
`camera/zone-zoom.js`. Details for mappers: MAPPING_API.md 4.8.

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
