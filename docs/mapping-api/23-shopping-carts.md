[Mapping API](README.md) › **23. Shopping carts** · [← Bouncers](22-bouncers.md) · [Catapults →](24-catapults.md)

# 23. Shopping carts

A shopping cart on casters a melon can ride in: it jumps into the basket,
another melon bumps into the cart and pushes it. **Plain physics, no
script**: no name, no outputs in Hammer, nothing the script looks up.

| Setting | Value |
|---|---|
| Class | `prop_physics` (or `prop_physics_multiplayer` / `prop_physics_override`) |
| Model | `models/melon_racer/shopping_cart/shopping_cart.vmdl` |
| Name | any (or none) |
| Render Color | tints the plastic (handle grip, front plate, caster caps); chrome and wheels stay |
| Angles | any yaw; the handle is at the model's -X. Stand it on the floor, upright |
| Scale | leave it at 1: the basket is sized for one melon (floor 30 x 22, rim 16 above it) |
| Start Asleep | off (or the first bump wakes it anyway) |

## Rules

- It weighs 3 kg, a melon 2: a melon at full speed sends it off, a melon
  in it rides along (pushed by the basket's walls). How far it goes is the
  engine's friction — it slides on its wheel blocks, it doesn't roll.
- Its walls aren't walls for the melons' bounces and wall jumps (a prop,
  like another melon); a hard knock is an impact like any other.
- It's solid all round, the basket included (convex hulls: floor, four
  walls, chassis, handle, wheels) — no melon passes through its walls.

---
[← Bouncers](22-bouncers.md) · [Mapping API](README.md) · [Catapults →](24-catapults.md)
