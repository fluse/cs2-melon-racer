[Mapping API](README.md) › **16. Movers** · [← Checking your map](15-checking.md)

# 16. Movers

Obstacles or platforms that go back and forth on their own, e.g. a block
sliding from left to right across the track. The script starts every mover
when the map loads (and after a round restart) and turns it round at each
end — no `logic_auto` and no outputs in Hammer.

| Setting | Value |
|---|---|
| Class | `func_movelinear` (brush: select it, **Ctrl+T**) |
| Name | `mover`, `mover_<anything>` or `mover_wait<seconds>[_<anything>]` |
| Move Direction | the direction it goes from its start (the arrow in the viewport) |
| Move Distance | how far it goes, in units |
| Speed | units/sec |
| Start Position | `0` — it starts at the position it's built in |
| Block Damage | `0` |

Pattern: `^mover(?:_wait(\d+(?:\.\d+)?))?(?:_.*)?$` — e.g. `mover_left`,
`mover_wait1.5`, `mover_wait2_gate_a`. Names may repeat.

To move a model instead of a brush, place a `prop_dynamic` (with collision)
and set its `Parent` to the mover; give the mover's brush
`toolsinvisible`.

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `MOVER_DEFAULT_WAIT` | 0 | seconds a mover without `_wait<seconds>` stands at each end | `world/mover/constants.js` |

## Rules

- Only `func_movelinear`s are movers; anything else named `mover…` is
  ignored. Outputs of your own on a mover still work, but don't also wire
  `OnFullyOpen → Close` / `OnFullyClosed → Open` — the script already does.
- Its sides are walls like any other: melons bounce and wall jump off them.
- Being pushed or hit by a mover is an impact: a hard one costs health and
  can break the melon.
- To make touching it break the melon at once, give it a
  [kill trigger](08-kill-triggers.md#kill-trigger) a little larger than the
  mover, with its `Parent` set to the mover so it moves along.

---
[← Checking your map](15-checking.md) · [Mapping API](README.md)
