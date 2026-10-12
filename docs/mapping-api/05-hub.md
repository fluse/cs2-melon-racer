[Mapping API](README.md) › **5. Hub** · [← Tracks](04-tracks.md) · [Paint triggers →](06-paint-triggers.md)

# 5. Hub

## Hub start area

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | `hub_start_trigger` — exactly one |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `hub_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `hub_leave` |

- Shows the hub modal while a melon is inside: "start" button, "race
  running" message, or the moderator's "abort" button.
- Every melon inside it when someone clicks "start" joins the heat.
- **Both outputs are required** — without `hub_leave` the modal never
  closes.
- `hub_enter`/`hub_leave` belong **only on `hub_start_trigger`**. The
  script checks the caller of `hub_enter` and ignores any other, logging
  `[melon_drive] hub_enter fired by "<name>", not "hub_start_trigger" —
  ignoring.` (`DEBUG` or not); `npm test` checks both in the .vmap.

## Sending melons to the hub

To just *send* melons to the hub from elsewhere (e.g. the tutorial's exit),
use any trigger with `hub_teleport` — never `hub_enter`.

| Input | Output | Effect |
|---|---|---|
| `hub_teleport` | `OnStartTouch` | sends the melon to `hub_spawn` ([spawn points](02-core-entities.md#spawn-points)) at full health and makes it the respawn point, takes it out of a running heat, clears its track progress and cancels a running time trial |

## Joining a starting Grand Prix

"Start Grand Prix" waits `GRAND_PRIX_GATHER_SECONDS` before the heats
begin: everyone outside `hub_start_trigger` is called ("GRAND PRIX STARTS
IN 10 · PRESS R TO JOIN"), and **R** teleports their melon here.

| Setting | Value |
|---|---|
| Class | any named point entity, e.g. `info_target` |
| Name | `spawn_join_grandprix` — one |
| Position | **inside `hub_start_trigger`**, on or just above the floor — whoever stands in the trigger when the time runs out races |
| Yaw | the way the melons face on arrival (along the line-up) |

- Several players pressing R are lined up side by side
  (`RACE_SPAWN_LATERAL_SPACING` apart, alternating left and right of it),
  so leave room on both sides.
- It becomes their respawn point, like the hub's.
- Without one, R uses `hub_spawn`.

### Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `GRAND_PRIX_GATHER_SECONDS` | 10 s | how long the others are called before the Grand Prix starts | `race/constants.js` |

## Route gates

An inflatable arch per route in the hub with the route's name on a sign,
over the route's teleporter — the way into that route. Only models: the
teleport is a normal [teleporter](07-teleporters.md) inside the opening.
Gate and name are two models with the same origin: one gate for every
route, the sign placed onto it.

| Entity | Class | Setting |
|---|---|---|
| Gate | `prop_static` (or `prop_dynamic`) | Model `models/melon_racer/hub_gate/hub_gate.vmdl`; scale 1; **Render Color** tints the white vinyl (straps, plates, ropes, blower stay dark) |
| Name sign | `prop_static` | Model `models/melon_racer/hub_gate/hub_gate_name_<route>.vmdl`, `<route>` as in the route's prefab `route_<route>.vmap` (`hub_gate_name_side_slice.vmdl` → "SIDE SLICE"); **same origin and angles as the gate**, scale 1 |
| Teleporter | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) | inside the opening, named `teleport_stop_checkpoint_to_<destination>` ([name variants](07-teleporters.md#name-variants)) so a break before the start line respawns at the route, not in the hub |

- Origin on the floor in the middle of the opening; the melon drives
  through along the model's X. The name reads right from both sides.
- Opening 84 wide, 104 high under the top; the arch 156 wide, 132 high.
  Guy ropes reach 38 out along X front and back, the blower (behind the
  right foot, -X) 43 — keep that floor clear. Tube, feet and blower are
  solid; ropes and the name sign aren't.
- A new or renamed route: re-run `node tools/models/make-hub-gate-model.mjs`
  and compile its `hub_gate_name_<route>.vmdl` with `resourcecompiler.exe`.

## Grand Prix pavilion

An inflatable tent over `hub_start_trigger` — where the Grand Prix
starts. Only models: the trigger stays as it is ([hub start area](#hub-start-area)).

It's split into pieces so each can be colored on its own: every piece is
a `prop_static` with the model `models/melon_racer/pavilion/pavilion_<piece>.vmdl`,
**all at the same origin** (the pavilion's middle, on the floor), scale 1,
only turned. Its **Render Color** tints the piece's white parts; straps,
plates, ropes, piping and the sign's board stay dark.

| Piece | Copies | Yaw | Render Color tints |
|---|---|---|---|
| `leg` (foot, straps, guy rope) | 4 | 0, 90, 180, 270 | the vinyl |
| `canopy` (one side, its hem) | 4 | 0, 90, 180, 270 | the canvas |
| `bunting` (one side's pennants) | 3 | 90, 180, 270 — not over the sign | the white pennants |
| `sign` ("GRAND PRIX") | 1 | 0 — the +X entrance | letters, edge, checks |
| `crown` | 1 | — | the vinyl |
| `flag` (waving) | 1 | — · a **`prop_dynamic`**, Idle Animation `wave`, Loop Mode "Loop" | the ball on the pole |
| `light` (the ring inside) | 1 | — | the light |
| `blower` | 1 | the yaw of the leg it stands beside (0 = the +X+Y leg) | its duct |

- Origin on the floor in the middle; the legs stand on the diagonals at
  ±144 / ±144, so `hub_start_trigger` fits inside a 288 × 288 square
  between them. The main entrance with the "GRAND PRIX" sign faces +X.
- Side openings 256 wide and 132 high in the middle (94 under the sign);
  the crown at 166, the flag's top at 239. Guy ropes reach out to 260 on
  the diagonals, the blower 46 out beside its leg — keep that floor clear.
- Legs, feet and blower are solid; canopy, ropes, sign and flag aren't.
- Easiest in Hammer: place all 16 props once, select them and make them
  a prefab (or group) — then the pavilion moves as one.

### Stage

A round stage for the pavilion to stand on (`tools/models/make-stage-model.mjs`):
a deck, low steps all round it with an LED strip on every riser, and a
platform reaching out at each of the pavilion's openings. Like the
pavilion: `prop_static`s with `models/melon_racer/stage/stage_<piece>.vmdl`,
all at the same origin (the middle, on the floor), only turned; each
piece's **Render Color** tints its surface or its lights.

| Piece | Copies | Yaw |
|---|---|---|
| `deck` (panel joints, checkered ring, inlay ring) | 1 | — |
| `steps` (one quarter) | 4 | 0, 90, 180, 270 |
| `step_lights` | 4 | 0, 90, 180, 270 |
| `thrust` (the platform at +X: front steps, bollards) | 4 | 0, 90, 180, 270 |
| `thrust_lights` (its LEDs, the bollards' caps) | 4 | 0, 90, 180, 270 |

- The deck is 16 high, radius 272: place the pavilion's pieces (and
  `hub_start_trigger`) 16 higher, on the same middle. Its legs, stakes and
  blower all stand on the deck.
- Steps 4 high and 16 deep, out to radius 320; the platforms 128 wide, out
  to 416. Deck, steps, platforms and bollards are solid, the lights and
  markings aren't.

## Podium

After a Grand Prix that ran to its last track, the top three are put on the
podium instead of `hub_spawn`. **No triggers** — one point entity per step:

| Name | Pattern | Example | Meaning |
|---|---|---|---|
| spawn | `^podium_spawn_([1-3])$` | `podium_spawn_1` | where place 1 (the winner) stands |

| Setting | Value |
|---|---|
| Class | `info_target` |
| Name | `podium_spawn_1`, `podium_spawn_2`, `podium_spawn_3` — one each, all optional |
| Position | right above its step: the melon lands on the floor traced straight down from it (`SPAWN_UP_OFFSET` above) |
| Angles | yaw = the way the podium faces (towards the room): the camera looks back at the podium from there |

- Held there for `PODIUM_HOLD_SECONDS`: jumping and looking around work,
  driving and the attack boost don't; a melon off its spot is pulled back
  over it. Meanwhile the chase camera eases back
  (`PODIUM_CAMERA_EXTRA_DISTANCE`/`_HEIGHT`) and walls don't pull it in.
- The respawn point stays `hub_spawn`, so the user menu's respawn, hub and
  tutorial buttons, `hub_teleport`, any teleporter and the next Grand Prix
  take a melon down early.
- A step without its `podium_spawn_<place>` leaves that place at
  `hub_spawn`; a racer who left leaves their step empty (nobody moves up).
  Nothing after a cancelled Grand Prix.
- The podium itself is mesh geometry: `models/melon_racer/podium.dmx`, generated
  by `tools/models/make-podium-model.mjs`, brought in with Hammer's File → Import — three
  steps, 1st in the middle (100 high), 2nd on the left (72), 3rd on the right (48)
  seen from the front, which faces +X as imported. Give the `podium_spawn_<place>`
  info_targets the yaw the front faces; the tool prints their spots relative to the
  podium's origin (1st: `0 0 124`, 2nd: `0 -112 96`, 3rd: `0 112 72`).
- Or the **inflatable podium** (`tools/models/make-inflatable-podium-model.mjs`):
  the same footprint, heights and spawn spots, as `prop_static`s in pieces
  that are tinted on their own (Render Color), all at the same origin and
  angles: `models/melon_racer/inflatable_podium/inflatable_podium_body_<n>`,
  `_top_<n>` and `_number_<n>` for places 1–3, `_base` (the ground mat
  under all three) and `_blower` (behind the winner's step). Blocks, tops and
  blower are solid.
- Either can stand on the **backdrop platform** (`tools/models/make-stage-model.mjs`):
  `models/melon_racer/stage/stage_platform` + `stage_platform_lights`, both at the same
  origin (the deck's middle, on the floor), its steps on the +X side. It's 16 high:
  raise the podium and its `podium_spawn_<place>`s (the whole prefab) by 16.
- Keep the steps more than a melon apart and away from `hub_start_trigger`
  if standing on them shouldn't open the hub modal.
- `npm test` fails on any other `podium*` name (a typo).

### Confetti

| Setting | Value |
|---|---|
| Class | `info_particle_system` (e.g. `particles/pet_photo/confetti/photo_confetti.vpcf`) |
| Name | `particle_podium_confetti` — optional, several allowed |
| Start Active | **off** (`npm test` checks it) |

Gets `Start` the moment the top three are put on the podium, again every
`PODIUM_CONFETTI_INTERVAL` (each time a short `Stop` first, so a one-off
burst fires anew), and `Stop` when their hold ends (`PODIUM_HOLD_SECONDS`).
Not after a cancelled Grand Prix.

### Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `PODIUM_HOLD_SECONDS` | 10 s | how long the top three are held on their steps | `race/podium/constants.js` |
| `PODIUM_PULL` | 6 /s | how hard a held melon is pulled back over its spot | `race/podium/constants.js` |
| `PODIUM_PULL_MAX_SPEED` | 200 units/s | fastest it's pulled back | `race/podium/constants.js` |
| `PODIUM_CONFETTI_INTERVAL` | 2 s | time between confetti bursts | `race/podium/constants.js` |
| `PODIUM_CAMERA_EXTRA_DISTANCE` | 160 units | how much further back the camera is on the podium | `camera/podium-zoom/constants.js` |
| `PODIUM_CAMERA_EXTRA_HEIGHT` | 40 units | how much higher | `camera/podium-zoom/constants.js` |

---
[← Tracks](04-tracks.md) · [Mapping API](README.md) · [Paint triggers →](06-paint-triggers.md)
