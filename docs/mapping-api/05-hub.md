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

---
[← Tracks](04-tracks.md) · [Mapping API](README.md) · [Paint triggers →](06-paint-triggers.md)
