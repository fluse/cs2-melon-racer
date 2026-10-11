# Melon Racer — Game CI

The map's color palette. Each color has one meaning, so players learn to
read it: a color on a surface tells them what that surface does. Use these
values for new materials, models, particles and HUD elements, and don't
reuse a color for something with a different meaning.

## Palette

| Color | Hex | RGB | Meaning |
|---|---|---|---|
| Guide green | `#90FF50` | 144, 255, 80 | Guide lines in the map: the way to go |
| Heal cyan | `#64FBDF` | 100, 251, 223 | Healing: heal zones and their gates |
| Checkpoint gold | `#FFCA4F` | 255, 202, 79 | Checkpoints |
| Start magenta | `#F70BC0` | 247, 11, 192 | Start gates |

## Where it's used

- **Podium** (`tools/models/make-podium-model.mjs`): 1st place in checkpoint gold,
  2nd in heal cyan, 3rd in start magenta (top plate and glowing number);
  the band under each plate in guide green.
- **Melon skins** (`tools/materials/make-melon-skins.mjs`): gold is one plain,
  faintly glowing metal gold (`#FFC456`), not checkpoint gold; camo is off-palette on
  purpose.
- **Foam bouncer** (`tools/models/make-bouncer-model.mjs`): pink foam, lime cap —
  off-palette on purpose, a playground decoration, not a guide line.
- **Buffer stop** (`tools/models/make-buffer-stop-model.mjs`): signal red beam, white
  chevron, grey steel — off-palette on purpose, warning colors for an obstacle.

## Not on the palette yet

These colors were chosen before the palette was written down. Bring them
onto it when you're working on them anyway:

| Where | Color now | Probably meant |
|---|---|---|
| Checkpoint gate model's glow strips (`tools/models/make-checkpoint-model.mjs`, `GLOW_COLOR`) | `#AAFF33` | Checkpoint gold or guide green |
| 3D logo outline (`tools/models/make-logo-model.mjs`, `OUTLINE_COLOR`) | `#AAFF33` | Guide green |
| Holo gate gradient (`tools/materials/make-holo.mjs`, `GRADIENT`) | `#39FF14` → `#AA28FF` | — |
| Heal holo gradient (`tools/materials/make-holo.mjs`, `HEAL_GRADIENT`) | `#28FF6E` → `#6EFFD7` | Heal cyan |
| HUD gold (`speedometer.css`, e.g. `.UserMenuButtonGold`) | `#FFD84D` | Checkpoint gold |
