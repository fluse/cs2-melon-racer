[Mapping API](README.md) › **17. Jump recharge zones** · [← Movers](16-movers.md)

# 17. Jump recharge zones

An area where the melon's wall jumps are recharged at once: entering it,
all `WALL_JUMP_CHARGES` (3) are ready again, and they stay full while the
melon is inside — wall jumps there cost nothing. Leaving, it takes the full
set along; after that they refill as usual, one every
`WALL_JUMP_RECHARGE_SECONDS`. For a wall-jump section that needs more than
three in a row, or a fresh set before one.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | anything |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `jump_recharge_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `jump_recharge_leave` |

Both outputs are required — without `jump_recharge_leave` the melon keeps
full charges after leaving.

## Marking it

Players can't see a trigger, so mark the zone with the two ambient particle
effects made for it — the [jump pad](12-jump-pads.md)'s rising rings and
sparks, in health blue. Each is its own `info_particle_system` (not one as
the other's child — children don't render), with **Start Active** on, at
the center of the zone just above the floor:

| Effect | What it shows |
|---|---|
| `particles/melon_racer/jump_recharge_rings.vpcf` | flat blue rings rising off the floor, widening and fading |
| `particles/melon_racer/jump_recharge_sparks.vpcf` | fast blue sparks shooting up |

Not script-driven: the script doesn't look them up. The rings start
`m_flConstantRadius` (24 units) wide — for a bigger zone, place several or
raise it in a copy of the file.

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `WALL_JUMP_CHARGES` | 3 | wall jumps a full set holds | `movement/jump/constants.js` |
| `WALL_JUMP_RECHARGE_SECONDS` | 2 s | refill of one, outside a recharge zone | `movement/jump/constants.js` |

## Rules

- Only the charges: cooldown, contact and same-wall rules of a wall jump
  stay as they are (in a [lift zone](10-lift-zones.md) or a
  [side-view zone](11-camera-zones.md#side-view-zones) theirs).
- The jump icons next to the speed panel fill up at once.
- Broken and race-locked melons are recharged too — the charge refills
  then anyway.
- Overlapping recharge zones don't matter; teleports and respawns keep the
  melon in its zones, like [heal zones](09-heal-zones.md#rules).

---
[← Movers](16-movers.md) · [Mapping API](README.md)
