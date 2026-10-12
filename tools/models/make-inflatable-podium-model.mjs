// Builds an inflatable winners' podium for the hub — `node tools/models/make-inflatable-podium-model.mjs`,
// in the hub gates', pavilion's and trees' style (tools/lib/inflatable.mjs):
// three soft vinyl blocks side by side, the winner's in the middle and
// highest, 2nd on the viewer's left, 3rd on the right — the same footprint
// and heights as the solid podium (make-podium-model.mjs), so its
// podium_spawn_<place> info_targets fit either. Each step: a block with
// rounded edges and faces bulging a little (its bottom sunk into the floor,
// so it meets the ground with straight sides), dark welded piping down its
// four corners and a seam band round its top, grab loops on its back (and
// the outer side of 2nd and 3rd), a valve, a thicker cushion on top with
// piping round its middle, and its place number in Bungee on a round dark
// badge on the front, puffed up in layers. All three stand on a dark ground
// mat with D-rings and stakes along its edge; a blower behind the winner's
// step feeds them.
//
// Split into models so each piece can be tinted on its own (the prop's
// render color tints the white vinyl — surfaces/inflatable.vmat — and the
// numbers' faces, never the dark parts), all around the same origin (on the
// floor under the middle of the winner's step, the front facing +X): every
// piece is placed at that one spot with the same angles.
//   inflatable_podium_body_<place>    the block (solid)
//   inflatable_podium_top_<place>     its top cushion (solid: the racers stand on it)
//   inflatable_podium_number_<place>  its number on its badge
//   inflatable_podium_base            the ground mat under all three, its D-rings and stakes
//   inflatable_podium_blower          the blower (solid)
// Writes models/melon_racer/inflatable_podium/<piece>.vmdl (+ .obj, the solid
// ones with _physics.obj) and materials/melon_racer/inflatable_podium/
// inflatable_podium_{dark,number}.vmat (+ _color.png). Compile the .vmdl
// files with resourcecompiler (see the output).
import { BUNGEE, GrowShapes, LoadFont, TextShapes } from "../lib/font.mjs";
import { BlockOutline, Blower, InflatableBlock } from "../lib/inflatable.mjs";
import { ChamferedRect, Circle, Mesh, ObjText, Shape, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// The solid podium's layout (make-podium-model.mjs): y = the step's center
// (+Y is the viewer's right looking at the front).
const STEP_WIDTH = 112; // along Y, per step
const STEP_DEPTH = 112; // along X, front to back
const STEPS = [
    { place: 1, y: 0, height: 100 },
    { place: 2, y: -STEP_WIDTH, height: 72 },
    { place: 3, y: STEP_WIDTH, height: 48 },
];
const SPAWN_HEIGHT = 24; // podium_spawn_<place>: this far above the top, as for the solid podium

// --- The blocks ---
const BLOCK_INSET = 1; // each block a little smaller than its footprint, so neighbours touch, not cut into each other
const BLOCK_ROUND = 0.22; // superellipsoid exponent: a box with soft rounded edges
const TOP_THICKNESS = 14; // the cushion on top
const TOP_OVERHANG = 2; // it bulges out past the block this far
const TOP_ROUND = 0.35;
const TOP_SINK = 3; // the block reaches this far up into the cushion
const BLOCK_ROWS = 12; // pole to pole
const BLOCK_COLS = 32; // around
const BAND_HALF_HEIGHT = 1; // the dark seam band round the block, just under the cushion (clear of the number)
const BAND_BELOW_TOP = 2.5; // its middle this far under the cushion's bottom
const BAND_RAISE = 0.5;
const BLOCK_SINK = 8; // the block's rounded bottom this far under the floor: it meets the ground with straight sides
const PIPING = { radius: 0.7, sides: 4, step: 12 }; // welded seams: down the block's corners, round the cushion
// Grab loops: [face, offsets along it]; back: both steps, outer sides: 2nd (-Y) and 3rd (+Y).
const LOOP = { reach: 3.5, half: 6, radius: 0.7, below: 12, patch: [4, 5] }; // below: how far under the band
const LOOP_SPREAD = 24; // two loops per face, this far either side of its middle
const VALVE = { along: 34, z: 14, radius: 2.2, length: 3, capRadius: 2.8 }; // on the back, towards +Y

// --- The ground mat ---
const MAT = { margin: 9, height: 1.2, chamfer: 12 };
const D_RING = { radius: 2.2, tube: 0.35, out: 3.5 }; // lying flat at the mat's edge, a stake through each
const STAKE = { radius: 0.7, height: 3.5 };

// --- The numbers: on a round badge on the front ---
const BADGE_RADIUS = 14;
const BADGE_GAP = 5; // from the cushion down to the badge's top
const BADGE_RING = 1.6; // its rim, in the number's color
const DIGIT_HEIGHT = 18;
const DIGIT_SINK = 3; // the badge's back this far into the block
// The badge's face out of the block, and the number puffed up in layers on
// it: [shrunk by, out in front of the badge].
const BADGE_RAISE = 1.4;
const DIGIT_LAYERS = [[0, 1.4], [0.7, 2.3], [1.5, 2.9]];

// --- The blower: behind the winner's step, its duct into the block's back ---
const BLOWER = { size: [12, 14, 10], ductRadius: 3.5, behind: 34, ductZ: 14 };
const PHYSICS_ROUND = 4; // the collision boxes' chamfer

const COLORS = {
    dark: { rgb: [0x2b, 0x30, 0x38], tint: 0 }, // the hub gates' graphite: bands, piping, loops, valve, badges, the mat, the blower
    number: { rgb: [0xf2, 0xf4, 0xf5], tint: 1 }, // the numbers' faces
    rope: { rgb: [0x1a, 0x1c, 0x20], tint: 0 }, // the blower's intake ring
};
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat"; // tools/materials/make-inflatable.mjs, tinted per prop

const NAME = "inflatable_podium";
const MODEL_DIR = "models/melon_racer/inflatable_podium";
const MATERIAL_DIR = "materials/melon_racer/inflatable_podium";
const GENERATOR = "tools/models/make-inflatable-podium-model.mjs";

const font = LoadFont(BUNGEE);

/** The block of a step, as InflatableBlock wants it. */
const BlockSpec = ({ y, height }) => {
    const top = height - TOP_THICKNESS + TOP_SINK;
    return { center: [0, y, (top - BLOCK_SINK) / 2], half: [STEP_DEPTH / 2 - BLOCK_INSET, STEP_WIDTH / 2 - BLOCK_INSET, (top + BLOCK_SINK) / 2], round: BLOCK_ROUND, rows: BLOCK_ROWS, cols: BLOCK_COLS, part: "vinyl" };
};
const BAND_Z = height => height - TOP_THICKNESS - BAND_BELOW_TOP;

/** A closed loop of points as a tube's centerline (the first point again at the end). */
const Closed = points => [...points, points[0]];

function BuildBody(mesh, physics, step) {
    const spec = BlockSpec(step);
    InflatableBlock(mesh, spec);
    // The seam band round it, just under the cushion.
    const z = BAND_Z(step.height);
    const band = Shape(BlockOutline(spec, BAND_RAISE, BLOCK_COLS, z), [[...BlockOutline(spec, -2, BLOCK_COLS, z)].reverse()]);
    mesh.Extrude(band, z - BAND_HALF_HEIGHT, z + BAND_HALF_HEIGHT, "dark", "z");
    // Welded piping down the four corners, from the floor up to the band.
    const heights = [];
    for (let h = 0; h < z - BAND_HALF_HEIGHT; h += PIPING.step) heights.push(h);
    heights.push(z - BAND_HALF_HEIGHT);
    for (const j of [1, 3, 5, 7]) { // BlockOutline with 8 points: the corners at odd j
        mesh.Tube(heights.map(h => [...BlockOutline(spec, 0, 8, h)[j], h]), PIPING.radius, PIPING.sides, "dark", false);
    }
    const a = spec.half[0], b = spec.half[1];
    const loopZ = z - LOOP.below;
    // Grab loops on the back (-X) ...
    for (const k of [-1, 1]) {
        const yc = step.y + k * LOOP_SPREAD;
        mesh.Tube([-1, -0.7, 0, 0.7, 1].map(f => [-a - LOOP.reach * Math.cos((f * Math.PI) / 2), yc + f * LOOP.half, loopZ]), LOOP.radius, 6, "dark", false);
        for (const f of [-1, 1]) mesh.Extrude(Shape(ChamferedRect(yc + f * LOOP.half, loopZ, LOOP.patch[0], LOOP.patch[1], 1)), -a - 0.6, -a + 1, "dark", "x");
    }
    // ... and on the outer side of 2nd (-Y) and 3rd (+Y).
    const side = Math.sign(step.y);
    if (side) for (const k of [-1, 1]) {
        const xc = k * LOOP_SPREAD, yf = step.y + side * b;
        mesh.Tube([-1, -0.7, 0, 0.7, 1].map(f => [xc + f * LOOP.half, yf + side * LOOP.reach * Math.cos((f * Math.PI) / 2), loopZ]), LOOP.radius, 6, "dark", false);
        // Axis "y": u = Z, v = X.
        for (const f of [-1, 1]) mesh.Extrude(Shape(ChamferedRect(loopZ, xc + f * LOOP.half, LOOP.patch[1], LOOP.patch[0], 1)), yf - 1, yf + 0.6, "dark", "y");
    }
    // The valve on the back.
    const vy = step.y + VALVE.along;
    mesh.Tube([[-a + 1, vy, VALVE.z], [-a - VALVE.length, vy, VALVE.z]], VALVE.radius, 10, "dark");
    mesh.Tube([[-a - VALVE.length, vy, VALVE.z], [-a - VALVE.length - 1.2, vy, VALVE.z]], VALVE.capRadius, 10, "dark");
    physics.Extrude(Shape(ChamferedRect(0, step.y, STEP_DEPTH - 2 * BLOCK_INSET, STEP_WIDTH - 2 * BLOCK_INSET, PHYSICS_ROUND)), 0, step.height - TOP_THICKNESS, "vinyl", "z");
}

function BuildTop(mesh, physics, { y, height }) {
    const spec = {
        center: [0, y, height - TOP_THICKNESS / 2],
        half: [STEP_DEPTH / 2 - BLOCK_INSET + TOP_OVERHANG, STEP_WIDTH / 2 - BLOCK_INSET + TOP_OVERHANG, TOP_THICKNESS / 2],
        round: TOP_ROUND, rows: 8, cols: BLOCK_COLS, part: "vinyl",
    };
    InflatableBlock(mesh, spec);
    // The welded piping round its middle, where its top and bottom meet.
    const ring = BlockOutline(spec, 0, BLOCK_COLS).map(([px, py]) => [px, py, spec.center[2]]);
    mesh.Tube(Closed(ring), PIPING.radius, PIPING.sides, "dark", false);
    physics.Extrude(Shape(ChamferedRect(0, y, STEP_DEPTH, STEP_WIDTH, PHYSICS_ROUND)), height - TOP_THICKNESS, height, "vinyl", "z");
}

/** The place number on the step's front (+X): a round dark badge with a rim, the digit puffed up in layers on it. */
function BuildNumber(mesh, physics, { place, y, height }) {
    const zc = BAND_Z(height) - BAND_HALF_HEIGHT - BADGE_GAP - BADGE_RADIUS;
    const front = STEP_DEPTH / 2 - BLOCK_INSET; // the block's front face
    const face = front + BADGE_RAISE;
    mesh.Extrude(Shape(Circle(y, zc, BADGE_RADIUS, 32)), front - DIGIT_SINK, face, "dark", "x");
    mesh.Extrude(Shape(Circle(y, zc, BADGE_RADIUS + 0.2, 32), [Circle(y, zc, BADGE_RADIUS - BADGE_RING, 32)]), face - 0.4, face + 0.6, "number", "x");
    // The digit, centered on the badge (on its outline: Bungee's digits have no descenders).
    const shapes = TextShapes(font, String(place), DIGIT_HEIGHT, { curveStep: 3, minSegments: 1 });
    const pts = shapes.flatMap(s => s.outer);
    const [minU, maxU] = [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))];
    const [minV, maxV] = [Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1]))];
    const du = y - (minU + maxU) / 2, dv = zc - (minV + maxV) / 2;
    const Move = c => c.map(([u, v]) => [u + du, v + dv]);
    const digit = shapes.map(s => ({ outer: Move(s.outer), holes: s.holes.map(Move) }));
    for (const [shrink, out] of DIGIT_LAYERS) mesh.Extrude(shrink ? GrowShapes(digit, -shrink) : digit, face - 0.4, face + out, "number", "x");
}

/** The ground mat under all three steps, D-rings with stakes along its edge. */
function BuildBase(mesh) {
    const length = STEP_DEPTH + 2 * MAT.margin, width = 3 * STEP_WIDTH + 2 * MAT.margin;
    mesh.Extrude(Shape(ChamferedRect(0, 0, length, width, MAT.chamfer)), 0, MAT.height, "dark", "z");
    const spots = [];
    for (const x of [-1, 1]) for (const y of [-STEP_WIDTH, 0, STEP_WIDTH]) spots.push([x * (length / 2 + D_RING.out), y]);
    for (const y of [-1, 1]) spots.push([0, y * (width / 2 + D_RING.out)]);
    for (const [x, y] of spots) {
        mesh.Tube(Closed(Circle(x, y, D_RING.radius, 8).map(([u, v]) => [u, v, MAT.height * 0.6])), D_RING.tube, 4, "dark", false);
        mesh.Tube([[x, y, -1], [x, y, STAKE.height]], STAKE.radius, 6, "dark");
    }
}

function BuildBlower(mesh, physics) {
    const back = -(STEP_DEPTH / 2 - BLOCK_INSET);
    Blower(mesh, physics, {
        at: [back - BLOWER.behind, 0], into: [back + 4, 0, BLOWER.ductZ],
        size: BLOWER.size, ductRadius: BLOWER.ductRadius, ductLow: BLOWER.ductRadius,
        boxPart: "dark", ringPart: "rope", ductPart: "vinyl",
    });
}

const materials = {
    vinyl: VINYL_MATERIAL,
    ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])),
};

const PIECES = [
    ...STEPS.flatMap(step => [
        { piece: `body_${step.place}`, solid: true, Build: (m, p) => BuildBody(m, p, step) },
        { piece: `top_${step.place}`, solid: true, Build: (m, p) => BuildTop(m, p, step) },
        { piece: `number_${step.place}`, Build: (m, p) => BuildNumber(m, p, step) },
    ]),
    { piece: "base", Build: BuildBase },
    { piece: "blower", solid: true, Build: BuildBlower },
];

let total = 0;
for (const { piece, solid, Build } of PIECES) {
    const mesh = new Mesh(64);
    const physics = new Mesh();
    Build(mesh, physics);
    const name = `${NAME}_${piece}`;
    const obj = `${MODEL_DIR}/${name}.obj`;
    const physicsObj = solid ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    if (solid) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    total += mesh.triangleCount;
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles${solid ? ` (collision ${physics.triangleCount})` : ""}`);
}
for (const [part, { rgb, tint }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint }));
}
console.log(`all pieces: ${total} triangles; ${3 * STEP_WIDTH} wide, ${STEP_DEPTH} deep, ${Math.max(...STEPS.map(s => s.height))} high; the blower ${BLOWER.behind + BLOWER.size[0]} behind it`);
console.log("podium_spawn_<place> info_targets, relative to the podium's origin (not turned) — the same as for the solid podium:");
for (const { place, y, height } of STEPS) console.log(`  podium_spawn_${place}: 0 ${y} ${height + SPAWN_HEIGHT}`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<piece>.vmdl"`);
