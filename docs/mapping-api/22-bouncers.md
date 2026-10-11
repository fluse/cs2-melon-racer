[Mapping API](README.md) › **22. Bouncers** · [← Gravity zones](21-gravity-zones.md)

# 22. Bouncers

A foam paddle on a spring swinging from side to side — an obstacle in the
air the melons have to time their way past. The script finds every one by
its model and starts its swing loop **once, after a random delay** of up to
one swing, so a row of bouncers doesn't swing in step. No name, no
`logic_auto`, no outputs in Hammer.

| Setting | Value |
|---|---|
| Class | `prop_dynamic` |
| Model | `models/melon_racer/bouncer/bouncer.vmdl` |
| Name | any (or none) |
| Starting Animation, Idle Animation | empty — the script sets them (a `swing` set here also works, but every bouncer starts in step until the script takes over) |
| Angles | the paddle swings across its broad face, along the model's X in Hammer (ModelDoc turns the generator's Y there): stand it across the track, so the melons come at its face |
| Scale | any, uniform |

Until its delay is up a bouncer stands upright (`idle`), then swings on for
good. The console says when the script started some:
`[melon_drive] bouncers: 4 swinging, 4 new`. A bouncer that doesn't swing
isn't a `prop_dynamic` or has another model.

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `BOUNCER_SWING_SECONDS` | 2.4 | one full swing there and back — the longest start delay; shared with the model's generator | `world/bouncer/constants.js` |
| `BOUNCER_SCAN_SECONDS` | 2 | how often the map is searched for (new) bouncers | `world/bouncer/constants.js` |

## Rules

- Each bouncer gets its random start once; a round restart starts every
  bouncer again, at new random points.
- The paddle and its spring have collision: a melon hit by it takes an
  impact like at any other wall.

---
[← Gravity zones](21-gravity-zones.md) · [Mapping API](README.md)
