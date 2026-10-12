[Mapping API](README.md) › **19. Ball pits** · [← Spike springs](18-spike-springs.md) · [Ball spawner →](20-ball-spawner.md)

# 19. Ball pits

A trigger around a pit of physics balls keeps them in it: a ball the melons
knock out is steered back towards the middle, and dropped back in over it
if it doesn't make it in time. Melons drive in and out freely — they're
physics props too, so no wall or clip texture could tell the two apart.

| Setting | Value |
|---|---|
| Class | `trigger_multiple` |
| Name | any |
| Shape | the area the balls belong in, its origin in the middle of the pit (balls are pulled towards it and dropped over it) |
| Filter | `prop_physics` (like the other triggers) |
| Outputs | `OnStartTouch` → `ball_pit_enter`, `OnEndTouch` → `ball_pit_leave` |

Any physics prop that isn't a melon counts as a ball, so other loose props
inside the trigger are kept in too.

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `BALL_PIT_RETURN_SPEED` | 150 | horizontal u/s a ball outside is pulled back towards the middle with, at least | `world/ball-pit/constants.js` |
| `BALL_PIT_DROP_SECONDS` | 2 | seconds outside before it's dropped back in | `world/ball-pit/constants.js` |
| `BALL_PIT_DROP_HEIGHT` | 40 | how high above the trigger's origin it's dropped | `world/ball-pit/constants.js` |
| `BALL_PIT_DROP_SPREAD` | 16 | how far off the middle, each way | `world/ball-pit/constants.js` |

## Rules

- Make the trigger a little taller than the pit's walls: a ball flying
  high over them leaves it, one bouncing inside doesn't.
- The pull only changes the horizontal direction; a ball blocked by the
  pit's wall from outside is dropped back in after `BALL_PIT_DROP_SECONDS`.

## Balloon balls

Every ball with the ball model (`models/melon_racer/ball.vmdl`) floats like
a balloon — here and from the [ball spawner](20-ball-spawner.md): it sinks
slowly instead of falling, and a melon knocks it far before the air slows
it down. Nothing to set in Hammer; any other physics prop is left to the
engine.

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `BALLOON_SINK_SPEED` | 35 units/s | how fast a ball sinks, at most | `world/balloon/constants.js` |
| `BALLOON_DRAG` | 1.2 /s | air drag: a knock's speed down by a factor of e every 1/1.2 s | `world/balloon/constants.js` |
| `BALLOON_SCAN_SECONDS` | 0.2 s | how often the map is searched for new balls | `world/balloon/constants.js` |

---
[← Spike springs](18-spike-springs.md) · [Ball spawner →](20-ball-spawner.md) · [Mapping API](README.md)
