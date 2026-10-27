[Mapping API](README.md) › **3. Effect templates** · [← Core entities](02-core-entities.md) · [Tracks →](04-tracks.md)

# 3. Effect templates

All optional `point_template`s the script spawns for visual effects —
optional for the script, which just skips a missing effect. `npm test` is
stricter: `melon_break_template`, `melon_break_chunks_template`,
`perfect_hit_particle_template` and `particle_health_template` must each
exist exactly once, spawning an `info_particle_system` with a `.vpcf`; the
boost trail is only checked once placed, the prediction dots not at all. Where a
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
| `template_drone` | **1** `prop_dynamic` with `models/melon_racer/drone/drone.vmdl` | a player switches [drone mode](#free-look-drone) on | free look off / player leaves | **no drone mode** (it stays off) |

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

## Free look drone

`template_drone`: the drone a player in drone mode (user menu, ACTIONS → "Drone Mode")
turns into and flies through the map. A fresh copy is spawned above their
melon, moved by the script every tick, and the chase camera follows it;
the others see who's flying around. Removed when drone mode goes off or the
player leaves.

| Setting | Value |
|---|---|
| Template01 | a `prop_dynamic` with `models/melon_racer/drone/drone.vmdl` (`tools/models/make-drone-model.mjs`) |
| Its animation | nothing to set — the script starts the looping `spin` (the rotors), and `spindown`/`landed`/`spinup` when it touches down and takes off |
| Solidity | doesn't matter: the model has no collision, and the script sends it `DisableCollision` |
| Where | anywhere — the copy is moved onto the melon |

- Without it in the map, drone mode stays off and the console says why.
- **Limits:** every `info_visibility_box` is also a fence for the drone: it
  stays inside the one it starts in (the smallest round the melon), its edge
  stopping it like a wall; outside every box it flies anywhere. No name or
  setting needed — but the script reads the boxes (position, `box_size`,
  the prefab's rotation) from the .vmap at build time, so after adding,
  moving or resizing one (or the prefab it sits in), run `npm run build` —
  or keep `npm run watch` running, it rebuilds on every Hammer save. The
  console says which box holds the drone each time drone mode starts.

### Laser pointer (optional)

`template_drone_laser`: the drone's laser — a red beam from the camera's
recording light along where the pilot looks, to the first thing in the
way, at most `DRONE_LASER_LENGTH` (32 units). CS2 has no `env_beam`, so the
script lays the beam from copies of this template, end to end
(`DRONE_LASER_SEGMENT`, 4 units each — 8 copies per drone).

| Setting | Value |
|---|---|
| Template01 | a `prop_dynamic` with `models/melon_racer/laser/laser.vmdl` (`tools/models/make-laser-model.mjs`: a thin glowing rod) |
| Solidity | doesn't matter: no collision, and the script sends `DisableCollision` |
| Where | anywhere — the copies are moved onto the beam |

Without it, the drone flies without a laser.

### Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `DRONE_SPEED` | 600 units/s | flying speed | `dev/constants.js` |
| `DRONE_FAST_SPEED` | 1400 units/s | with attack held | `dev/constants.js` |
| `DRONE_RESPONSE` | 3 /s | inertia: how fast the velocity follows the input (two thirds after 1/3 s) | `dev/constants.js` |
| `DRONE_MAX_TILT` | 25° | how far it leans into speeding up, braking and turns | `dev/constants.js` |
| `DRONE_RADIUS` | 8 units | its size against the world, to each side (the model is ~16 across, about a melon) | `dev/constants.js` |
| `DRONE_BOTTOM` / `DRONE_TOP` | 2.5 / 2.7 units | its size against the world, down to its skids / up from its origin (printed by the model generator) | `dev/constants.js` |
| `DRONE_GROUND_DISTANCE` | 2 units | floor this close under its skids: on the floor | `dev/constants.js` |
| `DRONE_LAND_SECONDS` | 0.5 s | standing still on the floor this long: landed, the rotors run down to a stop, parked until jump | `dev/constants.js` |
| `DRONE_LAND_MAX_SPEED` | 5 units/s | slower than this on the floor counts as standing still | `dev/constants.js` |
| `DRONE_TAKEOFF_SPEED` | 180 units/s | jump on the ground: the hop up (~60 units) | `dev/constants.js` |
| `DRONE_LASER_LENGTH` | 32 units | how far the laser reaches, at most | `dev/constants.js` |
| `DRONE_START_HEIGHT` | 40 units | how far above the melon it appears | `dev/constants.js` |
| `DRONE_CAMERA_DISTANCE` / `_HEIGHT` | 50 / 25 units | the camera behind / above it — the drone close, at the bottom of the picture | `dev/constants.js` |
| `DRONE_CAMERA_PIVOT` | 12 units | the point above the drone the camera turns around (and is pulled in towards at walls/floor) — not into the drone when landed | `dev/constants.js` |

---
[← Core entities](02-core-entities.md) · [Mapping API](README.md) · [Tracks →](04-tracks.md)
