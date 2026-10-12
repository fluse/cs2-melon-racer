[Mapping API](README.md) › **24. Catapults** · [← Shopping carts](23-shopping-carts.md)

# 24. Catapults

A wooden catapult on wheels a melon rides in: it jumps into the bucket, sits
there, and **jump** fires — the arm swings up and throws it the way the
catapult faces. Bumping the catapult rolls and turns it (like a shopping
cart), so the others aim it. Two props at one spot; the script finds both by
their models, keeps the arm on its base and does the throw. No outputs in
Hammer.

| Setting | Base | Arm |
|---|---|---|
| Class | `prop_physics` (or `prop_physics_multiplayer` / `prop_physics_override`) | `prop_dynamic` |
| Model | `models/melon_racer/catapult/catapult_base.vmdl` | `models/melon_racer/catapult/catapult_arm.vmdl` |
| Name | any, or `catapult_<forward>_<up>` (the throw, units/s) | any (or none) |
| Origin, angles | on the floor, upright; it throws along its +X | the base's — within `CATAPULT_PAIR_DISTANCE` of it |
| Default Animation | — | `idle` (the script sets it too) |
| Scale | 1 | 1 |

| Name pattern (base) | `^catapult_(\d+(?:\.\d+)?)_(\d+(?:\.\d+)?)$` |
|---|---|
| Example | `catapult_1500_500`: 1500 units/s forward, 500 up |

The console names what it found:
`[melon_drive] catapults: 2 new, 2 in all` (and `, 1 without an arm`, or an
arm with no base near it). A catapult without its arm still throws, it just
doesn't show it.

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `CATAPULT_LAUNCH_FORWARD` | 1100 | the throw along the catapult's facing, units/s (unless its name says) | `world/catapult/constants.js` |
| `CATAPULT_LAUNCH_UP` | 700 | the throw upward, units/s | `world/catapult/constants.js` |
| `CATAPULT_SEAT_HALF_WIDTH` | 8 | a melon gets in once its center is in the bucket: this far from the seat, forward/back and to the sides (18 inside) | `world/catapult/constants.js` |
| `CATAPULT_SEAT_BELOW` | 3 | … from this far under the seat | `world/catapult/constants.js` |
| `CATAPULT_SEAT_ABOVE` | 9 | … to this far over it — near the bucket isn't enough | `world/catapult/constants.js` |
| `CATAPULT_SEAT_SETTLE_SECONDS` | 0.25 | jump doesn't fire right after getting in | `world/catapult/constants.js` |
| `CATAPULT_FIRE_SECONDS` | 0.3 | the throw's swing (the model's `fire`) | `world/catapult/constants.js` |
| `CATAPULT_FIRED_SECONDS` | 0.6 | the arm stays up (`fired`) | `world/catapult/constants.js` |
| `CATAPULT_RELOAD_SECONDS` | 1.6 | winding back down (`reload`); then the next melon can get in | `world/catapult/constants.js` |
| `CATAPULT_PAIR_DISTANCE` | 24 | an arm belongs to the base this close | `world/catapult/constants.js` |
| `CATAPULT_SCAN_SECONDS` | 1 | how often the map is searched for (new) catapults | `world/catapult/constants.js` |
| `CATAPULT_ROLL_DECEL` | 50 | rolling resistance, units/s²: what the rolling base still loses | `world/catapult/constants.js` |
| `CATAPULT_ROLL_MAX_DECEL` | 1500 | a faster loss is a hit (wall, melon), left to physics | `world/catapult/constants.js` |
| `CATAPULT_ROLL_STOP_SPEED` | 8 | below this, units/s, friction stops it | `world/catapult/constants.js` |
| `CATAPULT_ROLL_BLOCKED_SHARE` | 0.5 | moved less than this share of the way it was sent last tick, it's stuck: nothing given back | `world/catapult/constants.js` |
| `CATAPULT_ROLL_STEADY_TILT_SPEED` | 1 | tipping slower than this, degrees/s, and rolling as physics made it, the script leaves it alone that tick | `world/catapult/constants.js` |
| `CATAPULT_ROLL_MAX_TILT` | 25 | degrees the base tips at most | `world/catapult/constants.js` |
| `CATAPULT_ROLL_TILT_DAMPING` | 8 | how fast a wobble dies away, per second | `world/catapult/constants.js` |

## Rules

- In the bucket the melon is held there (it moves with the catapult): no
  driving, no attack boost; jump fires. Respawn, hub, tutorial or a heat
  starting take it out.
- The animation only shows the throw: the script carries the melon along
  the arm's swing and lets go of it at `CATAPULT_RELEASE_ANGLE`, with the
  throw plus the catapult's own speed.
- The flight takes no damage until shortly after landing, like a
  [jump pad](12-jump-pads.md) launch.
- The base rolls and turns when bumped: the script gives back what friction
  took (only `CATAPULT_ROLL_DECEL` stays) and keeps it upright; 2 kg, a
  melon's weight.
- Both are solid. The base: frame, wheels, crossbar, rest beam, winch. The
  arm: the bucket (floor and walls) and the beam's outer part, moving with
  the animation — melons can't drive through it, and one in the bucket sits
  on its floor. The two never touch over the whole swing (the generator
  checks it): a moving arm inside the base's collision would fling it away.

---
[← Shopping carts](23-shopping-carts.md) · [Mapping API](README.md)
