// Builds the checkpoint and finish gates as 3D models — `node tools/models/make-race-gate-model.mjs`:
// inflatable arches in the hub gates' style (tools/lib/inflatable.mjs) in
// place of checkpoint_gate.vmap's orange poles and finish_gate.vmap's blue
// bars, both the checkpoint gate's width (the trigger's 216 between the legs).
// A route gate's half circle that wide would stand over 200 high, so the arch
// is flattened (decided): straight legs up to SPRING, then a superellipse
// only RISE high over its 123 half width — round shoulders, a nearly flat top,
// 137 high in all, the opening's full height reaching close to the legs.
//
// The tube in the white inflatable vinyl (tinted by the prop's render color),
// pinched seams with dark straps, each leg in a squashed ring on a dark base
// plate, two guy ropes per leg, a blower at the right foot. On the top, front
// and back, a straight sign board on brackets, readable from both sides, and
// the holo panel filling the opening, shaped to the arch (no collision):
//   gate_checkpoint   CHECKPOINT in white on graphite, a glowing checkpoint
//                     gold edge (docs/GAME_CI.md); holo_checkpoint.vmat
//   gate_finish       FINISH in white on black between checkered blocks, a
//                     white edge; holo_zigzag.vmat (the finish prefab's)
//
// Origin on the floor in the middle of the opening, the legs on either side
// along Y, the melon driving through along X (like the prefabs' triggers).
// Writes models/melon_racer/race_gate/gate_<variant>.vmdl (+ .obj; collision
// gate_physics.obj, shared: tube, feet, blower) and
// materials/melon_racer/race_gate/race_gate_<part>.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the end of the output).
import { BUNGEE, LoadFont, TextShapes } from "../lib/font.mjs";
import { Blower, GuyRope, InflatableFoot, PolylinePath, RopeLoop, SegmentedTube } from "../lib/inflatable.mjs";
import { ChamferedRect, Mesh, ObjText, Shape, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- The arch (units; a melon is ~14 across; the route gate: radius 56, 132 high, tube 14) ---
const OPENING_HALF = 108; // clear half width between the legs: the checkpoint trigger's y +-108
const TUBE_RADIUS = 15;
const HALF_WIDTH = OPENING_HALF + TUBE_RADIUS; // the tube's centerline
const SPRING = 60; // where the legs turn into the arch
const RISE = 62; // the arch's height over SPRING (centerline): a half circle would be HALF_WIDTH
const SQUARENESS = 0.6; // the superellipse's exponent: 1 = an ellipse, smaller = squarer shoulders
const ARCH_SAMPLES = 400; // points along the arch's curve before the tube picks its rings
const TUBE_SIDES = 12; // around the tube: the lowest that still looks round and soft
const TUBE_STEP = 14; // units along the tube between rings, mid-segment
const SEGMENT_COUNT = 8;
const SEAM = { radius: 0.86, rounding: 5, rings: [0, 1.5, 5] };
const STRAP = { radius: TUBE_RADIUS * 0.93, halfWidth: 1.2, part: "dark" };
const FOOT = { plateRadius: 23, plateHeight: 3, platePart: "dark", radius: 21, height: 10, rings: 6, sides: TUBE_SIDES, part: "vinyl" };
const LEG_BOTTOM = FOOT.plateHeight + FOOT.height - 1; // the tube starts inside the ring
// Guy ropes: from the tube at ROPE_HEIGHT, front and back of each leg, to a
// stake ROPE_REACH out along X and ROPE_SPREAD further out along Y (off the track).
const ROPE_HEIGHT = 48;
const ROPE_REACH = 40;
const ROPE_SPREAD = 12;
const ROPE = { ropeRadius: 0.35, ropePart: "rope", stakeRadius: 0.7, stakeHeight: 3, stakePart: "dark" };
// The blower behind the right foot (-X), its duct into the ring.
const BLOWER = { x: -38, size: [10, 12, 9], ductRadius: 3.2 };
const HOLO_UV_TILE = 128; // units per texture repeat, like the brush panels at Hammer's default scale
const PHYSICS_SIDES = 8;
const PHYSICS_RINGS = 28;

// --- The sign on the top ---
const SIGN_HALF_HEIGHT = 13; // the tube (15) shows a little above and below it
const SIGN_FRONT = TUBE_RADIUS + 2; // the board's back face, out from the tube's middle (X)
const SIGN_THICKNESS = 1.5;
const SIGN_MAX_HALF_WIDTH = 92; // stays on the arch's flat part (the centerline drops ~4 there)
const SIGN_MARGIN = 7; // board past the text (or the checkers) at each end
const SIGN_CHAMFER = 3;
const SIGN_EDGE_INSET = 1.2; // the edge: this far in from the board's edge,
const SIGN_EDGE_WIDTH = 1; //   this wide,
const FLAT_RAISE = 0.15; // the edge, letters and checkers: flat faces this far in front of the board
const TEXT_HEIGHT = 13; // a capital letter's height (shrunk if the board would get too long)
const TEXT_LETTER_SPACING = 1;
const TEXT_CURVE_STEP = 4; // units per straight segment along a letter's curve
const CHECKER_ROWS = 3; // the finish sign's checkered blocks: rows inside the edge,
const CHECKER_COLS = 4; //   columns at each end
const CHECKER_GAP = 4; // between a block and the text
const BRACKET_SIZE = 3.5;

const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat";
const COLORS = {
    dark: { rgb: [0x2b, 0x30, 0x38] }, // the hub gates' graphite: straps, plates, blower, stakes, the checkpoint board
    rope: { rgb: [0x1a, 0x1c, 0x20] },
    black: { rgb: [0x14, 0x15, 0x17] }, // the finish board and its dark checkers
    white: { rgb: [0xf2, 0xf4, 0xf5] }, // letters, the finish edge and checkers
    gold: { rgb: [0xff, 0xca, 0x4f], glow: 1.5 }, // checkpoint gold, docs/GAME_CI.md
};
const VARIANTS = [
    { name: "gate_checkpoint", title: "CHECKPOINT", board: "dark", edge: "gold", holo: "materials/melon_racer/holo/holo_checkpoint.vmat", tint: "checkpoint gold 255 202 79" },
    { name: "gate_finish", title: "FINISH", board: "black", edge: "white", checkers: true, holo: "materials/melon_racer/holo/holo_zigzag.vmat", tint: "white 255 255 255 (or any: the checkers say finish)" },
];

const MODEL_DIR = "models/melon_racer/race_gate";
const MATERIAL_DIR = "materials/melon_racer/race_gate";
const GENERATOR = "tools/models/make-race-gate-model.mjs";

const SuperCos = (a, e) => Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** e;
const SuperSin = (a, e) => Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** e;

// The arch's centerline in the YZ plane, (y, z), from the left shoulder (-Y) over the top to the right one.
const ARCH = Array.from({ length: ARCH_SAMPLES + 1 }, (_, i) => {
    const t = Math.PI - (Math.PI * i) / ARCH_SAMPLES;
    return [HALF_WIDTH * SuperCos(t, SQUARENESS), SPRING + RISE * SuperSin(t, SQUARENESS)];
});
// The tube can't bend tighter than its own radius without folding into itself.
const tightest = Math.min(...ARCH.slice(1, -1).map((p, i) => {
    const a = ARCH[i], c = ARCH[i + 2];
    const ab = Math.hypot(p[0] - a[0], p[1] - a[1]), bc = Math.hypot(c[0] - p[0], c[1] - p[1]), ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const cross = Math.abs((p[0] - a[0]) * (c[1] - a[1]) - (p[1] - a[1]) * (c[0] - a[0]));
    return cross < 1e-9 ? Infinity : (ab * bc * ac) / (2 * cross);
}));
if (tightest < TUBE_RADIUS * 1.15) throw new Error(`the arch bends to a radius of ${tightest.toFixed(1)}, too tight for the tube (${TUBE_RADIUS}): raise SQUARENESS or RISE`);

const PATH_POINTS = [[0, -HALF_WIDTH, LEG_BOTTOM], ...ARCH.map(([y, z]) => [0, y, z]), [0, HALF_WIDTH, LEG_BOTTOM]];
const PATH = PolylinePath(PATH_POINTS);
const LEG_LENGTH = SPRING - LEG_BOTTOM;
const BENDS = [LEG_LENGTH, PATH.length - LEG_LENGTH];
const TOP = SPRING + RISE + TUBE_RADIUS;

const font = LoadFont(BUNGEE);

function BuildArch(mesh, physics) {
    SegmentedTube(mesh, {
        At: PATH.At, length: PATH.length, bends: BENDS, segments: SEGMENT_COUNT,
        radius: TUBE_RADIUS, sides: TUBE_SIDES, step: TUBE_STEP, seam: SEAM, strap: STRAP, part: "vinyl",
    });
    for (const side of [-1, 1]) {
        const y = side * HALF_WIDTH;
        InflatableFoot(mesh, 0, y, FOOT);
        for (const front of [-1, 1]) {
            GuyRope(mesh, [front * (TUBE_RADIUS - 1), y + side * 2, ROPE_HEIGHT], [front * ROPE_REACH, y + side * ROPE_SPREAD], ROPE);
        }
        RopeLoop(mesh, 0, y, ROPE_HEIGHT, TUBE_RADIUS, TUBE_SIDES, "rope");
    }
    Blower(mesh, physics, {
        at: [BLOWER.x, HALF_WIDTH], into: [-FOOT.radius + 3, HALF_WIDTH, FOOT.plateHeight + FOOT.height / 2],
        size: BLOWER.size, ductRadius: BLOWER.ductRadius, ductLow: BLOWER.ductRadius + FOOT.plateHeight,
        boxPart: "dark", ringPart: "rope", ductPart: "vinyl",
    });
}

/** The opening's holo panel, both sides, its edge just inside the tube, the texture upright. */
function BuildHolo(mesh) {
    const inset = TUBE_RADIUS - 1;
    const edge = [];
    for (let i = 0; i <= ARCH_SAMPLES; i += 10) {
        const a = ARCH[Math.max(0, i - 1)], b = ARCH[Math.min(ARCH_SAMPLES, i + 1)];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const inward = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len]; // the tangent turned towards the arch's middle
        edge.push([ARCH[i][0] + inward[0] * inset, ARCH[i][1] + inward[1] * inset]);
    }
    const panel = [[-OPENING_HALF - 1, 0], ...edge, [OPENING_HALF + 1, 0]].map(([y, z]) => [0, y, z]);
    const uvs = panel.map(([, y, z]) => [y / HOLO_UV_TILE, -z / HOLO_UV_TILE]);
    mesh.Face(panel, uvs, "holo");
    mesh.Face([...panel].reverse(), [...uvs].reverse(), "holo");
}

/** Mirrored across u = 0 (outer still counter-clockwise), so it reads right from behind. */
const Mirror = shapes => shapes.map(s => ({
    outer: s.outer.map(([u, v]) => [-u, v]).reverse(),
    holes: s.holes.map(h => h.map(([u, v]) => [-u, v]).reverse()),
}));

/** The sign on the top, front (+X) and back: board, edge, letters (u = Y, v = Z), finish checkers. */
function BuildSign(mesh, { title, board, edge, checkers }) {
    const center = SPRING + RISE; // the board's middle on the tube's top
    const innerHalf = SIGN_HALF_HEIGHT - SIGN_EDGE_INSET - SIGN_EDGE_WIDTH; // inside the edge
    const square = (2 * innerHalf) / CHECKER_ROWS;
    const blockWidth = checkers ? CHECKER_COLS * square + CHECKER_GAP : 0;
    const Shapes = height => TextShapes(font, title, height, { letterSpacing: (TEXT_LETTER_SPACING * height) / TEXT_HEIGHT, curveStep: TEXT_CURVE_STEP });
    const Width = shapes => {
        const us = shapes.flatMap(s => s.outer.map(p => p[0]));
        return [Math.min(...us), Math.max(...us)];
    };
    const room = 2 * (SIGN_MAX_HALF_WIDTH - SIGN_MARGIN - blockWidth);
    const [min0, max0] = Width(Shapes(TEXT_HEIGHT));
    const height = Math.min(TEXT_HEIGHT, (TEXT_HEIGHT * room) / (max0 - min0));
    const raw = Shapes(height);
    const [min, max] = Width(raw);
    const text = raw.map(s => {
        const Move = c => c.map(([u, v]) => [u - (min + max) / 2, center - height / 2 + v]);
        return { outer: Move(s.outer), holes: s.holes.map(Move) };
    });
    const half = (max - min) / 2 + blockWidth + SIGN_MARGIN;
    const i0 = half - SIGN_EDGE_INSET, i1 = SIGN_HALF_HEIGHT - SIGN_EDGE_INSET;
    const ring = Shape(ChamferedRect(0, center, 2 * i0, 2 * i1, SIGN_CHAMFER - 1),
        [ChamferedRect(0, center, 2 * (i0 - SIGN_EDGE_WIDTH), 2 * (i1 - SIGN_EDGE_WIDTH), SIGN_CHAMFER - 1.5)]);
    const back = SIGN_FRONT, face = SIGN_FRONT + SIGN_THICKNESS;
    const Both = (shapes, d0, d1, part, mirrored = shapes) => {
        mesh.Extrude(shapes, d0, d1, part, "x");
        mesh.Extrude(mirrored, -d1, -d0, part, "x");
    };
    // Flat on the board's face, front and back (single faces: no sides to pay for).
    const Flat = (shapes, part, mirrored = shapes) => {
        mesh.Cap(shapes, face + FLAT_RAISE, part, "x");
        mesh.Cap(mirrored, -face - FLAT_RAISE, part, "x", -1);
    };
    Both(Shape(ChamferedRect(0, center, 2 * half, 2 * SIGN_HALF_HEIGHT, SIGN_CHAMFER)), back, face, board);
    Flat(ring, edge);
    Flat(text, "white", Mirror(text));
    if (checkers) {
        // White squares on the black board, a block at each end; symmetric, so the same front and back.
        const squares = [];
        const outer = i0 - SIGN_EDGE_WIDTH;
        for (const side of [-1, 1]) {
            for (let r = 0; r < CHECKER_ROWS; r++) {
                for (let c = 0; c < CHECKER_COLS; c++) {
                    if ((r + c) % 2) continue;
                    const u = side * (outer - (c + 0.5) * square), v = center - innerHalf + (r + 0.5) * square;
                    squares.push(...Shape(ChamferedRect(u, v, square, square, 0)));
                }
            }
        }
        Flat(squares, "white");
    }
    // Brackets from inside the tube to the board: the middle and near both ends.
    for (const u of [-(half - 10), 0, half - 10]) {
        Both(Shape(ChamferedRect(u, center, BRACKET_SIZE, BRACKET_SIZE, 0.5)), TUBE_RADIUS - 4, back + 0.2, "dark");
    }
    return { height, half };
}

// The collision, shared by both: the tube (coarse), the feet, the blower.
const physics = new Mesh();
BuildArch(new Mesh(64), physics);
const physicsRings = Array.from({ length: PHYSICS_RINGS + 1 }, (_, i) => (PATH.length * i) / PHYSICS_RINGS);
physics.Tube([...physicsRings, ...BENDS].sort((a, b) => a - b).map(PATH.At), TUBE_RADIUS, PHYSICS_SIDES, "vinyl");
for (const y of [-HALF_WIDTH, HALF_WIDTH]) physics.Tube([[0, y, 0], [0, y, FOOT.plateHeight + FOOT.height]], FOOT.plateRadius, PHYSICS_SIDES, "vinyl");
const physicsObj = `${MODEL_DIR}/gate_physics.obj`;
WriteAddonFile(physicsObj, ObjText(physics, "race_gate", GENERATOR));

const partMaterial = part => `${MATERIAL_DIR}/race_gate_${part}.vmat`;
// Materials before the models: Hammer compiles a .vmdl as soon as it appears and would cache a missing material as ERROR.
for (const [part, { rgb, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/race_gate_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(partMaterial(part), VmatText({ texture, generator: GENERATOR, tint: 0, glow }));
}
for (const variant of VARIANTS) {
    const mesh = new Mesh(64);
    BuildArch(mesh, new Mesh());
    BuildHolo(mesh);
    const { height, half } = BuildSign(mesh, variant);
    const materials = Object.fromEntries(Object.keys(mesh.tris).map(part => [part,
        part === "vinyl" ? VINYL_MATERIAL : part === "holo" ? variant.holo : partMaterial(part)]));
    const obj = `${MODEL_DIR}/${variant.name}.obj`;
    WriteAddonFile(obj, ObjText(mesh, variant.name, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${variant.name}.vmdl`, VmdlText({ name: variant.name, mesh: obj, physicsObj, materials }));
    console.log(`  ${variant.name}.vmdl: ${mesh.triangleCount} triangles; "${variant.title}" ${height.toFixed(1)} high on a board ${(2 * half).toFixed(0)} wide; render color ${variant.tint}`);
}
console.log(`  collision ${physics.triangleCount} triangles; opening ${2 * OPENING_HALF} wide, ${SPRING + RISE - TUBE_RADIUS} high under the top, `
    + `its full height up to ${SPRING} at the legs; arch ${2 * (HALF_WIDTH + FOOT.plateRadius)} wide over the feet, ${TOP} high; `
    + `tightest bend ${tightest.toFixed(1)}; ropes ${ROPE_REACH} out front and back, the blower ${-BLOWER.x + BLOWER.size[0] / 2} behind`);
console.log(`place: prop_static ${MODEL_DIR}/gate_checkpoint.vmdl in maps/prefabs/checkpoint_gate.vmap at (4 0 0), yaw 0 (in place of the poles, the beam and the holo brush);`);
console.log(`       prop_static ${MODEL_DIR}/gate_finish.vmdl in maps/prefabs/finish_gate.vmap on its floor under the trigger, yaw 0 (in place of the bars and the holo brush); widen the finish trigger to y +-${OPENING_HALF}, ~${SPRING + RISE - TUBE_RADIUS - 4} high`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/<name>.vmdl"`);
