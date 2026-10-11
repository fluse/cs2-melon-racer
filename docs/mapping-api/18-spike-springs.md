[Mapping API](README.md) › **18. Spike springs** · [← Jump recharge zones](17-jump-recharge-zones.md) · [Ball pits →](19-ball-pits.md)

# 18. Spike springs

A spike trap in a floor, wall or ceiling: a plate of spikes on a spring that pops out
again and again and sinks back. The script plays its animations on a fixed
clock and breaks every melon on it while the spikes are out — no
`logic_timer`, no trigger and no outputs in Hammer. There's a
[prefab](14-prefabs.md#spike-spring) for it.

| Setting | Value |
|---|---|
| Class | `prop_dynamic` |
| Model | `models/melon_racer/spike_spring/spike_spring.vmdl` |
| Name | `spike_spring[_<parts>]`: the first two numbers in a row = seconds down, up; `offset<seconds>`; words are ignored |
| Starting Animation, Idle Animation | empty — the script sets them (a looping `cycle` here would run out of step with the spikes that hurt) |
| Angles | any: flat in a floor, on a wall, upside down in a ceiling — the spikes come out along the model's up axis |
| Scale | `1` |

Pattern: `^spike_spring(?:_.*)?$`, the parts after it split by `_` —
e.g. `spike_spring`, `spike_spring_2_0.5` (2 s down, 0.5 s up),
`spike_spring_offset1` (one second ahead of the others),
`spike_spring_downtime_uptime_1.5_0.5`, `spike_spring_1_1_offset0.5_left`.
A single number alone isn't a timing (`spike_spring_2` = the defaults).
Names may repeat.

The console says which springs the script runs, with the timing it read
from each name: `[melon_drive] spike springs: 3 running, new: …`. A
spring missing there isn't a `prop_dynamic` or isn't named `spike_spring…`.

**The model has no collision**: melons drive over and through it as if it
weren't there — the script does the hurting. Its origin is on the surface
in the middle of the shaft; the shaft goes 32 units in. A **32 × 32 hole**
in the surface there is only for the look (you see down the shaft, the
spring comes out of it); without one the spikes come straight out of the
closed surface. With a hole, close it with a `toolsnodraw` brush level with
the surface — invisible, but melons drive over it instead of falling in.
On a wall: pitch 90 makes the spikes point along the yaw (pitch 90, yaw 0
= towards +X); in a ceiling: roll 180.

## Timing

One round is down → rise → up → sink, then again. Every spike spring runs
on the same clock, so springs with the same name timing go up together;
`_offset<seconds>` shifts one along it — a row of springs with offsets 0,
0.3, 0.6, … makes a wave.

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `SPIKE_SPRING_DOWN_SECONDS` | 1.6 | seconds down, without `_<down>_<up>` | `world/spike-spring/constants.js` |
| `SPIKE_SPRING_UP_SECONDS` | 1 | seconds up, without `_<down>_<up>` | `world/spike-spring/constants.js` |
| `SPIKE_SPRING_SCAN_SECONDS` | 2 | how often the map is searched for (new) spike springs | `world/spike-spring/constants.js` |
| `SPIKE_SPRING_RISE_SECONDS` | 0.7 | the rise animation (pop and bounce) | `world/spike-spring/constants.js` |
| `SPIKE_SPRING_POP_SECONDS` | 0.12 | the spikes hurt from this far into the rise | `world/spike-spring/constants.js` |
| `SPIKE_SPRING_SINK_SECONDS` | 0.45 | the sink animation | `world/spike-spring/constants.js` |
| `SPIKE_SPRING_SINK_LETHAL_SHARE` | 0.5 | share of the sink the spikes still hurt | `world/spike-spring/constants.js` |
| `SPIKE_SPRING_HALF_SIZE` | 19 | a melon's center within this of the origin (each way along the surface, turned with the prop) is on it | `world/spike-spring/constants.js` |
| `SPIKE_SPRING_HEIGHT` | 44 | …and at most this far out of the surface (jump higher over a floor spring and it's safe) | `world/spike-spring/constants.js` |
| `SPIKE_SPRING_DEPTH` | 8 | …and at most this far behind it | `world/spike-spring/constants.js` |

## Rules

- Only `prop_dynamic`s are spike springs; anything else named
  `spike_spring…` is ignored.
- On the spikes while they're out, a melon breaks at once, like a
  [kill trigger](08-kill-triggers.md#kill-trigger); broken and race-locked
  melons are left alone. Down, the spring is just floor.
- Don't scale it: the script's square doesn't scale with it. (A
  `prop_dynamic` ignores a non-uniform scale in-game anyway.)
- The model's animation lengths come from the constants above
  (`tools/models/make-spike-spring-model.mjs` imports them): after changing
  one, re-run the tool and recompile the model.

---
[← Jump recharge zones](17-jump-recharge-zones.md) · [Mapping API](README.md) · [Ball pits →](19-ball-pits.md)
