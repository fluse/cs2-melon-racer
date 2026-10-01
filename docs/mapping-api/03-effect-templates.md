[Mapping API](README.md) › **3. Effect templates** · [← Core entities](02-core-entities.md) · [Tracks →](04-tracks.md)

# 3. Effect templates

All optional `point_template`s the script spawns for visual effects. Where a
template and its entities sit in Hammer doesn't matter — the script moves
the spawned copies onto the melon / crash site. Particle systems should have
**"Start Active" off**; the script starts them.

## Overview

| Name | Contains | Spawned when | Removed after | Without it |
|---|---|---|---|---|
| `melon_break_template` | 1 `info_particle_system` (`.vpcf`) | the melon breaks | `BREAK_EFFECT_LIFETIME` (180 s) | no burst |
| `melon_break_chunks_template` | 1 `info_particle_system` + up to 9 `prop_physics` pieces | the melon breaks | `BREAK_EFFECT_LIFETIME` (180 s) | no chunks |
| `perfect_hit_particle_template` | 1 `info_particle_system` (`.vpcf`) | every PERFECT wall bounce (2 copies) | `PERFECT_SPARK_LIFETIME` (2 s) | no spark |
| `particle_health_template` | its **own** `info_particle_system` (`.vpcf`) | every entry into a [heal zone](09-heal-zones.md) | `HEAL_PARTICLE_LIFETIME` (2 s) | no heal effect |
| `particle_boost_trail_template` | **2** `info_particle_system`s (`boost_trail.vpcf`, `boost_trail_juice.vpcf`) | boost above the trail speed | fades over `BOOST_TRAIL_FADE_SECONDS` (1 s) | no trail |
| `prediction_dot_template` | 1 small dot entity | only with `PREDICTION_RENDER_MODE = "dots"` (default `"debug"`) | — | debug line |

Two templates must never share one `info_particle_system` (a template copied
in Hammer still playing the other one's effect) — `npm test` fails on it.

## Break burst

`melon_break_template`: the main break burst. Its `info_particle_system` is
moved onto the crash site and started.

There are exactly **two** break templates (this one and the chunks one) —
don't add other `melon_break_*` templates; put extra pieces into the chunks
template.

## Break chunks

`melon_break_chunks_template`: chunk flecks plus pieces that lie on the
ground. Every `prop_physics` in it is treated as a break piece — tinted in
the melon's paint color, flung outward, left lying for a while.

| Slot | Entity |
|---|---|
| Template01 | `info_particle_system` with the chunks `.vpcf` |
| Template02 … Template10 | `prop_physics`: `models/cs_italy/italy_food_melon/italy_food_melon/piece.vmdl`, `piece1.vmdl` … `piece8.vmdl`, arranged close together, roughly melon-shaped |

The pieces' group is centered on the crash site, their layout kept. At most
`BREAK_EFFECT_MAX_ACTIVE` (24) breaks lie around at once. If
lying pieces get in the karts' way, mark them as debris.

## Perfect spark

`perfect_hit_particle_template`: a fresh copy per PERFECT bounce, so several
karts' sparks play at once. One copy stays at the hit spot, one rides along
on the melon.

## Heal effect

`particle_health_template`: a fresh copy plays on the melon, riding along,
every time it enters a heal zone (not for broken or race-locked melons).
Shipped effect: `particles/melon_racer/heal_crosses.vpcf`.

## Boost trail

`particle_boost_trail_template`: a fresh copy rides along on the melon.

| Particle system | Effect |
|---|---|
| 1 | `particles/melon_racer/boost_trail.vpcf` — the glowing band |
| 2 | `particles/melon_racer/boost_trail_juice.vpcf` — juice droplets |

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `BOOST_TRAIL_START_MARGIN` | 30 u/s | trail starts above `MAX_SPEED` + this | `fx/boost-trail/constants.js` |
| `BOOST_TRAIL_STOP_MARGIN` | 5 u/s | trail stops below `MAX_SPEED` + this | `fx/boost-trail/constants.js` |
| `BOOST_TRAIL_FADE_SECONDS` | 1 s | particles already out fade over this | `fx/boost-trail/constants.js` |

Nothing else may be in it — `npm test` fails on a third effect.

## Prediction dots

`prediction_dot_template`: only used when `PREDICTION_RENDER_MODE` is
`"dots"` (`fx/prediction/constants.js`, default `"debug"`). One small dot
entity, e.g. a "Never Solid" `func_brush`.

---
[← Core entities](02-core-entities.md) · [Mapping API](README.md) · [Tracks →](04-tracks.md)
