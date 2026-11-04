// Builds low-poly coastal rocks for decoration — `node tools/models/make-coast-rock-model.mjs`:
// hard, faceted stones (flat-shaded, one triangle fan per facet), not the
// hub's inflatable ones. Each is a convex polytope — a floor plane and PLANES
// half-spaces spread over an ellipsoid, jittered by a seeded random
// (tools/lib/inflatable.mjs's PolytopePlanes/Polytope) — so every variant is
// the same on every run and different from the others. Facets facing up
// (normal z over TOP_MIN_Z) are a lighter, lichen-grey stone: the rocks read
// at a distance, sun on their tops. Variants (VARIANTS): a boulder, a flat
// slab, a sea stack, a cluster of three, a pebble; a cluster is several
// polytopes in one model. Stone is tinted per prop (render color), so the
// same rocks go grey, ochre or dark.
// Collision: the polytopes themselves (a concave mesh for a cluster) — a
// melon bounces off them like off any wall. Origin on the floor under the
// middle, the rock sunk SINK into it.
// Writes models/melon_racer/coast/coast_rock_<variant>.vmdl (+ .obj, _physics.obj)
// and materials/melon_racer/coast/coast_rock{,_top}.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { Polytope, PolytopePlanes } from "../lib/inflatable.mjs";
import { Mesh, ObjText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

const PLANES = 14; // facets besides the floor (fewer: blockier, cheaper)
const MIN_PLANE_Z = -0.35; // no facet normal points further down: the floor plane closes the bottom
const ANGLE_JITTER = 0.24; // radians a facet normal is turned off its even spread
const DEPTH_JITTER = 0.1; // share a facet is moved in or out
const SINK = 4; // the floor plane this far under the origin
const TOP_MIN_Z = 0.7; // a facet whose normal points up more than this is a top (lighter stone)

// half: the ellipsoid (x, y, z half-sizes), its middle `lift` up (below its
// half height: the floor cuts it to a wide base); seed: the random it's cut
// with; at: where it stands in the model (a cluster's pieces); planes: its facet count.
const VARIANTS = [
    { name: "boulder", pieces: [{ half: [64, 54, 48], lift: 22, seed: 3 }] },
    { name: "slab", pieces: [{ half: [112, 72, 30], lift: 10, seed: 8 }] },
    { name: "stack", pieces: [{ half: [52, 46, 150], lift: 120, seed: 15, planes: 16 }] }, // a sea stack: stands in the water
    { name: "cluster", pieces: [
        { half: [44, 38, 34], lift: 14, seed: 4, at: [0, 0] },
        { half: [30, 26, 22], lift: 8, seed: 11, at: [46, 22] },
        { half: [24, 22, 16], lift: 5, seed: 19, at: [-30, 40], planes: 10 },
    ] },
    { name: "pebble", pieces: [{ half: [22, 18, 12], lift: 4, seed: 27, planes: 10 }] },
    // Big ones, to dress a cliff (the parkour rock's tiers and path edges): more facets, so they don't read as shards.
    { name: "boulder_2", pieces: [{ half: [96, 80, 70], lift: 30, seed: 33, planes: 16 }] },
    { name: "boulder_3", pieces: [{ half: [120, 100, 64], lift: 20, seed: 37, planes: 16 }] },
    { name: "crag", pieces: [{ half: [200, 160, 150], lift: 70, seed: 41, planes: 18 }] }, // a big chunk of cliff
    { name: "crag_2", pieces: [{ half: [240, 150, 190], lift: 110, seed: 45, planes: 18 }] },
    { name: "cliff", pieces: [{ half: [300, 110, 260], lift: 180, seed: 49, planes: 18 }] }, // a wide, flat-faced wall piece: lean it against a tier
    { name: "cliff_2", pieces: [{ half: [380, 130, 200], lift: 130, seed: 53, planes: 18 }] },
    { name: "outcrop", pieces: [{ half: [320, 220, 90], lift: 20, seed: 57, planes: 16 }] }, // a big low shelf of rock, sunk in
    { name: "stack_large", pieces: [{ half: [130, 115, 380], lift: 300, seed: 61, planes: 20 }] }, // a big sea stack
    { name: "stack_large_2", pieces: [{ half: [100, 90, 460], lift: 380, seed: 63, planes: 20 }] }, // slimmer, taller
    { name: "stack_large_3", pieces: [{ half: [190, 150, 300], lift: 220, seed: 67, planes: 20 }] }, // broad and stumpy
    { name: "stack_large_4", pieces: [ // two peaks grown together
        { half: [120, 105, 360], lift: 280, seed: 71, at: [-60, 0], planes: 18 },
        { half: [95, 85, 250], lift: 190, seed: 75, at: [95, 30], planes: 16 },
    ] },
    { name: "stack_large_5", pieces: [ // a tall one with a fallen chunk at its foot
        { half: [115, 100, 420], lift: 340, seed: 79, at: [0, 0], planes: 20 },
        { half: [90, 70, 60], lift: 16, seed: 83, at: [170, -60], planes: 12 },
    ] },
    { name: "cluster_large", pieces: [
        { half: [150, 120, 110], lift: 50, seed: 65, at: [0, 0], planes: 16 },
        { half: [100, 90, 80], lift: 30, seed: 69, at: [170, 70], planes: 14 },
        { half: [80, 70, 50], lift: 16, seed: 73, at: [-120, 140], planes: 12 },
        { half: [60, 50, 40], lift: 12, seed: 77, at: [120, -130], planes: 12 },
    ] },
];

const COLORS = {
    stone: [0x86, 0x81, 0x78], // like the parkour rock, a touch lighter (props sit in its light)
    top: [0xb2, 0xad, 0x96], // sun-bleached, lichen-grey tops
};

const NAME = "coast_rock";
const MODEL_DIR = "models/melon_racer/coast";
const MATERIAL_DIR = "materials/melon_racer/coast";
const GENERATOR = "tools/models/make-coast-rock-model.mjs";

function Build(variant) {
    const mesh = new Mesh(64), physics = new Mesh();
    let bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (const piece of variant.pieces) {
        const [ax, ay] = piece.at ?? [0, 0];
        const planes = PolytopePlanes(piece, { count: piece.planes ?? PLANES, minZ: MIN_PLANE_Z, angleJitter: ANGLE_JITTER, depthJitter: DEPTH_JITTER, sink: SINK });
        for (const { plane, corners } of Polytope(planes)) {
            const at = corners.map(c => [c[0] + ax, c[1] + ay, c[2]]);
            for (const c of at) bounds = [bounds[0].map((m, i) => Math.min(m, c[i])), bounds[1].map((m, i) => Math.max(m, c[i]))];
            for (let i = 1; i + 1 < at.length; i++) physics.Tri(at[0], at[i], at[i + 1], "stone");
            if (plane.floor) continue; // in the ground, never seen
            const part = plane.n[2] > TOP_MIN_Z ? "top" : "stone";
            for (let i = 1; i + 1 < at.length; i++) mesh.Tri(at[0], at[i], at[i + 1], part);
        }
    }
    return { mesh, physics, size: V3.Sub(bounds[1], bounds[0]) };
}

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}${part === "stone" ? "" : `_${part}`}.vmat`]));
let total = 0;
for (const variant of VARIANTS) {
    const { mesh, physics, size } = Build(variant);
    const name = `${NAME}_${variant.name}`;
    const obj = `${MODEL_DIR}/${name}.obj`, physicsObj = `${MODEL_DIR}/${name}_physics.obj`;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles, collision ${physics.triangleCount}; ${size[0].toFixed(0)} x ${size[1].toFixed(0)}, ${(size[2] - SINK).toFixed(0)} high`);
    total += mesh.triangleCount;
}
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = materials[part].replace(/\.vmat$/, "_color.png");
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR }));
}
console.log(`${NAME}: ${VARIANTS.length} variants, ${total} triangles in all`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<variant>.vmdl"`);
