[Mapping API](README.md) › **12. Jump pads** · [← Camera zones](11-camera-zones.md) · [Water zones →](13-water-zones.md)

# 12. Jump pads

Pads that launch a melon much higher and further than a normal jump — but
only if its player presses jump on it: the timing is the skill.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | anything, or `jump_pad_<up>[_<forward>]` |
| Pattern | `^jump_pad_(\d+(?:\.\d+)?)(?:_(\d+(?:\.\d+)?))?$` |
| Shape | flat volume on top of the pad, ~32 units tall, so a melon rolling over it is inside |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `jump_pad_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `jump_pad_leave` |

Both outputs are required.

## Name variants and launch height

`<up>`: upward launch speed (u/s). `<forward>`: horizontal speed added along
the melon's direction of travel (along the look direction if it's barely
moving). Height ≈ up² / 1600 units — a normal jump reaches ~85.

| Name | Up | Forward | Height |
|---|---|---|---|
| any other name | 850 u/s | +250 u/s | ~450 |
| `jump_pad_1000` | 1000 u/s | +250 u/s | ~625 |
| `jump_pad_1000_400` | 1000 u/s | +400 u/s | ~625 |
| `jump_pad_600_0` | 600 u/s | +0 | ~225 |

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `JUMP_PAD_UP_SPEED` | 850 u/s | launch speed without a number | `zones/jump-pad/constants.js` |
| `JUMP_PAD_FORWARD_BOOST` | 250 u/s | forward boost without a number | `zones/jump-pad/constants.js` |
| `JUMP_PAD_MIN_DIRECTION_SPEED` | 50 u/s | below this, forward = look direction | `zones/jump-pad/constants.js` |
| `JUMP_PAD_BUFFER` | 0.2 s | a jump pressed this early before reaching the pad still launches | `zones/jump-pad/constants.js` |
| `JUMP_PAD_COOLDOWN` | 0.5 s | one launch per this | `zones/jump-pad/constants.js` |
| `JUMP_PAD_LANDING_GRACE` | 0.3 s | no damage this long after landing | `zones/jump-pad/constants.js` |
| `JUMP_PAD_MAX_PROTECTED_SECONDS` | 6 s | no-damage flight at most this long | `zones/jump-pad/constants.js` |

## Rules

- Launches when jump is pressed on the pad, or up to `JUMP_PAD_BUFFER`
  before reaching it. Driving over without pressing does nothing.
- The forward boost raises the speed cap like a wall bounce; it decays back.
- **No damage** on the pad and from the launch until `JUMP_PAD_LANDING_GRACE`
  after landing — landings, crashes and wall hits are free. The attack
  boost still costs health, [kill triggers](08-kill-triggers.md) still break.

## Marker effect (optional, not script-driven)

Two `info_particle_system`s at the pad's center, just above its surface,
"Start Active" on:

| Effect | Look |
|---|---|
| `particles/melon_racer/jump_pad_rings.vpcf` | flat lime rings shooting up |
| `particles/melon_racer/jump_pad_sparks.vpcf` | fast rising sparks |

Sized for a pad ~50 units across; for bigger pads raise `m_flConstantRadius`
(rings) and `m_fRadiusMax` (sparks) in the .vpcf.

---
[← Camera zones](11-camera-zones.md) · [Mapping API](README.md) · [Water zones →](13-water-zones.md)
