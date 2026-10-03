# melon_racer — Agent Guide

CS2 Hammer addon for a custom **racing map** ("Melon Racer"). This is a
Workshop Tools content addon, not a normal source-code repo: most of the
"real" content lives in binary/KeyValues3 assets edited through Hammer, and
the only parts an agent can freely own as plain text are the `cs_script`
JavaScript files described below plus a few KV3 data files.

@GAMEPLAY.md

This file covers the CS2 engine/`cs_script` API and addon-editing rules.
Everything about the game itself — concept, round flow, checkpoint/timing
logic, open design questions — lives in [GAMEPLAY.md](GAMEPLAY.md) (imported
above, so it's always loaded together with this file). Put gameplay-design
changes there, not here. For the Hammer-side steps to build a new track
(entity names, triggers, I/O wiring) rather than the design rationale, see
[TRACK_CREATION.md](docs/TRACK_CREATION.md). The full map↔script contract —
every entity name, name pattern and `RunScriptInput` parameter the script
knows — is the [Mapping API](docs/mapping-api/README.md), one page per topic
with tables for names, patterns and values: when you add, rename or remove
one in `src/`, update its page and the index tables there too, and a changed
tunable's value in its page's "Values" table (`test/map/mapping-api-doc.test.mjs` checks
the `*_NAME`/`*_NAME_PATTERN` constants and script inputs are listed, and that
every link and `#anchor` between the pages resolves).

Current addon contents:

```
docs/TRACK_CREATION.md                   # step-by-step Hammer guide for a new track
docs/valve/scripting_api.html            # saved copy of Valve's cs_script API wiki page (the site blocks automated fetches)
docs/mapping-api/*.md                    # Mapping API (map↔script contract): README.md = index of every input/name/pattern,
                                          #   01-…14-*.md one page per topic, each with setup / name-variant / "Values" tables
maps/melon_racer.vmap                    # main map (binary DMX, Hammer-authoritative)
maps/content_examples/lighting_info.vmap
maps/scripts/*.js                        # AUTO-GENERATED bundle output, see below — don't hand-edit
maps/scripts/point_script.d.ts           # cs_script API type declarations (copied from cs_script_demo)
postprocess/melon_racer.vpost            # post-processing volume settings (KV3)
postprocess/basic_linear_post.vpost
soundevents/soundevents_addon.vsndevts   # sound event defs (KV3)
sounds/*.wav                             # ambience: birds, interior, vent
src/tsconfig.json                        # editor tooling config for src/**/*.js (references ../maps/scripts/point_script.d.ts)
src/gamemode/index.js                    # gamemode entry: a single small file
src/melon_drive/index.js                 # melon_drive entry — wiring only: tick loop, hot-reload snapshot, each domain's Register*Inputs()
src/melon_drive/<domain>/                # one folder per domain, each with an index.js (its public API); bigger
                                          #   domains have one subfolder per feature (see "Folder layout" below):
                                          #   core/      kart-registry.js (Kart type, karts map, moderator), think.js (per-tick driver), trace.js, debug.js
                                          #   kart/      spawn.js (melon spawn, frozen pawn, intro logo), spawn-points.js, teleport.js (checkpoint respawn,
                                          #              generic teleport), look.js (paint color + outline glow), inputs.js (player reset/disconnect, melon_paint)
                                          #   movement/  driving/ (drive.js = UpdateKart, the per-tick order; steering), contact/ (floor/wall probes),
                                          #              jump/, wall-bounce/, attack-boost/, momentum/
                                          #   health/    damage/ (impacts, flat landings), breaking/ (break, effects at the crash site, respawn, melon_break),
                                          #              heal/ (heal zones, full health on respawn)
                                          #   zones/     registry.js (which zones a melon is in, the WallRules that follow), inputs.js (every *_enter/*_leave),
                                          #              lift/, jump-pad/ (launch + no-damage flight), camera-zone/, water/ (stop on entry, no impacts inside),
                                          #              teleport/ (melon_teleport)
                                          #   race/      track-config.js (tracks from trigger names), checkpoints/ (progress, start_/checkpoint_/finish_ inputs),
                                          #              time-trial/ (run clock + saved best times), heat/ (hub/countdown/racing/break flow, hub inputs)
                                          #   camera/    follow/ (chase camera, the only SetFollowConfig), wall-clip/ (eased pull-in at walls), break-zoom/, lift-zoom/, zone-zoom/
                                          #   hud/       layout.js (the custom_hud_layout), one file per panel: speedometer.js (speed panel: km/h, health bar, jump dots), bounce-panel.js,
                                          #              track.js (time trial + checkpoint strip), hub-modal.js, user-menu.js; inputs.js (every button click)
                                          #   fx/        particles.js (spawning/placing/starting/stopping/removing every point_template particle effect),
                                          #              boost-trail/, prediction/ (the guide line)
                                          #   dev/       collision-debug.js (the user-menu collision debug view), free-look.js (the user-menu free look), attack-debug.js
src/melon_drive/constants/index.js       # re-exports every folder's constants.js (tunables + Hammer names) — import constants from here
test/<domain>/*.test.mjs                 # node:test tests (`npm test`), one folder per src/melon_drive/ domain (movement/, race/, …): unit tests
                                          #   for the pure files, engine-side tests against the fake engine (filed under the domain they're mainly about)
test/map/*.test.mjs                      # checks of the .vmap/.xml/docs/mapping-api/ the script relies on, and module-layout.test.mjs (the folder rules below)
test/helpers/vmap.mjs                    # minimal binary-DMX reader so tests can check .vmap entities
test/helpers/cs-script-mock.mjs          # fake "cs_script/point_script" (+ register-cs-script.mjs hook) for testing engine-side files
test/helpers/fake-hud.mjs                # fake custom_hud_layout: per-slot classes, dialog variables, input capture
build.mjs, package.json                  # Rollup build wiring src/ -> maps/scripts/*.js
tools/make-icons.mjs                     # generates panorama/images/custom_game/icons/*.png (user menu icons, checkpoint strip flags) — edit shapes there, re-run with node
tools/png.mjs                            # the PNG encoder make-icons.mjs uses
tools/make-decal.mjs                     # generates materials/melon_racer/<decal>_{color,trans}.png for every decal in its DECALS list
                                          #   (HUD logo, rawDecals/*.png|jpg — JPG via Windows System.Drawing; can key out a baked-in checkerboard, writes <name>_transparent.png)
rawDecals/*.png                          # new source images for decals (make-decal.mjs input); once done, the tool moves
                                          #   them (+ their _transparent.png) to rawDecals/done/ and reads them from there
particles/melon_racer/*.vpcf             # the addon's own particle effects (KV3, hand-written): boost_trail + boost_trail_juice (two separate info_particle_systems in one template — a child system doesn't render);
                                          #   rising_dust (ambient, not script-driven — a map-placed info_particle_system, Start Active;
                                          #   square specks from materials/melon_racer/particle_square.vtex + .png, a 16x16 white square);
                                          #   lift_updraft + lift_updraft_streaks (ambient, same way: two info_particle_systems at the bottom of a lift shaft —
                                          #   soft swaying glow motes + faint fast rising air streaks);
                                          #   jump_pad_rings + jump_pad_sparks (ambient, same way: two info_particle_systems on a jump pad —
                                          #   flat lime rings shooting up and widening + fast rising lime sparks);
                                          #   heal_crosses (script-driven, the effect in particle_health_template: a burst of
                                          #   rising "+" crosses in holo_heal's green/mint, sprite particle_heal_cross.vtex from tools/make-holo.mjs)
                                          #   Write the editor source format, not resourceinfo's compiled dump — see the comments in boost_trail.vpcf;
                                          #   compile with resourcecompiler.exe (-f) like Panorama
materials/melon_racer/*_decal.vmat       # decals (csgo_static_overlay, translucent): logo_melon_racer_decal, press_use_decal, jump_decal, arrow_decal, wall_jump_decal, attack_for_boost_decal — textures from make-decal.mjs
```

`src/<entry>/` is where gameplay code goes — one directory per `point_script`
entity (currently `src/melon_drive/` and `src/gamemode/`), with `index.js` as
that entry's actual module entry point, kept a thin wiring layer over
`Instance.On*`/`OnScriptInput` registration. Import between files as normal
ES modules, plus `import ... from "cs_script/point_script"` as usual — that
specifier is a virtual module the CS2 engine provides at runtime, not a real
package, so leave it as a bare import. A JSDoc-only type from another file
(no runtime import needed) is referenced as
`@param {import("../core/kart-registry.js").Kart}`.

### Folder layout (`src/melon_drive/` is the reference)

- **Domains, then features, at most two levels.** Each top-level folder is a
  domain (`kart/`, `movement/`, `race/`, …, see the tree above); a domain
  that holds several mechanics has one subfolder per feature
  (`movement/wall-bounce/`, `zones/jump-pad/`, …). Nothing but `index.js`
  sits loose in `src/melon_drive/` (`test/map/module-layout.test.mjs`).
- **Every feature folder has the same shape** (`health/heal/` is the
  reference): `constants.js` (tunables, Hammer names), `logic.js` (pure
  rules), engine-side files named by what they do, `inputs.js` exporting a
  `Register…Inputs()` for its `OnScriptInput`s, and an `index.js` for its
  public API where it has more than one consumer. A folder with several pure
  rule files names them `<topic>-logic.js` next to the engine file they
  serve (`hud/track.js` ↔ `hud/checkpoint-strip-logic.js`) — but when a
  domain's mechanics each get their own rules, they get their own folders
  instead (`camera/lift-zoom/`, `camera/wall-clip/`, …).
- **A new feature is a new folder** in the fitting domain, registered
  through that domain's `index.js` (inputs) or `core/think.js` (per-tick
  update) — nothing else central needs to change. Add its `constants.js`
  to `constants/index.js`.
- **Each domain's `index.js` is its public API** — other domains and tests
  import from it, except where that would close an import cycle (e.g.
  `hud/speedometer.js` takes `GetWallJumpCharges` straight from
  `movement/jump/jump.js`); Rollup prints `Circular dependency` warnings on
  `npm run build` — keep it free of them.

### Build step: `src/` -> `maps/scripts/*.js`

Hammer's own `.js` -> `.vjs_c` compiler does **not** resolve local imports —
it just compiles the single file a `point_script` entity's `cs_script` field
points at. So a Rollup bundler step (`build.mjs`, wired via `npm run build` /
`npm run watch`, `node_modules` gitignored) turns each `src/<entry>/index.js`
tree back into one flat file at `maps/scripts/<entry>.js`, which is the file
Hammer/tools-mode actually reads. `cs_script/point_script` is marked
`external` so that import passes through untouched instead of being
inlined/resolved.

**Implication for editing: change `src/<entry>/index.js` (or its
submodules), never `maps/scripts/<entry>.js` directly** — the latter is
overwritten by the next build and carries an `AUTO-GENERATED` banner. Run
`npm run build` after editing `src/` so the compiled file Hammer/tools-mode
reads is current; `npm run watch` rebuilds on save for iterating against
tools-mode hot reload. The bundler is Rollup because it keeps this
codebase's comments in the output (esbuild strips plain comments even
unminified). Tree-shaking is disabled in `build.mjs`
since each entry is a whole program, not a library with dead exports to
prune, and shaking risks quietly restructuring constant-folded branches
(e.g. `if (DEBUG)`) away from what the source says.

## Gameplay logic = `cs_script` (plain JavaScript)

CS2's scripting system is **`cs_script`**: plain JavaScript modules attached
to `point_script` entities (not Squirrel VScript like Dota 2). The local
example addon at `content/csgo_addons/cs_script_demo/maps/scripts/` is the
best reference — when in doubt, read its `.js` files and `point_script.d.ts`
rather than guessing.

The API reference is `maps/scripts/point_script.d.ts`, a copy of the demo
addon's: Valve maintains that one as the API changes, so when the demo's
copy is newer, copy it over (it's types only — `npm test`/`npm run build`
don't read it). The wiki page
(https://developer.valvesoftware.com/wiki/Counter-Strike_2_Workshop_Tools/Scripting/API)
has the same content in tables, with a few extra notes (e.g. `Delay` and
`SetNextThink` land on the *nearest* tick, earlier or later). It blocks
automated fetches, so a saved copy lives at
[docs/valve/scripting_api.html](docs/valve/scripting_api.html) — read that
instead; if it looks older than the d.ts, ask the user to save it again.

### How it fits together

- Write a `.js` file that does `import { Instance, ... } from "cs_script/point_script"`.
- Place a `point_script` entity in the `.vmap` (via Hammer) and set its
  **cs_script** field to the compiled `.vjs` asset for that file (Hammer
  compiles `.js` → `.vjs_c` at map build/load time — you don't invoke a
  compiler by hand).
- When the `point_script` entity spawns, the top-level scope of the file
  runs once; everything else happens through callbacks registered on
  `Instance`.
- **Each `point_script` entity gets its own `Instance`, its own globals, and
  its own set of entity-variable identities.** A script error in one doesn't
  take down the others, so independent subsystems get their own. This addon
  has two: `gamemode` (cvars, teams, no damage) and `melon_drive_script`
  (everything tied to the karts — driving, checkpoints, race flow, HUD,
  effects — since those share kart state).
- Entity variables are reference-stable: two JS variables pointing at the
  same game entity are `===`. Extra properties attached to an entity
  variable persist as long as you keep fetching the *same* variable, but a
  fresh `FindEntityByName` call returns an object that may not carry
  properties you stuffed onto a previous lookup — cache the variable, don't
  re-look-it-up-and-expect-state.
- **Tools mode**: saving a `.js` file hot-reloads it — clears that script's
  registered callbacks and re-runs its top-level scope, but *module-level
  variables persist across the reload* (danger: stale references to
  previous-iteration closures/entities). Use `Instance.OnScriptReload({
  before, after })` to snapshot/restore state you care about across a
  reload (see `trace.js` in the demo addon for the pattern).

### Core `Instance` API (from `point_script.d.ts`)

- **Logging/debug** (debug draws only work in dev environments):
  `Msg`, `DebugScreenText`, `DebugLine`, `DebugSphere`, `DebugBox`.
- **Persistence**: `SetSaveData(string)` / `GetSaveData()` — synchronous
  read/write to disk, scoped to the addon. Holds the time trial's best
  times (`race/time-trial/`).
- **Scheduling**: `SetThink(fn)` + `SetNextThink(time)` (tick-driven, time
  in `GetGameTime()` units), `Delay(seconds)` (returns a `Promise`),
  `QueueAfterThinks(fn)` (runs once after all entities'
  think functions this tick).
- **Lifecycle**: `OnActivate(fn)` (point_script activated),
  `OnScriptInput(name, fn)` (fires when the point_script entity receives a
  Hammer I/O `RunScriptInput` input whose parameter matches `name` — this
  is how Hammer trigger outputs call into script), `OnScriptReload(...)`.
- **Player lifecycle**: `OnPlayerConnect`, `OnPlayerActivate`,
  `OnPlayerDisconnect` (gets only `playerSlot` — the controller is gone),
  `OnPlayerTeamChanged` (`{ player, oldTeam }`), `OnPlayerReset` (fires on
  every spawn, team change and round restart). In this addon `OnPlayerReset` only re-freezes the pawn
  and re-attaches the camera; it never spawns or moves a melon (see
  GAMEPLAY.md, "Spawn points").
- **Round lifecycle**: `OnRoundStart`, `OnRoundEnd`, `OnBeginRoundRestart`.
- **Combat/movement events** (mostly irrelevant to a pure race map, but
  available): `OnModifyPlayerDamage`, `OnPlayerDamage`, `OnPlayerKill`,
  `OnPlayerJump`, `OnPlayerLand`, `OnPlayerChat`, `OnPlayerPing`,
  `OnGunReload`, `OnGunFire`, `OnBulletImpact`, `OnWeaponDrop/Pickup`,
  `OnGrenadeThrow/Bounce`, `OnKnifeAttack`, bomb events. `gamemode`'s
  `OnModifyPlayerDamage` returns `{ abort: true }`: players take no damage
  at all.
- **Entity I/O bridge** (this is the JS equivalent of classic Source
  `EntFire`/`AddOutput`): `EntFireAtName`/`EntFireAtTarget` to fire an
  entity's input from script, `ConnectOutput(target, output, callback)` /
  `DisconnectOutput(id)` to react to a Hammer entity output from script.
- **Finding entities**: `FindEntityByName`/`FindEntitiesByName`,
  `FindEntityByClass`/`FindEntitiesByClass`, `GetPlayerController(slot)`,
  `GetAllPlayerControllers()` (includes disconnected players).
- **Tracing**: `TraceLine`, `TraceSphere`, `TraceBox`, `TracePlayer`,
  `TraceBullet` — for ground checks, respawn placement and collision logic
  beyond what triggers give you. Two engine limits: a `TraceSphere` started
  at a prop's center finds nothing, and no trace can hit the melon's own
  surface — so contact probes are `TraceLine`s, and contact with the melon
  is measured from velocity (`movement/contact/`). The fake engine in tests
  can't reproduce either.
- **Game state**: `GetGameTime()`, `IsWarmupPeriod()`, `IsFreezePeriod()`,
  `IsTeamIntroPeriod()`, `IsDedicatedServer()`, `GetGameMode()`/`GetGameType()`,
  `GetRoundRemainingTime()`/`SetRoundRemainingTime()`, `GetRoundsPlayed()`,
  `GetMapName()`.
- **Commands**: `ClientCommand(slot, cmd)`, `ServerCommand(cmd)`,
  `RegisterCheatCommand(name, fn)` (only fires with `sv_cheats 1` — good for
  dev/test commands, not shipped gameplay).

### Class hierarchy (all imported from `"cs_script/point_script"`)

`Entity` (base: `GetAbsOrigin/GetAbsAngles/GetAbsVelocity`,
`Teleport({position,angles,velocity,angularVelocity})` — resets client
interpolation, use for checkpoint resets — `Move(...)` — same but keeps
interpolation, use for smooth scripted motion —, `GetMoveType`/`SetMoveType`,
`GetHealth`/`SetHealth`, `TakeDamage`, `Kill`, `Remove`, `IsValid`,
`IsWorld`, `GetGroundEntity`, `SetParent`/`GetParent`)
→ `BaseModelEntity` (`SetModel`, `SetModelScale`, `SetColor`,
`Glow`/`Unglow`)
→ `CSWeaponBase` → `C4`.
Also from `Entity`: `CSGrenadeProjectileBase`, `CSPlantedC4`.
Also from `Entity`: `CSRadarPoint` (an icon on the radar/overview, per
team) and `CSObservablePoint` (something spectators can watch).
Also from `BaseModelEntity`: `CSObserverPawn`, `CSPlayerPawn` (movement
input state via `IsInputPressed`/`WasInputJustPressed`/`WasInputJustReleased`
+ `CSInputs` bitflags, weapon access incl. `DestroyWeapons()`,
`SetEyeAngles(angles)` to turn the player's view, `GetCustomCamera()`).
`CSPlayerController extends Entity` (`GetPlayerSlot`, `GetPlayerName`,
`GetPlayerPawn`, `GetScore`/`AddScore`, `JoinTeam`, money functions) — the
persistent per-client identity; **pawn** is the physical body that respawns.
`PointTemplate extends Entity` — `ForceSpawn(origin?, angle?)`: spawns a
Hammer `point_template`'s entities. Each spawned entity keeps its Hammer
offset from the template, so script moves the copies into place afterwards
(`fx/particles.js`). Used for every player's melon (`melon_template`) and
every particle effect.
`CustomPlayerCamera` — scripted camera control via
`SetMode`/`SetFollowConfig` (modes: `DISABLED`, `CONTROLLED`,
`CONTROLLED_POSITION`, `FOLLOW_POSITION`). The chase camera is
`FOLLOW_POSITION` on the melon (`camera/follow/follow.js`). `CameraFollowConfig`:
`followEntity`, `followOffset` (from its origin, or eyes with `followEyes`),
`cameraOffset` (rotated by the eye angles: x forward, y left, z up),
`clipCameraOffset` (pull the camera in at walls) and
`cameraOffsetReturnStrength` (how fast it returns after being pulled in —
default 1, instant).
`CustomHudLayout extends Entity` — see next section.

### Custom HUD (`custom_hud_layout`)

CS2 supports a scripted custom UI via Panorama, wired through the same
`cs_script` system. This addon's whole HUD is one layout: `speed_hud` with
`speedometer.xml`/`.css` (driven from `hud/`).

- Layout: `panorama/layout/custom_game/<name>.xml` (compiles to `.vxml`).
- Style: `panorama/styles/custom_game/<name>.css` (compiles to `.vcss`).
- Panorama files (and images only referenced from CSS) are **not**
  recompiled on save: after an edit, compile them with `resourcecompiler.exe`
  from `game/bin/win64`
  (`-game csgo -addon melon_racer -i "<path to the .css/.xml under content/>"`,
  add `-f` if it reports "skipped"), then reload the map.
- Supported tags only: `<Panel>` (`id`, `class`, `hittest`), `<Label>`
  (+ `text`), `<Image>` (+ `src`, `texturewidth`, `textureheight`),
  `<Button>` (`id`, `class` only). No client-side scripting or events
  inside the layout itself — all interactivity goes through `Instance`.
- The engine sets these classes on an ancestor panel, for CSS to react to:
  `HUD_TEAMINTRO_VISIBLE`, `HUD_BUYMENU_VISIBLE`, `HUD_SCOREBOARD_VISIBLE`,
  `HUD_WINPANEL_VISIBLE`, `HUD_ENDOFMATCH_VISIBLE` (e.g.
  `.HUD_SCOREBOARD_VISIBLE #some_panel { opacity: 0; }`).
- Place a `custom_hud_layout` point entity in the map, set its `layout`
  property to the `.vxml` asset.
- Drive it from script: `SetHasClass`/`SetHasClassForPlayer`,
  `SetDialogVariableString`/`...ForPlayer` (for text like a timer value),
  `SetInputCaptureEnabled` (mouse-driven menus), and listen for clicks via
  `Instance.OnCustomHudClicked`. `Reset()`/`ResetForPlayer(slot)` drop the
  overrides again. All per-player state is kept **per slot**, not per
  player, so `OnPlayerDisconnect` resets the slot (`ResetHudForPlayer` in
  `hud/layout.js`) — otherwise the next player in that slot inherits it.
- See `cs_script_demo`'s `welcome_layout` (`custom_hud_layout` entity) +
  `panorama/layout/custom_game/welcome.xml` + `.../welcome.css` +
  `maps/scripts/setup.js` for a complete worked example (dismissible dialog
  driven entirely from script).

### Local reference material

`content/csgo_addons/cs_script_demo/maps/scripts/` has full working
examples — read these instead of guessing signatures:
- `hello.js` — minimal script.
- `setup.js` — player-join flow, `OnModifyPlayerDamage`/`OnPlayerDamage`,
  `CustomHudLayout` usage, `RegisterCheatCommand`.
- `input.js` — reading player movement input (`CSInputs`,
  `IsInputPressed`/`WasInputJustPressed`) — directly relevant to any custom
  racer-vehicle-feel input handling.
- `mdlchange.js` — `OnScriptInput` pattern for triggering behavior from
  Hammer I/O, prop model/scale/glow changes.
- `trace.js` — all five trace types, vector math helpers, and the
  `OnScriptReload` save/restore pattern.
- `grenadetraining.js` — `EntFireAtName` used extensively to drive Hammer
  logic entities (`logic_timer`, `logic_relay`, teleports, world text) from
  script — the closest existing example to a checkpoint/round-timer flow.

## Generic scripting pattern used throughout this addon

- **Triggers as the backbone**: `trigger_multiple` outputs
  (`OnStartTouch`/`OnEndTouch`) call `RunScriptInput` on the
  `melon_drive_script` `point_script`, handled via
  `Instance.OnScriptInput(name, ...)` — the standard way Hammer geometry
  drives script logic (see `mdlchange.js`, `grenadetraining.js`). Every
  input this addon has (checkpoints, zones, teleporters, …) is listed in the
  [Mapping API](docs/mapping-api/README.md).

## Editing rules for this addon

- `maps/*.vmap`, `postprocess/*.vpost`, `soundevents/*.vsndevts` are
  Hammer-authoritative (the `.vmap` is binary DMX, not hand-editable text at
  all; the `.vpost`/`.vsndevts` files are KV3 text but get reformatted by
  Hammer on save). Make geometry/entity/postfx/soundevent changes in Hammer
  itself; only hand-edit the KV3 files for small targeted additions and
  expect the next Hammer save to reformat them.
- `src/<entry>/*.js` are plain text and fully agent-owned — normal code,
  normal editing rules apply. `maps/scripts/*.js` are generated from them
  (see "Build step" above) — edit `src/`, then `npm run build`, never the
  generated files directly. `point_script.d.ts`/`src/tsconfig.json` give
  editors type-checking against the real API; keep them in sync if Valve
  updates the demo addon's copies.
- **Pure logic goes in the feature's `logic.js` (or `<topic>-logic.js`),
  with tests.** Game rules that are just math/state transitions (no traces,
  entities, HUD calls) live in those files, which — like every
  `constants.js` — must **not** import `cs_script/point_script` (or any
  file that does — only other `constants.js`/`logic.js`/`*-logic.js` files
  and `constants/index.js`), so Node can load them;
  `test/map/module-layout.test.mjs` enforces it. The engine-side files next to
  them call into them and handle the side effects (e.g.
  `race/checkpoints/checkpoints.js` logs/`FinishKart`s based on the result
  string `ApplyCheckpointTouch` returns). Each has a `test/<domain>/<name>.test.mjs`
  using the built-in `node:test` runner — run `npm test` after touching
  them, and add/adjust a test when changing a rule. Write assertions in
  terms of the constants (`WALL_BOUNCE_OPTIMAL_ANGLE`, ...) rather than
  their current values, so retuning a `constants.js` doesn't break tests.
- **Engine-side files can be tested against a fake engine** when a rule
  spans them (e.g. `test/kart/view-facing.test.mjs`: every teleport/spawn path
  turns the player's view): `import "./helpers/register-cs-script.mjs"`
  first, then load `src/` files with dynamic `await import(...)` —
  `cs_script/point_script` resolves to `test/helpers/cs-script-mock.mjs`,
  whose `world` holds fake entities (`Entity`, `CSPlayerPawn`,
  `PointTemplate`) and records every `Instance.On*` registration in
  `world.handlers`. It's a stub, not a simulation (traces never hit,
  `Delay` resolves immediately) — prefer pure `logic.js` tests, and extend
  the mock only as far as a test needs.
- Beyond that, verifying a gameplay change means loading the map in Hammer
  / launching CS2 in-game (`map melon_racer`), which only the user can do.
  Don't claim a gameplay change "works" without that manual check having
  happened.
