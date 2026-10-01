[Mapping API](README.md) › **6. Paint triggers** · [← Hub](05-hub.md) · [Teleporters →](07-teleporters.md)

# 6. Paint triggers

Recolor the touching melon — intended for the hub, but usable anywhere.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | `paint_trigger_<r>_<g>_<b>`, each channel 0–255 |
| Pattern | `^paint_trigger_(\d+)_(\d+)_(\d+)$` |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `melon_paint` |

## Examples

| Name | Color |
|---|---|
| `paint_trigger_255_0_0` | red |
| `paint_trigger_0_120_255` | blue |
| `paint_trigger_255_255_255` | white |

- The color comes from the trigger's **name**, not the parameter — every
  paint trigger uses the same `melon_paint`.
- The color (and the melon's outline glow) stays until the melon touches
  another paint trigger — it survives breaks, heats and hub returns.

---
[← Hub](05-hub.md) · [Mapping API](README.md) · [Teleporters →](07-teleporters.md)
