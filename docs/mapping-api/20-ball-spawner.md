[Mapping API](README.md) › **20. Ball spawner** · [← Ball pits](19-ball-pits.md)

# 20. Ball spawner

Physics balls dropping in at irregular intervals: the script copies a
`point_template` at a spawn point, removes each ball again after
`BALL_SPAWNER_LIFETIME` seconds, and never keeps more than
`BALL_SPAWNER_MAX_BALLS` at once. No outputs, no `logic_timer` in Hammer.

| Entity | Class | Setup |
|---|---|---|
| `template_ball` | `point_template` | `Template01` = the ball (e.g. a `prop_physics_multiplayer` with `models/melon_racer/ball.vmdl`), placed anywhere — the script moves each copy onto the spawn point |
| `spawn_ball` | `info_target` | where the balls appear; with several of that name a random one each time. Without one, no balls |

The ball entity inside the template shouldn't be placed in the world on
its own as well (it's only a template entry). A missing or empty template
is said once in the console: `[melon_drive] SpawnFromTemplate: …`.

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `BALL_SPAWNER_MAX_BALLS` | 15 | balls alive at once, at most | `world/ball-spawner/constants.js` |
| `BALL_SPAWNER_LIFETIME` | 20 | seconds a ball lives before it's removed | `world/ball-spawner/constants.js` |
| `BALL_SPAWNER_MIN_INTERVAL` | 0.5 | shortest gap between two balls, seconds | `world/ball-spawner/constants.js` |
| `BALL_SPAWNER_MAX_INTERVAL` | 4 | longest gap, seconds (random in between) | `world/ball-spawner/constants.js` |
| `BALL_SPAWNER_SPREAD` | 8 | how far off the spawn point a ball appears, each way | `world/ball-spawner/constants.js` |

## Rules

- Balls are physics props that aren't melons, so a [ball pit](19-ball-pits.md)
  trigger around the spawn point keeps them in too.
- When the maximum is reached, a due ball is skipped and the next one gets
  a fresh random delay; a round restart removes the balls and starts over.

---
[← Ball pits](19-ball-pits.md) · [Mapping API](README.md)
