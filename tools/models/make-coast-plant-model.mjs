// Builds low-poly coastal plants for decoration — `node tools/models/make-coast-plant-model.mjs`,
// flat-shaded like the coast rocks (make-coast-rock-model.mjs): foliage is
// faceted blobs — convex polytopes from seeded planes (tools/lib/inflatable.mjs),
// flat underneath —, grass single bent blades. Seeded, so every run gives
// the same plants. Variants (VARIANTS):
//   dune_grass   a tuft of marram grass: bent blades, green and straw (both sides drawn), no collision
//   gorse        a gorse bush: green blobs with yellow flower specks; collision its blobs
//   heather      a low heather cushion with purple specks; no collision (melons roll over it)
//   thrift       sea thrift: a green cushion, pink flower balls on it; no collision
//   pine         a wind-bent pine: a trunk leaning downwind (+X), flat needle pads swept that way; collision the trunk
//   pine_small   the same, smaller
//   pine_large   the same, big (~420 high), four pads
//   umbrella_pine a stone pine: a tall trunk forking at the top into a wide flat crown (~400 high)
//   oak          a round deciduous tree: a short trunk, three boughs, a crown of blobs (~330 high)
//   oak_large    the same, big (~500 high)
//   cypress      a tall slim cypress: stacked narrow blobs (~460 high)
// Trees' collision is their trunk (and boughs): crowns are over a melon's head.
// Colors are tinted per prop (render color): a drier or greener coast without new models.
// Origin on the floor under the plant's foot.
// Writes models/melon_racer/coast/coast_plant_<variant>.vmdl (+ .obj, _physics.obj where solid)
// and materials/melon_racer/coast/coast_plant_<part>.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { Polytope, PolytopePlanes } from "../lib/inflatable.mjs";
import { Mesh, ObjText, SeededRandom, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

const BLOB = { minZ: -0.2, angleJitter: 0.3, depthJitter: 0.12 }; // foliage blobs: facets spread like the rocks'
const TRUNK_SIDES = 5; // round enough at play distance

/**
 * A faceted blob: a polytope over the ellipsoid `half` around `at`, its
 * bottom cut flat `flat` (share of its half height) under its middle.
 */
function Blob(mesh, physics, at, half, planes, seed, part) {
    const cut = PolytopePlanes({ half, lift: 0, seed }, { count: planes, minZ: BLOB.minZ, angleJitter: BLOB.angleJitter, depthJitter: BLOB.depthJitter, sink: half[2] * 0.6 });
    for (const { corners } of Polytope(cut)) {
        const p = corners.map(c => V3.Add(c, at));
        for (let i = 1; i + 1 < p.length; i++) {
            mesh.Tri(p[0], p[i], p[i + 1], part);
            physics?.Tri(p[0], p[i], p[i + 1], part);
        }
    }
}
/** A small four-sided speck (a flower) at p, size r, pointing along n. */
function Speck(mesh, p, n, r, part) {
    const side = V3.Unit(V3.Cross(n, Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), other = V3.Cross(n, side);
    const tip = V3.Add(p, V3.Scale(n, r * 1.2));
    const base = [0, 1, 2].map(k => V3.Add(p, V3.Add(V3.Scale(side, r * Math.cos((2 * Math.PI * k) / 3)), V3.Scale(other, r * Math.sin((2 * Math.PI * k) / 3)))));
    for (let k = 0; k < 3; k++) mesh.Tri(base[k], base[(k + 1) % 3], tip, part);
}
/** Specks scattered over the upper half of the ellipsoid `half` round `at`. */
function Specks(mesh, random, at, half, count, size, part) {
    for (let i = 0; i < count; i++) {
        const a = random() * 2 * Math.PI, z = 0.15 + 0.8 * random(), r = Math.sqrt(1 - z * z);
        const n = V3.Unit([r * Math.cos(a) / half[0], r * Math.sin(a) / half[1], z / half[2]]);
        const p = V3.Add(at, [r * Math.cos(a) * half[0], r * Math.sin(a) * half[1], z * half[2]]); // on the ellipsoid: the facets bulge past it, the speck pokes out of them
        Speck(mesh, p, n, size, part);
    }
}
/** One grass blade from its foot `p`, `height` tall, bending `lean` along `dir` — three triangles, drawn on both sides. */
function Blade(mesh, p, dir, height, lean, width, part) {
    const side = [-dir[1], dir[0], 0];
    const At = (f, w) => V3.Add(p, V3.Add(V3.Add(V3.Scale(dir, lean * f * f), [0, 0, height * f]), V3.Scale(side, w)));
    const a = At(0, -width), b = At(0, width), c = At(0.55, width * 0.6), d = At(0.55, -width * 0.6), tip = At(1, 0);
    for (const [x, y, z] of [[a, b, c], [a, c, d], [d, c, tip]]) { mesh.Tri(x, y, z, part); mesh.Tri(x, z, y, part); }
}

function DuneGrass() {
    const mesh = new Mesh(64), random = SeededRandom(31);
    for (let i = 0; i < 11; i++) {
        const a = (2 * Math.PI * i) / 11 + random() * 0.5, r = 4 + 6 * random();
        const dir = [Math.cos(a), Math.sin(a), 0];
        Blade(mesh, [dir[0] * r, dir[1] * r, -1], dir, 30 + 22 * random(), 10 + 12 * random(), 1.6, i % 3 ? "grass" : "straw");
    }
    return { mesh };
}

function Gorse() {
    const mesh = new Mesh(64), physics = new Mesh(), random = SeededRandom(41);
    const blobs = [{ at: [0, 0, 24], half: [34, 30, 26], seed: 2 }, { at: [26, 14, 16], half: [24, 22, 18], seed: 5 }, { at: [-20, 18, 14], half: [22, 20, 16], seed: 9 }];
    for (const b of blobs) {
        Blob(mesh, physics, b.at, b.half, 11, b.seed, "leaf");
        Specks(mesh, random, b.at, b.half, 7, 5, "yellow");
    }
    return { mesh, physics };
}

function Heather() {
    const mesh = new Mesh(64), random = SeededRandom(43);
    const blobs = [{ at: [0, 0, 8], half: [36, 30, 14], seed: 3 }, { at: [30, -10, 6], half: [24, 20, 10], seed: 6 }];
    for (const b of blobs) {
        Blob(mesh, null, b.at, b.half, 10, b.seed, "heath");
        Specks(mesh, random, b.at, b.half, 9, 4, "purple");
    }
    return { mesh };
}

function Thrift() {
    const mesh = new Mesh(64), random = SeededRandom(47);
    Blob(mesh, null, [0, 0, 5], [22, 20, 9], 9, 4, "grass");
    for (let i = 0; i < 6; i++) { // flower balls on short stems
        const a = (2 * Math.PI * i) / 6 + random() * 0.6, r = 6 + 9 * random(), top = 16 + 8 * random();
        const foot = [Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, 6], head = [Math.cos(a) * r, Math.sin(a) * r, top];
        Blade(mesh, foot, V3.Unit([head[0] - foot[0], head[1] - foot[1], 0.001]), top - 6, Math.hypot(head[0] - foot[0], head[1] - foot[1]), 0.6, "grass");
        Blob(mesh, null, head, [3.5, 3.5, 3.5], 6, 10 + i, "pink");
    }
    return { mesh };
}

/** A wind-bent pine: `height` tall, the trunk leaning `lean` downwind (+X), needle pads swept that way. */
function Pine({ height, lean, radius, pads, seed }) {
    const mesh = new Mesh(64), physics = new Mesh(), random = SeededRandom(seed);
    const Trunk = f => [lean * f * f, 4 * Math.sin(f * 5), height * f]; // bending further over the higher it gets
    const centers = Array.from({ length: 5 }, (_, i) => Trunk(i / 4));
    const R = i => radius * (1 - 0.55 * (i / 4));
    mesh.Tube(centers, R, TRUNK_SIDES, "bark");
    physics.Tube(centers, R, TRUNK_SIDES, "bark");
    // Branches: short stubs from the trunk downwind, each holding a pad.
    for (const [i, pad] of pads.entries()) {
        const foot = Trunk(pad.on), end = V3.Add(foot, [pad.reach, (random() - 0.5) * 30, pad.rise]);
        mesh.Tube([foot, end], radius * 0.35, 4, "bark", false);
        Blob(mesh, null, V3.Add(end, [pad.half[0] * 0.3, 0, 0]), pad.half, 10, seed + i, "needle");
    }
    return { mesh, physics };
}

/**
 * A tree with a crown of blobs: a trunk `height` tall (radius `radius`,
 * leaning `lean` along +X), boughs from its top (each [angle, reach, rise]),
 * a blob at each bough's end and `crown` blobs ({ at, half }, from the
 * trunk's top) — all in `part`.
 */
function CrownTree({ height, lean, radius, boughs, crown, seed, part = "leaf" }) {
    const mesh = new Mesh(64), physics = new Mesh();
    const Trunk = f => [lean * f * f, 0, height * f];
    const centers = Array.from({ length: 4 }, (_, i) => Trunk(i / 3));
    const R = i => radius * (1 - 0.4 * (i / 3));
    mesh.Tube(centers, R, TRUNK_SIDES, "bark");
    physics.Tube(centers, R, TRUNK_SIDES, "bark");
    const top = Trunk(1);
    boughs.forEach(([angle, reach, rise, half], i) => {
        const a = (angle * Math.PI) / 180, end = V3.Add(top, [Math.cos(a) * reach, Math.sin(a) * reach, rise]);
        const foot = Trunk(0.85);
        mesh.Tube([foot, end], radius * 0.45, 4, "bark", false);
        physics.Tube([foot, end], radius * 0.45, 4, "bark", false);
        if (half) Blob(mesh, null, end, half, 11, seed + i, part);
    });
    crown.forEach(({ at, half }, i) => Blob(mesh, null, V3.Add(top, at), half, 12, seed + 10 + i, part));
    return { mesh, physics };
}

const VARIANTS = [
    { name: "dune_grass", build: DuneGrass },
    { name: "gorse", build: Gorse },
    { name: "heather", build: Heather },
    { name: "thrift", build: Thrift },
    { name: "pine", build: () => Pine({ height: 260, lean: 90, radius: 9, seed: 51, pads: [
        { on: 1, reach: 40, rise: 8, half: [90, 64, 24] },
        { on: 0.78, reach: 56, rise: 0, half: [64, 50, 18] },
        { on: 0.6, reach: 30, rise: -4, half: [46, 40, 14] },
    ] }) },
    { name: "pine_small", build: () => Pine({ height: 150, lean: 50, radius: 6, seed: 57, pads: [
        { on: 1, reach: 24, rise: 4, half: [56, 42, 16] },
        { on: 0.7, reach: 30, rise: 0, half: [38, 32, 12] },
    ] }) },
    { name: "pine_large", build: () => Pine({ height: 420, lean: 150, radius: 15, seed: 61, pads: [
        { on: 1, reach: 60, rise: 10, half: [140, 100, 34] },
        { on: 0.84, reach: 90, rise: 4, half: [110, 84, 28] },
        { on: 0.68, reach: 70, rise: -4, half: [84, 66, 22] },
        { on: 0.52, reach: 50, rise: -6, half: [60, 50, 16] },
    ] }) },
    { name: "umbrella_pine", build: () => CrownTree({ height: 330, lean: 40, radius: 14, seed: 71, part: "needle",
        boughs: [[20, 90, 40, [110, 90, 26]], [160, 80, 30, [100, 84, 24]], [270, 70, 44, [90, 80, 22]]],
        crown: [{ at: [10, 0, 56], half: [150, 130, 34] }] }) },
    { name: "oak", build: () => CrownTree({ height: 150, lean: 20, radius: 16, seed: 81,
        boughs: [[30, 70, 60, [80, 70, 64]], [150, 64, 50, [74, 66, 58]], [270, 60, 70, [70, 64, 56]]],
        crown: [{ at: [0, 0, 120], half: [96, 90, 70] }] }) },
    { name: "oak_large", build: () => CrownTree({ height: 220, lean: 30, radius: 24, seed: 91,
        boughs: [[20, 110, 90, [120, 104, 90]], [140, 100, 70, [110, 96, 84]], [260, 96, 100, [104, 94, 82]], [330, 80, 130, [90, 84, 76]]],
        crown: [{ at: [0, 0, 180], half: [140, 130, 96] }] }) },
    { name: "cypress", build: () => CrownTree({ height: 60, lean: 0, radius: 10, seed: 101, part: "needle", boughs: [],
        crown: [{ at: [0, 0, 90], half: [56, 52, 110] }, { at: [4, 2, 230], half: [44, 42, 100] }, { at: [6, 4, 350], half: [28, 28, 70] }] }) },
];

const COLORS = {
    grass: [0x8e, 0xa4, 0x52], // marram green
    straw: [0xc4, 0xb0, 0x6a], // dry blades
    leaf: [0x4f, 0x72, 0x36], // gorse
    yellow: [0xf2, 0xc4, 0x1e],
    heath: [0x5e, 0x6a, 0x3e],
    purple: [0x9b, 0x5a, 0xa8],
    pink: [0xe8, 0x8a, 0xb0],
    bark: [0x6b, 0x4a, 0x34],
    needle: [0x3e, 0x5e, 0x3a],
};

const NAME = "coast_plant";
const MODEL_DIR = "models/melon_racer/coast";
const MATERIAL_DIR = "materials/melon_racer/coast";
const GENERATOR = "tools/models/make-coast-plant-model.mjs";
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
let total = 0;
for (const variant of VARIANTS) {
    const { mesh, physics } = variant.build();
    const name = `${NAME}_${variant.name}`;
    const obj = `${MODEL_DIR}/${name}.obj`, physicsObj = physics ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    if (physics) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    const all = Object.values(mesh.tris).flat().flat().map(([v]) => mesh.v[v - 1]);
    const size = [0, 1, 2].map(i => Math.max(...all.map(c => c[i])) - Math.min(...all.map(c => c[i])));
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles, ${physics ? `collision ${physics.triangleCount}` : "no collision"}; ${size.map(n => n.toFixed(0)).join(" x ")}`);
    total += mesh.triangleCount;
}
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR }));
}
console.log(`${NAME}: ${VARIANTS.length} variants, ${total} triangles in all`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<variant>.vmdl"`);
