[Mapping API](README.md) › **8. Kill & respawn triggers** · [← Teleporters](07-teleporters.md) · [Heal zones →](09-heal-zones.md)

# 8. Kill & respawn triggers

Two ways to take a melon off a spot it shouldn't be in and put it back at
its respawn point (last checkpoint, else the track's start spawn, the hub
or tutorial spawn it was last sent to, or a respawn teleporter's
destination):

| Input | What happens | For |
|---|---|---|
| [`melon_break`](#kill-trigger) | the melon breaks on the spot, respawns after `BREAK_RESPAWN_DELAY` | lava, spikes, a drop that shouldn't be forgiven |
| [`melon_respawn`](#respawn-trigger) | the melon is teleported back at once, no break | falling off an open track |

## Kill trigger

Break the touching melon at once, whatever its health.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | anything (don't start it with `melon_break`) |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `melon_break` |

- Same break as running out of health: [break effects](03-effect-templates.md#break-burst)
  at the spot, then respawn at the melon's last checkpoint after
  `BREAK_RESPAWN_DELAY` (3 s, `health/breaking/constants.js`).
- Ignored for broken and race-locked melons.
- Breaks even during a [jump pad](12-jump-pads.md)'s no-damage flight.

## Respawn trigger

Put the touching melon straight back at its respawn point — for an open
track section players can fall off. A big volume below the track works:
the melon is back the moment it enters it.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | anything |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `melon_respawn` |

- Same as the user menu's "Respawn" button: no break effects, no delay; the
  melon arrives standing still, facing the respawn point's yaw, at full
  health. The player's view turns with it.
- Checkpoint/lap progress stays; a running time trial keeps running (the
  fall costs time, that's the penalty).
- Ignored for broken and race-locked melons.

---
[← Teleporters](07-teleporters.md) · [Mapping API](README.md) · [Heal zones →](09-heal-zones.md)
