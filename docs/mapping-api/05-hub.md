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
| Angles | yaw = the way the melon and the player's view face |

- Held there for `PODIUM_HOLD_SECONDS`: jumping and looking around work,
  driving and the attack boost don't; a melon off its spot is pulled back
  over it.
- The respawn point stays `hub_spawn`, so the user menu's respawn, hub and
  tutorial buttons, `hub_teleport`, any teleporter and the next Grand Prix
  take a melon down early.
- A step without its `podium_spawn_<place>` leaves that place at
  `hub_spawn`; a racer who left leaves their step empty (nobody moves up).
  Nothing after a cancelled Grand Prix.
- Keep the steps more than a melon apart and away from `hub_start_trigger`
  if standing on them shouldn't open the hub modal.
- `npm test` fails on any other `podium*` name (a typo).

### Confetti

| Setting | Value |
|---|---|
| Class | `info_particle_system` (e.g. `particles/pet_photo/confetti/photo_confetti.vpcf`) |
| Name | `particle_podium_confetti` — optional, several allowed |
| Start Active | **off** (`npm test` checks it) |

Gets `Start` the moment the top three are put on the podium and `Stop` when
their hold ends (`PODIUM_HOLD_SECONDS`). Not after a cancelled Grand Prix.

### Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `PODIUM_HOLD_SECONDS` | 10 s | how long the top three are held on their steps | `race/podium/constants.js` |
| `PODIUM_PULL` | 6 /s | how hard a held melon is pulled back over its spot | `race/podium/constants.js` |
| `PODIUM_PULL_MAX_SPEED` | 200 units/s | fastest it's pulled back | `race/podium/constants.js` |

---
[← Tracks](04-tracks.md) · [Mapping API](README.md) · [Paint triggers →](06-paint-triggers.md)
