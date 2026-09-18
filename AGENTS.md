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
[TRACK_CREATION.md](TRACK_CREATION.md).

Current addon contents:

```
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
src/melon_drive/index.js, *.js           # melon_drive entry: split into one file per concern —
                                          #   constants.js, debug.js, kart-registry.js, track-config.js,
                                          #   camera.js, hud.js, race-flow.js, kart-spawn.js, kart-physics.js,
                                          #   checkpoints.js, think.js — index.js just wires them together
build.mjs, package.json                  # Rollup build wiring src/ -> maps/scripts/*.js
```

`src/<entry>/` is where gameplay code goes — one directory per `point_script`
entity (currently `src/melon_drive/` and `src/gamemode/`), with `index.js` as
that entry's actual module entry point. Split a growing entry into multiple
files under its directory (melon_drive.js's split above is the reference
example — constants and small cross-cutting helpers get their own file,
`index.js` stays a thin wiring layer over `Instance.On*`/`OnScriptInput`
registration) and import between them as normal ES modules, plus `import ...
from "cs_script/point_script"` as usual — that specifier is a virtual module
the CS2 engine provides at runtime, not a real package, so leave it as a bare
import. A JSDoc-only type from another sibling file (no runtime import
needed) is referenced as `@param {import("./other-file.js").TypeName}`.

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
tools-mode hot reload. Rollup (not esbuild) was chosen specifically because
it preserves this codebase's comments through bundling — esbuild strips
plain comments even unminified. Tree-shaking is disabled in `build.mjs`
since each entry is a whole program, not a library with dead exports to
prune, and shaking risks quietly restructuring constant-folded branches
(e.g. `if (DEBUG)`) away from what the source says.

## Gameplay logic = `cs_script` (plain JavaScript), not VScript/Squirrel

**Correction:** an earlier version of this file assumed CS2 used Squirrel
VScript (the Dota 2 / Source 2 convention). That's wrong for CS2. The real
system, confirmed from the local example addon at
`content/csgo_addons/cs_script_demo/maps/scripts/`, is **`cs_script`**: plain
JavaScript modules attached to `point_script` entities. That example addon
is the best local reference — when in doubt, read its `.js` files and
`point_script.d.ts` rather than guessing.

Wiki reference (may need the user to paste content — see note below):
https://developer.valvesoftware.com/wiki/Counter-Strike_2_Workshop_Tools/Scripting/API

**Note on the wiki:** developer.valvesoftware.com is behind an Anubis
anti-bot JS proof-of-work challenge and returns a challenge page to
automated fetches from this environment. Don't rely on fetching it — the
local `point_script.d.ts` (copied into `maps/scripts/`) is the authoritative,
up-to-date type declaration file for this exact API and should be preferred
over the wiki anyway per its own header comment: *"This file will be
maintained as the cs_script API changes... Please send feedback..."*

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
  its own set of entity-variable identities.** A multi-file/multi-system map
  (checkpoints, HUD, prop spawning, ambience) can either share one
  `point_script` importing everything, or use several `point_script`
  entities — prefer one per independent subsystem so a script error in one
  doesn't take down the others.
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
  read/write to disk, scoped to the addon. Good fit for best-lap-time
  storage.
- **Scheduling**: `SetThink(fn)` + `SetNextThink(time)` (tick-driven, time
  in `GetGameTime()` units), `Delay(seconds)` (returns a `Promise`),
  `QueueAfterThinks(fn)` (experimental — runs once after all entities'
  think functions this tick).
- **Lifecycle**: `OnActivate(fn)` (point_script activated),
  `OnScriptInput(name, fn)` (fires when the point_script entity receives a
  Hammer I/O `RunScriptInput` input whose parameter matches `name` — this
  is how Hammer trigger outputs call into script), `OnScriptReload(...)`.
- **Player lifecycle**: `OnPlayerConnect`, `OnPlayerActivate`,
  `OnPlayerDisconnect`, `OnPlayerReset` (spawn/team-change/round-restart
  placement — the natural hook to reset a racer to their last checkpoint).
- **Round lifecycle**: `OnRoundStart`, `OnRoundEnd`, `OnBeginRoundRestart`
  (experimental).
- **Combat/movement events** (mostly irrelevant to a pure race map, but
  available): `OnModifyPlayerDamage`, `OnPlayerDamage`, `OnPlayerKill`,
  `OnPlayerJump`, `OnPlayerLand`, `OnPlayerChat`, `OnPlayerPing`,
  `OnGunReload`, `OnGunFire`, `OnBulletImpact`, `OnWeaponDrop/Pickup`,
  `OnGrenadeThrow/Bounce`, `OnKnifeAttack`, bomb events. Use
  `OnModifyPlayerDamage` to return `{ abort: true }` if the map should be
  fall-damage/weapon-damage-free.
- **Entity I/O bridge** (this is the JS equivalent of classic Source
  `EntFire`/`AddOutput`): `EntFireAtName`/`EntFireAtTarget` to fire an
  entity's input from script, `ConnectOutput(target, output, callback)` /
  `DisconnectOutput(id)` to react to a Hammer entity output from script.
- **Finding entities**: `FindEntityByName`/`FindEntitiesByName`,
  `FindEntityByClass`/`FindEntitiesByClass`, `GetPlayerController(slot)`,
  `GetAllPlayerControllers()` (includes disconnected players).
- **Tracing**: `TraceLine`, `TraceSphere`, `TraceBox`, `TracePlayer`,
  `TraceBullet` — useful for ground checks / respawn placement / custom
  collision logic beyond what triggers give you.
- **Game state**: `GetGameTime()`, `IsWarmupPeriod()`, `IsFreezePeriod()`,
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
Also from `BaseModelEntity`: `CSObserverPawn`, `CSPlayerPawn` (movement
input state via `IsInputPressed`/`WasInputJustPressed`/`WasInputJustReleased`
+ `CSInputs` bitflags, weapon access, `GetCustomCamera()`).
`CSPlayerController extends Entity` (`GetPlayerSlot`, `GetPlayerName`,
`GetPlayerPawn`, `GetScore`/`AddScore`, `JoinTeam`, money functions) — the
persistent per-client identity; **pawn** is the physical body that respawns.
`PointTemplate extends Entity` — `ForceSpawn(origin?, angle?)`: the scripted
equivalent of a Hammer `point_template`, good for spawning melon props along
the track procedurally or respawning a batch after a reset.
`CustomPlayerCamera` — scripted spectator/vehicle-style camera control via
`SetMode`/`SetFollowConfig` (modes: `DISABLED`, `CONTROLLED`,
`CONTROLLED_POSITION`, `FOLLOW_POSITION`) — worth exploring for a
kart-racer "chase cam" instead of the default FPS view.
`CustomHudLayout extends Entity` — see next section.

### Custom HUD (`custom_hud_layout`)

CS2 supports a scripted custom UI via Panorama, wired through the same
`cs_script` system — exactly what a lap timer / checkpoint counter /
leaderboard needs:

- Layout: `panorama/layout/custom_game/<name>.xml` (compiles to `.vxml`).
- Style: `panorama/styles/custom_game/<name>.css` (compiles to `.vcss`).
- Supported tags only: `<Panel>`, `<Label>`, `<Image>`, `<Button>`
  (`id`/`class`/`hittest`, plus `text` on Label and `src` on Image). No
  client-side scripting or events inside the layout itself — all
  interactivity goes through `Instance`.
- Place a `custom_hud_layout` point entity in the map, set its `layout`
  property to the `.vxml` asset.
- Drive it from script: `SetHasClass`/`SetHasClassForPlayer`,
  `SetDialogVariableString`/`...ForPlayer` (for text like a timer value),
  `SetInputCaptureEnabled` (mouse-driven menus), and listen for clicks via
  `Instance.OnCustomHudClicked`.
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

- **Triggers as the backbone**: `trigger_multiple`/`trigger_once` outputs
  (`OnStartTouch`/`OnEndTouch`) should call `RunScriptInput` on a
  `point_script` entity, handled via `Instance.OnScriptInput(name, ...)` —
  this is the standard way Hammer geometry drives script logic (see
  `mdlchange.js`, `grenadetraining.js`). Race-specific uses of this pattern
  (checkpoints, boost pads, resets) are documented in
  [GAMEPLAY.md](GAMEPLAY.md).

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
- There is no CLI compiler or test harness available here — verifying a
  change means loading the map in Hammer / launching CS2 in-game
  (`map melon_racer`), which only the user can do. Don't claim a gameplay
  change "works" without that manual check having happened.
- This directory is not a git repository. Recommend initializing one before
  the script logic grows, so changes to `.js` files can be diffed and
  reverted.
