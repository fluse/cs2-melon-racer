[Mapping API](README.md) › **13. Water zones** · [← Jump pads](12-jump-pads.md) · [Checking your map →](14-checking.md)

# 13. Water zones

For every `func_water` melons can land in. `func_water` has no outputs, so
the script can't see it — a trigger around it tells the script the melon is
in water.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | anything |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `water_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `water_leave` |

Both outputs are required. Make the trigger cover the whole `func_water`
and reach a few units **above** its surface, so it fires before the water
starts pushing the melon around.

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `WATER_ENTRY_SPEED_KEEP` | 0 | share of its speed and spin the melon keeps on entering (0 = stops dead) | `zones/water/constants.js` |

## Rules

- Entering, the melon loses its momentum at once: speed and spin, a
  boosted speed cap (wall bounce, jump pad, attack boost) and its momentum
  steps.
- Inside, no wall bounces and no impact damage — the water's drag and
  buoyancy would otherwise read as random hits. The attack boost's cost and
  [kill triggers](08-kill-triggers.md) still apply.
- Driving and jumping work as usual, starting from standing still.
- Teleports and respawns keep the melon in its zones, like
  [heal zones](09-heal-zones.md#rules).

---
[← Jump pads](12-jump-pads.md) · [Mapping API](README.md) · [Checking your map →](14-checking.md)
