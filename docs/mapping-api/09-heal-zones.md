[Mapping API](README.md) › **9. Heal zones** · [← Kill triggers](08-kill-triggers.md) · [Lift zones →](10-lift-zones.md)

# 9. Heal zones

Areas where the melon regains health over time.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | anything, `heal_zone_<rate>`, or `heal_zone_full` |
| Pattern | `^heal_zone_(\d+(?:\.\d+)?)$` |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `heal_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `heal_leave` |

**Both outputs are required** — without `heal_leave` the melon keeps
healing after leaving; teleports and respawns don't clear it.

## Name variants

| Name | Healing |
|---|---|
| any other name | `HEAL_ZONE_RATE` = 10 health/s |
| `heal_zone_25` | 25 health/s (decimals allowed: `heal_zone_7.5`) |
| `heal_zone_full` | [full-heal zone](#full-heal-zone) |

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `HEAL_ZONE_RATE` | 10 health/s | rate for unnamed zones | `health/heal/constants.js` |
| `MELON_MAX_HEALTH` | 70 | full health, the cap | `health/damage/constants.js` |
| `HEAL_PARTICLE_LIFETIME` | 2 s | how long the [heal effect](03-effect-templates.md#heal-effect) plays | `health/heal/constants.js` |

At the default rate, 0 → full takes 7 s.

## Full-heal zone

Name the trigger exactly `heal_zone_full` (same two outputs). The melon is
back at full health on its first tick inside and stays full while there; it
beats any other heal zone it overlaps. Several triggers may share that name.

## Rules

- Overlapping zones don't stack — the fastest counts. Damage still applies
  inside.
- Broken or race-locked melons don't heal.
- Teleports and respawns keep the melon in its zones (respawning inside the
  zone it broke in sends no new `OnStartTouch`); leaving one by teleport
  goes through its `OnEndTouch` as usual.
- Every entry plays `particle_health_template` on the melon.

---
[← Kill triggers](08-kill-triggers.md) · [Mapping API](README.md) · [Lift zones →](10-lift-zones.md)
