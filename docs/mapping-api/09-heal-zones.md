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

## First-aid tent

A place to heal up in the hub (`tools/models/make-heal-tent-model.mjs`):
an inflatable tunnel tent, open at both ends, green pharmacy crosses on its
walls and roof, a glowing cross on the mat inside, and an inflatable green
cross turning on the roof. Only models — the healing is a heal zone inside
it, set up as above. Every piece at the **same origin** (the tent's middle,
on the floor), scale 1, the tunnel along X (turn all of them alike);
`models/melon_racer/heal_tent/heal_tent_<piece>.vmdl`:

| Piece | Entity | Render Color tints |
|---|---|---|
| `frame` (two arches, feet, guy ropes, blower) | `prop_static` | the vinyl |
| `canvas` (walls, roof, crosses, a "HEAL" sign under each arch) | `prop_static` | the canvas (not the crosses) |
| `floor` (the mat, a glowing cross) | `prop_static` | the mat |
| `cross` (mast, motor, the turning cross) | **`prop_dynamic`**, Idle Animation `spin`, Loop Mode "Loop" | the mast |

- The heal trigger: a `trigger_multiple` over the mat, 208 × 176 (x × y)
  centered on the origin, from the floor up ~48 — named `heal_zone_full`
  so a melon is whole the moment it rolls in.
- Openings 196 wide, 148 clear under the signs; 284 long, 268 wide over the
  feet, the roof at 189, the turning cross's top at 300. Guy ropes reach 44
  out on the diagonals, the blower stands outside the −X −Y foot.
- Arches, feet, blower, walls, roof and mat are solid (the mat is 1 high,
  melons roll onto it); ropes, signs and the cross aren't.

---
[← Kill triggers](08-kill-triggers.md) · [Mapping API](README.md) · [Lift zones →](10-lift-zones.md)
