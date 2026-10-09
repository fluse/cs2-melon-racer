// Builds the checkpoint gate's frame as a 3D model for Hammer —
// `node tools/make-checkpoint-model.mjs`: two dark pillars on light feet with
// glowing lime strips down every side (so they read in a side-view zone too,
// where the gate is seen edge-on), a beam across with a glowing strip front
// and back, and a glowing diamond floating above its middle — the
// "checkpoint here" mark, the same from every direction. Two sizes (VARIANTS):
//   checkpoint_gate        replaces checkpoint_gate.vmap's orange pole/bar
//                          brushes: same footprint — pillars at y = ±112, the
//                          beam's underside at 104, on top of the holo surface
//   checkpoint_gate_small  for the 2D route's checkpoints (route_side_slice.vmap:
//                          two 8-unit poles 48 apart, no prefab) — the pillars
//                          48 apart, the details scaled down with it
// Each writes models/melon_racer/<name>.obj (render), <name>_physics.obj
// (collision: feet, pillars, beam — no strips, no diamond) and <name>.vmdl;
// both share materials/melon_racer/checkpoint_gate_{body,trim,glow}.vmat +
// _color.png. Compile the .vmdl files with resourcecompiler (see the end of
// the output). Origin on the floor in the middle of the gate, the pillars on
// either side along Y, the melon driving through along X.
import { ChamferedRect, Mesh, ObjText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "./model.mjs";

// pillarY: pillar centers, ±; beamBottom: the beam's underside; detail: scales
// every other measure (pillar and beam thickness, feet, strips, diamond).
const VARIANTS = [
    { name: "checkpoint_gate", pillarY: 112, beamBottom: 104, detail: 1 },
    { name: "checkpoint_gate_small", pillarY: 24, beamBottom: 84, detail: 0.6 },
];
const BODY_COLOR = [0x2b, 0x30, 0x38]; // graphite
const TRIM_COLOR = [0xd8, 0xdd, 0xe2]; // feet and caps, light grey
const GLOW_COLOR = [0xaa, 0xff, 0x33]; // the logo outline's lime
const GLOW_BRIGHTNESS = 2;

const MATERIAL_NAME = "checkpoint_gate";
const MODEL_DIR = "models/melon_racer";
const MATERIAL_DIR = "materials/melon_racer";
const GENERATOR = "tools/make-checkpoint-model.mjs";

const Shape = outer => [{ outer, holes: [] }];

/** An upright octagonal block centered on (x, y), from z0 to z1. */
function Block(mesh, x, y, width, chamfer, z0, z1, part) {
    mesh.Extrude(Shape(ChamferedRect(x, y, width, width, chamfer)), z0, z1, part, "z");
}

/** The render and collision meshes of one size. */
function BuildGate({ pillarY, beamBottom, detail: s }) {
    const render = new Mesh(64);
    const physics = new Mesh(64);
    const pillarWidth = 14 * s;
    const half = pillarWidth / 2;
    for (const y of [-pillarY, pillarY]) {
        // Feet, shaft, cap (bottom to top).
        for (const mesh of [render, physics]) {
            Block(mesh, 0, y, 28 * s, 6 * s, 0, 6 * s, "trim");
            Block(mesh, 0, y, 22 * s, 5 * s, 6 * s, 10 * s, "trim");
            Block(mesh, 0, y, pillarWidth, 3 * s, 10 * s, beamBottom - 4 * s, "body");
            Block(mesh, 0, y, 22 * s, 5 * s, beamBottom - 4 * s, beamBottom, "trim");
        }
        Block(render, 0, y, pillarWidth + 2.5 * s, 3.5 * s, beamBottom - 10 * s, beamBottom - 6 * s, "glow");
        // A glowing strip down the middle of each side, standing out of it.
        for (const [sx, sy, w, d] of [[1, 0, 2, 4], [-1, 0, 2, 4], [0, 1, 4, 2], [0, -1, 4, 2]]) {
            const cx = sx * (half + 0.5 * s), cy = y + sy * (half + 0.5 * s);
            render.Extrude(Shape(ChamferedRect(cx, cy, w * s, d * s, 0)), 16 * s, beamBottom - 14 * s, "glow", "z");
        }
    }

    // The beam, along Y: its profile in (z, x) — the "y" axis' 2D plane.
    const beamHeight = 18 * s, beamDepth = 18 * s;
    const beamZ = beamBottom + beamHeight / 2;
    const beamEnd = pillarY + 10 * s;
    for (const mesh of [render, physics]) {
        mesh.Extrude(Shape(ChamferedRect(beamZ, 0, beamHeight, beamDepth, 4 * s)), -beamEnd, beamEnd, "body", "y");
    }
    for (const side of [-1, 1]) {
        const x = side * (beamDepth / 2 + 0.5 * s);
        render.Extrude(Shape(ChamferedRect(beamZ, x, 4 * s, 2 * s, 0)), -(pillarY - 12 * s), pillarY - 12 * s, "glow", "y");
    }

    // The diamond: an octahedron, its corners on the axes, floating above the beam.
    const radius = 14 * s, halfHeight = 22 * s;
    const z = beamBottom + beamHeight + 6 * s + halfHeight;
    const top = [0, 0, z + halfHeight];
    const bottom = [0, 0, z - halfHeight];
    const ring = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([x, y]) => [x * radius, y * radius, z]);
    for (let i = 0; i < 4; i++) {
        const a = ring[i], b = ring[(i + 1) % 4];
        render.Tri(a, b, top, "glow");
        render.Tri(b, a, bottom, "glow");
    }
    return { render, physics, width: 2 * (pillarY + 14 * s), height: z + halfHeight };
}

const materials = Object.fromEntries(["body", "trim", "glow"].map(part => [part, `${MATERIAL_DIR}/${MATERIAL_NAME}_${part}.vmat`]));
for (const variant of VARIANTS) {
    const { name } = variant;
    const { render, physics, width, height } = BuildGate(variant);
    const obj = `${MODEL_DIR}/${name}.obj`;
    const physicsObj = `${MODEL_DIR}/${name}_physics.obj`;
    // Parts are named after the shared materials, whichever size.
    WriteAddonFile(obj, ObjText(render, MATERIAL_NAME, GENERATOR));
    WriteAddonFile(physicsObj, ObjText(physics, MATERIAL_NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: MATERIAL_NAME, obj, physicsObj, materials }));
    console.log(`  ${name}: ${render.triangleCount} triangles (collision ${physics.triangleCount}), ${width.toFixed(1)} wide, ${height.toFixed(1)} high`);
}
for (const [part, rgb, options] of [
    ["body", BODY_COLOR, { metalness: 0.3 }],
    ["trim", TRIM_COLOR, {}],
    ["glow", GLOW_COLOR, { glow: GLOW_BRIGHTNESS }],
]) {
    const texture = `${MATERIAL_DIR}/${MATERIAL_NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, ...options }));
}
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/<name>.vmdl"`);
