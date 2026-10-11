// Generates one segment of the free-look drone's laser pointer —
// `node tools/models/make-laser-model.mjs`: a thin, glowing red rod
// DRONE_LASER_SEGMENT long along +X, its origin at the start. CS2 has no
// env_beam, so the script (dev/free-look.js) draws the beam from copies of
// it laid end to end — copies of the point_template DRONE_LASER_TEMPLATE_NAME
// (a prop_dynamic with this model). No collision: melons and traces go
// through. Writes
//   models/melon_racer/laser/laser.obj   render mesh
//   models/melon_racer/laser/laser.vmdl
//   materials/melon_racer/laser/laser_beam.vmat (+ _color.png)
// Compile the .vmdl with resourcecompiler (see the end of the output).
import { Mesh, ObjText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";
import { DRONE_LASER_SEGMENT } from "../../src/melon_drive/dev/constants.js";

// --- shape (units) ---
const RADIUS = 0.12; // a thin beam, even next to a melon-sized drone
const SIDES = 6; // as low as still reads round at that size

// --- look: laser red, glowing ---
const BEAM_COLOR = [0xff, 0x22, 0x22];
const GLOW = 6;

const NAME = "laser";
const MODEL_DIR = "models/melon_racer/laser";
const MATERIAL_DIR = "materials/melon_racer/laser";
const GENERATOR = "tools/models/make-laser-model.mjs";

const rod = new Mesh(8);
rod.Tube([[0, 0, 0], [DRONE_LASER_SEGMENT, 0, 0]], RADIUS, SIDES, "beam", true);

const obj = `${MODEL_DIR}/${NAME}.obj`;
const materials = { beam: `${MATERIAL_DIR}/${NAME}_beam.vmat` };
WriteAddonFile(obj, ObjText(rod, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh: obj, materials }));
const texture = `${MATERIAL_DIR}/${NAME}_beam_color.png`;
WriteAddonFile(texture, SolidPng(BEAM_COLOR));
WriteAddonFile(materials.beam, VmatText({ texture, generator: GENERATOR, tint: 0, glow: GLOW }));
console.log(`${rod.triangleCount} triangles, no collision; ${DRONE_LASER_SEGMENT} long, ${2 * RADIUS} thick`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
