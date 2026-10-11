# Changelog

Player-facing changes per release. Versions are semver, tagged `v<version>` in git.

## [0.7.0] — 2026-10-11 — Podium, Skins & Spikes

Tag `v0.7.0`.

### New
- Grand Prix: the heats from the hub's start button back to the hub are one Grand Prix. Finishers score points by place (10, 8, 6, 5, 4, 3, 2, 1, then 1 each) — most points after the last track wins. Your place shows under FINISH.
- Podium in the hub: after a Grand Prix the top three stand on the podium, with confetti and the camera looking at them.
- Scoreboard (Tab) in place of CS2's own: the Grand Prix standings, or the best times per route — A/D page through the routes.
- "Start Grand Prix" window in the hub: a card per heat with route name, icon, laps and checkpoints, and who rides along.
- DNF: a racer who reaches no new checkpoint for 60 s is out of the Grand Prix, so nobody can block a heat. The last 15 s are counted down on the HUD.
- "Exit Race" in the menu while racing: leave the Grand Prix, the others race on.
- Melon skins (menu → SETTINGS → MELON): Melon, Gold, Football, Golf, Honey Melon, Camo, Strawberry, Pumpkin, Pineapple, Zebra — saved per player.
- "Start in Tutorial" setting: join straight in the hub if you know the tutorial already.
- New route "Pipe Pump".
- Spike springs: spike traps that pop out of floors, walls and ceilings and break your melon.
- Ball pits, and balls that keep dropping in from a spawner.
- Side view: depth zones where W/S drive into and out of the screen.
- New logo (a melon slice with a MELON RACER banner), flying in on a rubber band in the intro.
- Developer pages in the menu: camera settings, physics settings, test buttons (countdown, finish, intro, podium).

### Changed
- Side Slice got new obstacles: saw blades, spike springs, a ball pit and a foam floor.
- The hub got a locker room, a first ramp and a 3D logo.
- New look for the checkpoints.
- User menu, scoreboard and hub window in the logo's colors, with square corners.
- Countdowns are now falling numbers; GO grows and fades out.
- Wall jumps: no cooldown — the next one needs a new wall contact, and a press a little too early is kept for 0.2 s.
- A jump pressed just before landing jumps on touchdown.
- Side view: only A/D drive, and the camera follows smoothly instead of jerking at walls.
- Free look: the others see a ghost avatar where you're flying.
- "Respawn at Checkpoint" comes before "Restart Time Trial" in the menu.

### Fixed
- A timed jump press on a wall bounce was sometimes taken for mashing.
- The melon fell through the foam floor on Side Slice.
- In free look your invisible body shoved balls and melons around.
- The podium tops were nearly black.

### Mapping/Dev
- Mapping API pages 18 (spike springs: `prop_dynamic` named `spike_spring…`), 19 (ball pits: `ball_pit_enter`/`_leave`) and 20 (ball spawner: `template_ball` + `spawn_ball`).
- New inputs `side_view_depth_enter`/`_leave`; podium spots `podium_spawn_1`…`_3`, `particle_podium_confetti`.
- Model generators in `tools/` (one folder per kind of output): saw blade, spike spring, bouncer, buffer stop, ball, podium, melon skins; materials in one folder per use.
- Route icons and names for the hub window are generated from the .vmap (`tools/images/make-route-icons.mjs`).
- `npm test` fails on a hub/route prefab in the map that's excluded from vis (not a vis contributor).

## [0.6.0] — 2026-10-04 — Side Slice

Tag `v0.6.0`.

### New
- New route "Side Slice": a 2D jump & run. The camera watches from the side and can't be turned, A/D drive left and right on screen, W/S along the melon's facing.
- Wall jumps in 2D sections aren't rated by angle, but go higher and further, cost no charge and chain from wall to wall.
- Jump recharge zones: all wall-jump charges refill at once and stay full while you're inside, marked by blue rings and sparks.
- Moving obstacles: blocks and platforms sliding back and forth.
- Press R to restart a time trial — no need to open the menu.

### Changed
- The Canals route was reworked.
- Respawning at a checkpoint without its own spawn point puts the melon level, facing down the track, instead of tilted.

### Fixed
- Teleported out of a 2D section (hub, checkpoint, teleporter), the camera no longer stays stuck in side view or swings across the map — it cuts straight back to the chase camera.
- A camera zone on the Bridge route didn't let go of the camera when you left it.

### Mapping/Dev
- The map is split into prefabs (hub, routes, start/finish/checkpoint/heal gates, jump pad, mover, jump refill); a gate's track is set by one map variable per copy. Mapping API page 14.
- Every checkpoint trigger fires the same input, `checkpoint`; track and index come from the trigger's name `checkpoint_<trackId>_<index>`. `start_line`/`finish_line` read the track from the trigger name the same way.
- Shared spawn markers: an `info_target` named just `start_spawn` / `checkpoint_spawn` within 1024 units of its trigger is used when there's no numbered one.
- New: `side_view_<yaw>[_<distance>[_<height>]]` zones (`side_view_enter`/`_leave`), `jump_recharge_enter`/`_leave` (page 17), `func_movelinear` named `mover`, `mover_<anything>` or `mover_wait<seconds>[_…]` (page 16).
- `npm test` names the Hammer node ID of anything it flags, checks every zone's `_enter` is on `OnStartTouch` with its `_leave` on `OnEndTouch` of the same trigger, and fails on gates whose track was never set.
- GitHub Page: Mapping API docs, gameplay GIF slider, steam://connect join link (`/connect/`).

## [0.5.0] — 2026-10-02 — Wall jumps, water & a new HUD

Commit `45ff6aa`.

### New
- Wall jumps are rated by angle like bounces: hit the wall at about 45° for a PERFECT wall jump that boosts you out faster than you came in (not in lift shafts).
- 3 wall-jump charges that refill one after the other, shown as dots next to the speedometer.
- Water: land in it and your melon loses all its speed. No wall bounces or impact damage while inside.
- Respawn triggers: fall off an open track and you're put back at your last checkpoint, no break needed.
- Time trial: the finish puts you straight back at the track's start for the next try.
- "Free look" in the menu (E): fly around the map, your melon waits where it was.
- Between heats a big countdown shows when the next track starts.

### Changed
- New speed panel with a health bar, tilted back into the screen.
- The camera now slides in smoothly at walls instead of jumping, and eases back out.
- Breaking: the melon freezes at the crash site, the break camera stays closer, and a hit that's already lethal breaks the melon at the wall instead of mid-air.
- Wall jumps keep your upward speed, need the wall right at the melon (tighter contact), and charges always refill. A jump press during a bounce only times the bounce.
- A bounce's upward kick no longer stacks in narrow shafts; mashing jump only locks timing credit when the presses did nothing.
- Hub waiting text in English; checkpoint numbers centered in the checkpoint strip.
- No money awards in the HUD/round flow anymore.

### Fixed
- A breaking melon no longer gets shoved around by its own pieces.
- A new player in a slot no longer inherits the last player's open menu or HUD state.

### Mapping/Dev
- New inputs: `water_enter`/`water_leave`, `melon_respawn`.
- Collision debug view and free look in the user menu.
- `WALL_BOUNCE_ENABLED` switch; `src/melon_drive/` restructured into domain/feature folders, tests into `test/<domain>/`.
- Mapping API split into `docs/mapping-api/`, `TRACK_CREATION.md` moved to `docs/`.

## [0.4.0] — 2026-09-30 — Time trial

Commit `7a50fd0`.

### New
- Time trial: every run over a track is timed, alone or in a heat. The clock and your best time sit top left; your best time per track is saved.
- Beat your best and you get a gold NEW BEST.
- "Restart Time Trial" in the menu (E) puts you back at the start line (only while on a track, not in a heat).
- Checkpoint strip at the top: which checkpoints you've passed, which one is next, lap counter below.
- Tracks can now go from A to B, not just in loops.
- Green "+" crosses rise off the melon when it heals.

### Changed
- After breaking you respawn at the checkpoint's own spawn point, facing down the track.
- PERFECT bounces are a bit easier to hit (±8.5°) and kick you 20 % higher.

### Mapping/Dev
- `start_<trackId>[_laps<n>]` / `finish_<trackId>` triggers, `start_spawn_<trackId>` and `checkpoint_spawn_<trackId>_<index>` info_targets.
- Checkpoint teleporters (`teleport_…checkpoint_to_<dest>`) set the respawn point, e.g. for the tutorial.
- `holo_heal` and `holo_checkpoint` hologram textures.

## [0.3.0] — 2026-09-29 — Jump pads, momentum & boost

Commit `96a1c3a`.

### New
- Jump pads: press jump on a pad to launch high and fast, no damage on the way down. Marked by lime rings and sparks.
- First race track.
- Momentum: keep hitting top speed and your top speed keeps growing.
- Boost: hold the left mouse button for extra speed and a glowing trail with juice droplets — it costs health, hold it too long and the melon breaks.
- Lift shafts: bounce between the walls of a shaft to climb up, with updraft particles and a camera that pulls back.
- Full-heal zones, and heal zones play an effect on entry.
- Your melon glows in its paint color (toggle in the menu).
- Guide line: a per-player prediction line for wall bounces, switched on in the menu.
- Kill triggers that break the melon at once.
- "Learning & Tutorial" section with a "Play Tutorial" button in the menu.
- Floor decals in the tutorial (logo, press USE, jump, arrows, wall jump, attack for boost).

### Changed
- Every respawn brings you back at full health.
- Flat landings on level ground hurt more than landing on a slope.
- Camera zones zoom the camera out, in, in front of the melon or close up behind it.
- The default CS2 HUD is hidden; the menu has a hologram look.
- Break camera rises less when pulling back.

### Fixed
- Respawning or teleporting inside a zone no longer loses that zone (e.g. its camera zoom).
- Clicking no longer pushed your melon forward for free.

### Mapping/Dev
- New inputs: `lift_enter`/`lift_leave`, `camera_enter`/`camera_leave`, `jump_pad_enter`/`jump_pad_leave`, `melon_break`, `heal_zone_full`.
- Camera presets dropped from the user menu.

## [0.2.0] — 2026-09-27 — Tutorial, wall bounces & melon breaking

Commit `7091150`.

### New
- Tutorial area: new players start there, after the Melon Racer logo.
- Wall bounces: hit a wall at about 45° for a PERFECT bounce with more speed and no damage; time a jump on the hit for even more. Rating, angle and jump timing on a HUD panel.
- PERFECT spark effect at the wall and on the melon.
- Wall jumps with a charge.
- Melons break apart visibly — burst, chunks lying on the ground — before respawning.
- Finish image when you cross the line.
- Heal zones that restore health over time.
- Teleporters, with "stop" or "keep speed" per teleporter; your view turns to face the way you arrive.
- Redesigned user menu with a "Play Tutorial" button.

### Changed
- Players spawn as melons right when they join a team; the frozen body stays at its spawn.
- Steering grip: holding W turns your melon towards where you look.
- Ground contact is measured from physics, so you can only jump with real ground under you.
- Slower acceleration, max health 70.

### Fixed
- Race-flow crashes, melon respawn and checkpoint sequencing.
- Spawn height, hub entry and the hub lineup.
- Melons no longer bounce off walls mid-air by mistake.

### Mapping/Dev
- Mapping API documented; unit tests (`npm test`).
- New inputs: `heal_enter`/`heal_leave`, `melon_teleport`, `hub_teleport`.

## [0.1.0] — 2026-09-26 — First version

Commit `3cd741c`.

### New
- Every player drives their own physics melon: steer with the mouse, W/S to accelerate/brake, A/D to strafe, Space to jump, third-person chase camera.
- Melon health: hard crashes and landings damage it; at zero it breaks and respawns at the last checkpoint.
- Hub with a start area, heats with a 3-2-1 countdown, checkpoints and laps, then the next track.
- Moderator (first player on the map) can cancel a running race.
- Paint pads and a color choice in the menu.
- User menu (E).
