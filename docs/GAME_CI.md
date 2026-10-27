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
- **Route gates in the hub** (`tools/models/make-hub-gate-model.mjs`): an inflatable arch in the white
  inflatable vinyl, tinted per prop in Hammer (render color), with graphite straps, plates and blower; the name sign graphite with white letters and edge.
- **Grand Prix pavilion** (`tools/models/make-pavilion-model.mjs`): white throughout, each piece tinted
  per prop in Hammer (the vinyl, canvas, pennants, letters, light ring), graphite straps, plates,
  piping and sign board, a checkered flag.
- **Inflatable trees** (`tools/models/make-tree-model.mjs`): trunk and crown in the white inflatable vinyl,
  each tinted per prop in Hammer, graphite straps, plate and valve.
- **Inflatable hedges** (`tools/models/make-hedge-model.mjs`): foliage and branches in the white inflatable vinyl,
  each tinted per prop in Hammer (a hedge green, a bark brown), graphite ground strip and valve.
- **Tree beds** (`tools/models/make-tree-bed-model.mjs`): a light sandstone wall (`#D6D1C6`) and a white
  picket fence, each tinted per prop in Hammer; bark mulch (`#4A3324`) or a natural grass green (`#5A9438`,
  darker than guide green on purpose) inside, not tinted.
- **Park walls, fences, benches** (`tools/models/make-park-model.mjs`): the tree beds' sandstone (`#D6D1C6`, tinted
  per prop) with grey mortar (`#8A867E`), white painted fences (tinted per prop), benches of oiled wood (`#A87244`)
  on graphite cast iron.
- **Inflatable mountain** (`tools/models/make-mountain-model.mjs`): every piece and its snow cap in the white
  inflatable vinyl, each tinted per prop in Hammer (a rock grey or brown, the caps white), a graphite valve.
- **Inflatable rocks** (`tools/models/make-rock-model.mjs`): the map borders, panels in the white inflatable vinyl,
  tinted per prop in Hammer (a stone grey, or any color), graphite valve, tie-down loops and stakes.
- **Inflatable podium** (`tools/models/make-inflatable-podium-model.mjs`): blocks, cushions and numbers in white,
  each tinted per prop in Hammer, graphite piping, bands, loops, badges and ground mat.
- **Stage** (`tools/models/make-stage-model.mjs`): a light grey deck and steps, tinted per prop, graphite panel
  joints, checks, inlay ring, step edges and bollards, warm white LED strips and bollard caps (their own
  models: tinted on their own).
- **Melon skins** (`tools/materials/make-melon-skins.mjs`): gold is one plain,
  faintly glowing metal gold (`#FFC456`), not checkpoint gold; camo is off-palette on
  purpose.
- **Foam bouncer** (`tools/models/make-bouncer-model.mjs`): pink foam paddle, lime top edge —
  off-palette on purpose, a playground decoration, not a guide line.
- **First-aid tent** (`tools/models/make-heal-tent-model.mjs`): arches and the roof's mast in the white inflatable vinyl, white canvas —
  each tinted per prop in Hammer —, graphite straps, plates, piping and signs with white letters; every cross (on the canvas,
  the mat, the turning one on the roof) a glowing pharmacy green, the heal holo gradient's `#28FF6E`: healing, like heal cyan.
- **Melon Boutique** (`tools/models/make-boutique-model.mjs`): frame, wall and swim rings in the white inflatable vinyl, the awning's
  two sets of stripes in white canvas — each tinted per prop in Hammer —, graphite straps, sign, plates and step edges with white letters,
  the stage's light grey step blocks (tinted per prop) with warm white LEDs.
- **Buffer stop** (`tools/models/make-buffer-stop-model.mjs`): magenta beam (`#FF20FF`, like the
  spike spring's rim), white chevron, grey steel — off-palette on purpose, an obstacle, not a start gate.
- **Basketball hoop** (`tools/models/make-basketball-hoop-model.mjs`): graphite steel post, a navy pad (`#1E3A8A`), white
  backboard with black lines, rim orange (`#F26B1D`), white net — off-palette on purpose, a real court.
- **Saw blade** (`tools/models/make-saw-blade-model.mjs`): bright steel, dark carbide
  tips, a signal red ring (`#E83C2A`) — off-palette on purpose, warning colors for a hazard.
- **Spike spring** (`tools/models/make-spike-spring-model.mjs`): steel spikes, chrome spring, a magenta rim
  (`#FF20FF`) — off-palette on purpose: close to start magenta, but a hazard, not a start gate.
- **Drone** (`tools/models/make-drone-model.mjs`): white shell, woven carbon chassis and arms, graphite
  frame, silver motor bells, amber lights, a red recording light on the camera — off-palette on purpose: a player avatar (free look), not a map signal.
- **Drone display** (`tools/models/make-drone-display-model.mjs`): the stage's light grey (tinted per prop) and graphite,
  a white landing pad ring and H, warm white LEDs; the sign graphite with white letters and edge, like the route gates' signs.
- **Spawn pad** (`tools/models/make-spawn-pad-model.mjs`): the stage's light grey (tinted per prop), graphite rings and spot,
  white chevrons, a warm white glowing ring (its own model: tinted on its own).
- **Floor spotlight** (`tools/models/make-floor-spotlight-model.mjs`): the stage's light grey base (tinted per prop), graphite
  yoke and head, grey fins, a warm white lens (`#FFF1D6`, like the pavilion's light ring) and a beam in the same warm white.
- **HUD** (`src/panorama/tokens.css`): its one gold (`$gold`) is checkpoint gold — the selected tab, ranks, reached
  checkpoints, a new best and the PERFECT rating (`BOUNCE_RATINGS`, also the guide line) alike. The rest of the HUD's
  colors (dark green panels, pale green text, lime, red) are listed there.
- **Half-pipe slide** (`tools/models/make-half-pipe-model.mjs`): sky blue playground plastic (`#3A8DFF`, not heal cyan), white lips,
  graphite legs — off-palette on purpose, a playground piece.
- **Bridge** (`tools/models/make-bridge-model.mjs`): the Severinsbruecke's green steel paint (`#87CC96`) on deck, pylon, struts,
  railing and cables, stone masonry (`#8E8476`) river piers with light concrete (`#B9B6AE`) coping and land plinths, asphalt road (`#3B3E44`)
  with white markings, graphite lamp posts with warm white lamps (`#FFF1D6`) — off-palette on purpose, a real bridge.
- **Kranhaus** (`tools/models/make-kranhaus-model.mjs`): dark blue-grey glass facades between white slab edges (`#DCDBD5`), white balcony
  slabs (`#E6E5E0`), a light glass stair tower, white concrete (`#E4E2DC`) inside the L — off-palette on purpose, a real building.
- **High-rise under construction** (`tools/models/make-highrise-model.mjs`): raw formwork concrete (`#B0AEA8`) with fresher
  slab edges and columns (`#C6C4BE`), dark window openings (some plywood, foil or red/white tape), red/white safety rails
  (`#D8342A`), rusty rebar, a galvanized scaffold with wooden planks — off-palette on purpose, a real building site.
- **Tower crane** (`tools/models/make-tower-crane-model.mjs`): steel and cab white, tinted per prop in Hammer (a crane color),
  graphite turntable, trolley and cables, concrete ballast, an amber hook block (`#E8A020`).
- **Lighthouse parkour** (`tools/models/make-parkour-model.mjs`): grey rock (`#7D7870`) with lighter paths (`#A89F8E`), ochre gorge walls
  (`#C27A3A`) where a wall is there to wall-jump off, a red and white lighthouse (`#D8342A`) with a glowing yellow lantern, stone quay,
  ships in red, navy and black over dark red antifouling, white stripes and deckhouses with dark window bands, black tire fenders,
  containers in blue/orange/green/red, yellow gantry cranes (`#F0B824`) — off-palette on purpose, a real harbor.
- **Coast rocks and plants** (`tools/models/make-coast-rock-model.mjs`, `make-coast-plant-model.mjs`): stone (`#868178`) with
  lichen-grey tops (`#B2AD96`); marram green (`#8EA452`) and straw, gorse green with yellow (`#F2C41E`), heather with purple, sea thrift
  pink, pine bark and needles, ice plant green with magenta flowers (`#E03C9A`) and reddish tips, dark ivy, fern and moss green, weathered
  roots — natural colors, tinted per prop.
- **Seagull** (`tools/models/make-seagull-model.mjs`): a herring gull — white, grey mantle (`#9CA6B0`), black wing tips, yellow beak with
  a red spot — on a straw nest with olive eggs; natural colors, not tinted.
- **Spinning hammer** (`tools/models/make-spin-hammer-model.mjs`): steel head, signal red rubber faces
  (`#E83C2A`, like the saw blade's ring), wooden handle, dark grey pedestal — off-palette on purpose, a hazard.

## Not on the palette yet

These colors were chosen before the palette was written down. Bring them
onto it when you're working on them anyway:

| Where | Color now | Probably meant |
|---|---|---|
| Checkpoint gate model's glow strips (`tools/models/make-checkpoint-model.mjs`, `GLOW_COLOR`) | `#AAFF33` | Checkpoint gold or guide green |
| 3D logo outline (`tools/models/make-logo-model.mjs`, `OUTLINE_COLOR`) | `#AAFF33` | Guide green |
| Holo gate gradient (`tools/materials/make-holo.mjs`, `GRADIENT`) | `#39FF14` → `#AA28FF` | — |
| Heal holo gradient (`tools/materials/make-holo.mjs`, `HEAL_GRADIENT`) | `#28FF6E` → `#6EFFD7` | Heal cyan |
