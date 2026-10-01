[Mapping API](README.md) › **8. Kill triggers** · [← Teleporters](07-teleporters.md) · [Heal zones →](09-heal-zones.md)

# 8. Kill triggers

Break the touching melon at once, whatever its health — for lava, spikes, a
drop that shouldn't be forgiven.

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

---
[← Teleporters](07-teleporters.md) · [Mapping API](README.md) · [Heal zones →](09-heal-zones.md)
