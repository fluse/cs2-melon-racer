// Builds a rock gate with a portcullis (Fallgatter) across a path —
// `node tools/models/make-portcullis-model.mjs`: an obstacle for the lighthouse
// cliff paths, a melon has to time its way through. No masonry: a natural
// arch of faceted low-poly rock in the parkour rock's grey (flat-shaded seeded
// polytopes like the coast rocks, tools/lib/inflatable.mjs; facets facing up a
// lighter, weathered tone), grown out of the floor on both sides and bridging
// the path, the passage cut clean out of it: its straight sides and a faceted
// arch (ARCH_FACES), every chunk clipped by one of those faces. The
// iron grid (bars, cross bars, spikes at its foot) slides up into a cleft in
// the rock over the arch and slams down again, on its own bone ("grid"):
//   cycle   closed CLOSED_SECONDS, winched up over RISE_SECONDS, open OPEN_SECONDS,
//           dropping in DROP_SECONDS (falling faster and faster), looping
//   open    held up (one frame)
//   closed  down (one frame)
//   idle    = closed
// Place it as a prop_dynamic with Idle Animation "cycle", Idle Animation Loop
// Mode "Loop" (Playback Rate for faster/slower). The course runs through it
// along X, the rock spans Y (about the cliff paths' width: push its ends into
// the cliff wall and over the lip). Several in a row: shift each one's start
// with the "Start Cycle"/random start keyvalue, or they move in step. Open,
// the spikes hang SPIKE.length under the arch's springing; closed, the grid is
// a wall (a hit is an impact like any other) — it doesn't break a melon it
// lands on. The generator fails if any part of the grid outside the passage
// (closed or open) would show through the rock.
// Origin on the floor in the middle of the passage.
// Collision: every rock chunk (convex) on the root, the grid (one solid slab:
// no squeezing between the bars) on "grid".
// ModelDoc turns an .smd 90 degrees round Z; it's written turned back (Unturn,
// like the swing anchor), so in Hammer every axis is as written here.
// Writes models/melon_racer/portcullis/portcullis.{smd,vmdl} (+ _<animation>.smd,
// _physics.obj, _physics_grid.obj) and materials/melon_racer/portcullis/portcullis_<part>.vmat.
// Compile the .vmdl with resourcecompiler (see the output).
import { Polytope, PolytopePlanes } from "../lib/inflatable.mjs";
import { AxisBox, BindFrame, Mesh, MeshSmdTriangles, ObjText, SmdAnimationText, SmdText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- the passage (units; the melon is ~14 across, a jump clears ~85; the cliff paths are 384 wide) ---
const CLEAR = 160; // the passage's width
const SPRING = 160; // where the arch starts: the straight sides' height
const R = CLEAR / 2; // the arch: its crown at SPRING + R
const APEX = SPRING + R;
// The arch is faceted, not round: one flat face of rock at each of these angles (degrees round it, 0 = the
// right side, 90 = the crown), tangent to a circle of R — each the clip of its own chunk (a convex chunk can
// only hug one face), irregular on purpose.
const ARCH_FACES = [0, 32, 64, 90, 118, 148, 180];
const GRID = { groove: 8, bar: 5, pitch: 20, crossBars: 6, crossBar: 6, thickness: 6 }; // the iron grid: reaching `groove` into the rock on each side
const SPIKE = { length: 12 }; // the points under each bar
const GRID_HEIGHT = APEX + 16; // closed, its top inside the rock over the crown
const LIFT = SPRING - SPIKE.length; // open, the spikes hang down to the springing

// --- the rock: chunks, each an ellipsoid cut by seeded planes, at (y, z), half sizes [x, y, z];
// `clip`: one of ARCH_FACES, the face of the passage it's kept behind ---
const CHUNKS = [
    { at: [-150, 40], half: [70, 80, 140], clip: 180, seed: 11 }, // left foot
    { at: [-132, 176], half: [62, 66, 96], clip: 180, seed: 12 },
    { at: [-236, 20], half: [54, 60, 80], seed: 13 }, // left outer boulder, into the cliff
    { at: [158, 30], half: [64, 88, 128], clip: 0, seed: 21 }, // right foot
    { at: [128, 168], half: [58, 60, 104], clip: 0, seed: 22 },
    { at: [222, 14], half: [50, 54, 60], seed: 23 }, // right outer boulder, over the lip
    { at: [-106, 226], half: [60, 72, 74], clip: 148, seed: 31 }, // shoulders: round the arch, overlapping at its corners
    { at: [106, 226], half: [58, 70, 74], clip: 32, seed: 32 },
    { at: [-59, 270], half: [56, 70, 70], clip: 118, seed: 33 },
    { at: [55, 272], half: [56, 70, 70], clip: 64, seed: 34 },
    { at: [-8, 340], half: [70, 156, 112], clip: 90, seed: 41 }, // the bridge over the arch, the grid's cleft inside
    { at: [-70, 432], half: [52, 70, 46], seed: 42 }, // on top: a ragged skyline
    { at: [64, 424], half: [46, 58, 40], seed: 43 },
];
const PLANES = 22; // facets per chunk (fewer: blockier, cheaper)
const ANGLE_JITTER = 0.3; // radians a facet normal is turned off its even spread
const DEPTH_JITTER = 0.12; // share a facet is moved in or out
const SINK = 4; // the floor cut this far under the origin
const TOP_MIN_Z = 0.7; // a facet whose normal points up more than this is weathered (lighter)

// --- cycle ---
const FPS = 30;
const CLOSED_SECONDS = 1.2;
const RISE_SECONDS = 1.2;
const OPEN_SECONDS = 1.6;
const DROP_SECONDS = 0.35; // falling: ~2 * LIFT / DROP_SECONDS at the bottom

// --- look: the parkour rock, its tops like the coast rocks', blackened iron ---
const COLORS = {
    rock: { rgb: [0x7d, 0x78, 0x70] },
    rock_top: { rgb: [0xa8, 0xa2, 0x92] },
    iron: { rgb: [0x2e, 0x30, 0x34], metalness: 0.5 },
};

const NAME = "portcullis";
const MODEL_DIR = "models/melon_racer/portcullis";
const MATERIAL_DIR = "materials/melon_racer/portcullis";
const GENERATOR = "tools/models/make-portcullis-model.mjs";
const HALF = CLEAR / 2;

/** One chunk's planes in the model's frame: the seeded ellipsoid cut, moved to its place, the floor and its clip. */
function ChunkPlanes({ at: [y, z], half, clip, seed }) {
    const c = [0, y, z];
    const planes = PolytopePlanes({ half, lift: 0, seed }, { count: PLANES, minZ: -1, angleJitter: ANGLE_JITTER, depthJitter: DEPTH_JITTER, sink: 0 })
        .filter(p => !p.floor)
        .map(({ n, d }) => ({ n, d: d + V3.Dot(n, c) }));
    planes.push({ n: [0, 0, -1], d: SINK, floor: true });
    if (clip !== undefined) {
        // Behind the arch's face at that angle: -(cos a y + sin a (z - SPRING)) <= -R (at 0 and 180 the passage's sides, all the way down).
        if (!ARCH_FACES.includes(clip)) throw new Error(`chunk ${seed}: clip ${clip} isn't one of ARCH_FACES`);
        const a = (clip * Math.PI) / 180;
        planes.push({ n: [0, -Math.cos(a), -Math.sin(a)], d: -R - Math.sin(a) * SPRING });
    }
    return planes;
}
const chunks = CHUNKS.map(ChunkPlanes);

/** Whether p is in the passage or on its edge (where the grid may show). */
const InPassage = ([, y, z]) => (Math.abs(y) <= HALF + 0.5 && z <= SPRING) ||
    (z >= SPRING && ARCH_FACES.every(deg => Math.cos((deg * Math.PI) / 180) * y + Math.sin((deg * Math.PI) / 180) * (z - SPRING) <= R + 0.5));
/** Whether p is inside some chunk, at least `margin` from its faces. */
const InRock = (p, margin) => chunks.some(planes => planes.every(({ n, d }) => V3.Dot(n, p) <= d - margin));

function BuildRock(mesh, physics) {
    for (const planes of chunks) {
        for (const { plane, corners } of Polytope(planes)) {
            if (plane.floor) continue; // under the floor: never seen
            const part = plane.n[2] > TOP_MIN_Z ? "rock_top" : "rock";
            for (let i = 1; i + 1 < corners.length; i++) mesh.Tri(corners[0], corners[i], corners[i + 1], part);
        }
        for (const { corners } of Polytope(planes)) for (let i = 1; i + 1 < corners.length; i++) physics.Tri(corners[0], corners[i], corners[i + 1], "rock");
    }
}

/** The grid down (closed), its spikes' tips on the floor. */
function BuildGrid(mesh, physics) {
    const w = HALF + GRID.groove, t = GRID.thickness / 2, b = GRID.bar / 2;
    const bars = Math.floor(CLEAR / GRID.pitch);
    for (let i = 0; i <= bars; i++) {
        const y = -HALF + ((i + 0.5) * CLEAR) / (bars + 1);
        AxisBox(mesh, [-b, y - b, SPIKE.length], [b, y + b, GRID_HEIGHT], "iron");
        mesh.Cone([0, y, SPIKE.length + 0.1], [0, y, 0], b * 1.3, 4, "iron");
    }
    for (let i = 0; i < GRID.crossBars; i++) {
        const z = SPIKE.length + 6 + ((GRID_HEIGHT - SPIKE.length - 6 - GRID.crossBar) * i) / (GRID.crossBars - 1);
        AxisBox(mesh, [-t, -w, z], [t, w, z + GRID.crossBar], "iron");
    }
    AxisBox(physics, [-t, -HALF - 1, 0], [t, HALF + 1, GRID_HEIGHT], "iron");
}

// The grid's box, closed and open, sampled: every point outside the passage must be in the rock.
const misses = [];
for (const lift of [0, LIFT]) {
    for (const x of [-GRID.thickness / 2, GRID.thickness / 2]) {
        for (let y = -HALF - GRID.groove; y <= HALF + GRID.groove; y += 4) {
            for (let z = 0; z <= GRID_HEIGHT; z += 4) {
                const p = [x, y, z + lift];
                if (!InPassage(p) && !InRock(p, 0)) misses.push(p);
            }
        }
    }
}
if (misses.length) {
    const ys = misses.map(p => p[1]), zs = misses.map(p => p[2]);
    throw new Error(`the grid shows through the rock at ${misses.length} points (y ${Math.min(...ys)}..${Math.max(...ys)}, z ${Math.min(...zs)}..${Math.max(...zs)}; e.g. ${misses.filter((_, i) => i % Math.ceil(misses.length / 12) === 0).map(([, y, z]) => `${y}/${z}`).join(", ")}): move or grow the CHUNKS there`);
}

// --- skeleton and animations ---
// ModelDoc turns an .smd 90 degrees around Z ((x, y, z) -> (-y, x, z)): written turned back.
const Unturn = ([x, y, z]) => [y, -x, z];
const BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    { name: "grid", parent: 0, bind: [0, 0, 0] },
];
const GRID_BONE = 1;
/** The skeleton with the grid `h` up. */
function GridFrame(h) {
    const frame = BindFrame(BONES);
    frame[GRID_BONE].pos = [0, 0, h];
    return frame;
}
const Smooth = f => f * f * (3 - 2 * f);
/** The grid's height t seconds into the cycle: closed, winched up, open, dropping. */
function CycleHeight(t) {
    if ((t -= CLOSED_SECONDS) < 0) return 0;
    if (t < RISE_SECONDS) return LIFT * Smooth(t / RISE_SECONDS);
    if ((t -= RISE_SECONDS) < OPEN_SECONDS) return LIFT;
    t -= OPEN_SECONDS;
    return LIFT * (1 - Math.min(1, t / DROP_SECONDS) ** 2);
}
const CYCLE_SECONDS = CLOSED_SECONDS + RISE_SECONDS + OPEN_SECONDS + DROP_SECONDS;
// The last frame would repeat the first (closed), so it's left out.
const cycleFrames = Array.from({ length: Math.round(CYCLE_SECONDS * FPS) }, (_, f) => GridFrame(CycleHeight(f / FPS)));

const rock = new Mesh(64), rockPhysics = new Mesh();
BuildRock(rock, rockPhysics);
const grid = new Mesh(32), gridPhysics = new Mesh();
BuildGrid(grid, gridPhysics);

const Turned = tris => tris.map(tri => ({ ...tri, corners: tri.corners.map(c => ({ ...c, p: Unturn(c.p), n: Unturn(c.n) })) }));
const triangles = Turned([...MeshSmdTriangles(rock, NAME, 0), ...MeshSmdTriangles(grid, NAME, GRID_BONE)]);
const animations = [
    { name: "cycle", frames: cycleFrames },
    { name: "open", frames: [GridFrame(LIFT)] },
    { name: "closed", frames: [GridFrame(0)] },
    { name: "idle", frames: [GridFrame(0)] },
].map(a => ({ ...a, file: `${MODEL_DIR}/${NAME}_${a.name}.smd`, looping: true }));
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`${MODEL_DIR}/${NAME}.smd`, SmdText(BONES, triangles));
for (const a of animations) WriteAddonFile(a.file, SmdAnimationText(BONES, a.frames));
// In Hammer's frame like the render mesh (written turned back), so no { smd: true } turn here.
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics.obj`, ObjText(rockPhysics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics_grid.obj`, ObjText(gridPhysics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({
    name: NAME,
    mesh: `${MODEL_DIR}/${NAME}.smd`,
    physicsObj: [
        { file: `${MODEL_DIR}/${NAME}_physics.obj`, bone: "" },
        { file: `${MODEL_DIR}/${NAME}_physics_grid.obj`, bone: "grid" },
    ],
    materials,
    animations: animations.map(({ name, file, looping }) => ({ name, file, looping })),
    surfaceProp: "rock",
}));
for (const [part, { rgb, metalness = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, metalness, tint: 0 }));
}
const extent = axis => {
    const v = rock.v.map(p => p[axis]);
    return [Math.min(...v), Math.max(...v)].map(Math.round);
};
console.log(`${triangles.length} triangles (rock ${rock.triangleCount} in ${CHUNKS.length} chunks, grid ${grid.triangleCount}; collision ${rockPhysics.triangleCount} + ${gridPhysics.triangleCount}), cycle ${cycleFrames.length} frames = ${CYCLE_SECONDS.toFixed(2)} s (closed ${CLOSED_SECONDS}, rise ${RISE_SECONDS}, open ${OPEN_SECONDS}, drop ${DROP_SECONDS})`);
console.log(`passage ${CLEAR} wide, ${SPRING} to the springing, ${APEX} to the crown (open: ${LIFT} under the spikes); the rock x ${extent(0).join("..")}, y ${extent(1).join("..")}, z up to ${extent(2)[1]}`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
