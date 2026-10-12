// Builds the hub's route gate and its name signs — `node tools/models/make-hub-gate-model.mjs`.
//
// The gate (one for every route): an inflatable event arch, a fat round tube
// bent into an upside-down U, in the white glossy vinyl of the pool toys
// (surfaces/inflatable.vmat itself) — tinted in Hammer by the prop's render
// color; the dark parts and the sign don't take the tint. Its segments
// meet in pinched seams, each with a dark strap around it; each leg stands
// in a squashed ring on a dark base plate, held by two guy ropes to stakes in
// the ground (front and back), and a blower box at the right foot feeds the
// arch through a fabric duct — the details of a real one, so it doesn't look
// like a toy.
//
// The name signs (one per route prefab, route_<route>.vmap, not the
// tutorial; named like the hub window's route cards): a curved dark board on
// three brackets in front of the arch's top and one behind it, a white edge
// and the route's name in white Bungee letters, bent along the curve —
// readable from both sides. Same origin as the gate: placed at the gate's
// position and angles, it sits on it.
//
// Writes
//   models/melon_racer/hub_gate/hub_gate.vmdl               the gate (+ .obj, hub_gate_physics.obj)
//   models/melon_racer/hub_gate/hub_gate_name_<route>.vmdl  a name sign (+ .obj; no collision)
//   materials/melon_racer/hub_gate/hub_gate_<part>.vmat (+ _color.png)
// Re-run after adding or renaming a route. Origin on the floor in the middle
// of the opening, the legs on either side along Y, the melon driving through
// along X. Compile the .vmdl files with resourcecompiler (see the end of the output).
import { readdirSync } from "node:fs";
import { BUNGEE, LoadFont, TextShapes } from "../lib/font.mjs";
import { Blower, GuyRope, InflatableFoot, RopeLoop, SegmentedTube } from "../lib/inflatable.mjs";
import { ChamferedRect, Mesh, ObjText, Shape, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- The arch ---
const ARC_RADIUS = 56; // the tube's centerline: half the distance between the legs, and the arc's radius
const ARC_CENTER_Z = 62; // where the legs turn into the arc
const TUBE_RADIUS = 14;
const TUBE_SIDES = 16; // around the tube: the lowest that still looks round and soft
const TUBE_STEP = 12; // units along the tube between rings, mid-segment
const SEGMENT_COUNT = 8;
// The seam between two segments: each end pinched to SEAM_RADIUS of the tube,
// rounding back out to full size over SEAM_ROUNDING units (rings at SEAM_RINGS).
const SEAM_RADIUS = 0.86;
const SEAM_ROUNDING = 5;
const SEAM_RINGS = [0, 1.5, SEAM_ROUNDING];
const STRAP_RADIUS = 13; // the dark strap in each seam: sunk into the tube at its edges
const STRAP_HALF_WIDTH = 1.2;
// The feet: a dark base plate, a squashed ring on it, the tube standing in the ring.
const PLATE_RADIUS = 22;
const PLATE_HEIGHT = 3;
const FOOT_RADIUS = 20; // outside of the ring
const FOOT_HEIGHT = 10;
const FOOT_RINGS = 8; // along the ring's rounded profile
const LEG_BOTTOM = PLATE_HEIGHT + FOOT_HEIGHT - 1; // the tube starts inside the ring
// Guy ropes: from the tube at ROPE_HEIGHT, front and back of each leg, to a
// stake ROPE_REACH out along X and ROPE_SPREAD further out along Y.
const ROPE_HEIGHT = 44;
const ROPE_REACH = 38;
const ROPE_SPREAD = 10;
const ROPE_RADIUS = 0.35;
const STAKE_RADIUS = 0.7;
const STAKE_HEIGHT = 3;
// The blower behind the right foot (-X), its duct into the ring.
const BLOWER_X = -36;
const BLOWER_SIZE = [10, 12, 9]; // along X, Y, Z
const DUCT_RADIUS = 3.2;
const PHYSICS_SIDES = 8;

// --- The name sign ---
const SIGN_HALF_HEIGHT = 9; // radially, around the arc's centerline
const SIGN_FRONT = TUBE_RADIUS + 2; // the board's back face, out from the tube's middle (X)
const SIGN_THICKNESS = 1.5;
const SIGN_MIN_ANGLE = (90 * Math.PI) / 180; // a short name still gets a board this long
const SIGN_MARGIN = 7; // units of board past the name's ends
const SIGN_EDGE_INSET = 1; // the white edge: this far in from the board's edge,
const SIGN_EDGE_WIDTH = 0.8; //   this wide,
const SIGN_EDGE_RAISE = 0.4; //   standing this far out
const BRACKET_SIZE = 3;
const TEXT_HEIGHT = 11; // a capital letter's height
const TEXT_RAISE = 0.8;
const TEXT_LETTER_SPACING = 0.8;
const TEXT_CURVE_STEP = 3; // units per straight segment along a letter's curve
// Straight edges are split this fine before bending: the board's long arcs
// need it, a letter only 11 high hardly bends (0.3 units over its height).
const BEND_STEP = 8; // a chord this long on the sign's arcs is 0.1 units off the curve
const TEXT_BEND_STEP = 12;
const TEXT_MAX_ANGLE = (130 * Math.PI) / 180; // a longer name is set smaller

// The vinyl (tube, foot rings, duct): the shared white inflatable material,
// tinted by the entity's render color (tools/materials/make-inflatable.mjs).
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat";
// Everything else: its own materials, not tinted.
const COLORS = {
    dark: { rgb: [0x2b, 0x30, 0x38] }, // straps, plates, blower, sign board: the checkpoint gate's graphite
    rope: { rgb: [0x1a, 0x1c, 0x20] },
    white: { rgb: [0xf2, 0xf4, 0xf5] }, // the sign's letters and edge
};

const NAME = "hub_gate";
const MODEL_DIR = "models/melon_racer/hub_gate";
const MATERIAL_DIR = "materials/melon_racer/hub_gate";
const GENERATOR = "tools/models/make-hub-gate-model.mjs";

const font = LoadFont(BUNGEE);

/** route_side_slice.vmap -> { slug: "side_slice", title: "SIDE SLICE" }, every route but the tutorial. */
const ROUTES = readdirSync(new URL("../../maps/prefabs/", import.meta.url))
    .map(file => /^route_(.+)\.vmap$/.exec(file)?.[1])
    .filter(slug => slug && slug !== "tutorial")
    .map(slug => ({ slug, title: slug.split("_").join(" ").toUpperCase() }));

// The tube's centerline by length s: up the left leg, over the arc, down the right leg.
const LEG_LENGTH = ARC_CENTER_Z - LEG_BOTTOM;
const ARC_LENGTH = Math.PI * ARC_RADIUS;
const PATH_LENGTH = 2 * LEG_LENGTH + ARC_LENGTH;
const BENDS = [LEG_LENGTH, LEG_LENGTH + ARC_LENGTH];
function PathPoint(s) {
    if (s <= LEG_LENGTH) return [0, -ARC_RADIUS, LEG_BOTTOM + s];
    if (s <= LEG_LENGTH + ARC_LENGTH) {
        const angle = Math.PI - (s - LEG_LENGTH) / ARC_RADIUS;
        return [0, ARC_RADIUS * Math.cos(angle), ARC_CENTER_Z + ARC_RADIUS * Math.sin(angle)];
    }
    return [0, ARC_RADIUS, ARC_CENTER_Z - (s - LEG_LENGTH - ARC_LENGTH)];
}

const SEAM = { radius: SEAM_RADIUS, rounding: SEAM_ROUNDING, rings: SEAM_RINGS };
const STRAP = { radius: STRAP_RADIUS, halfWidth: STRAP_HALF_WIDTH, part: "dark" };
const FOOT = { plateRadius: PLATE_RADIUS, plateHeight: PLATE_HEIGHT, platePart: "dark", radius: FOOT_RADIUS, height: FOOT_HEIGHT, rings: FOOT_RINGS, sides: TUBE_SIDES, part: "vinyl" };
const ROPE = { ropeRadius: ROPE_RADIUS, ropePart: "rope", stakeRadius: STAKE_RADIUS, stakeHeight: STAKE_HEIGHT, stakePart: "dark" };

function BuildArch(mesh, physics) {
    SegmentedTube(mesh, {
        At: PathPoint, length: PATH_LENGTH, bends: BENDS, segments: SEGMENT_COUNT,
        radius: TUBE_RADIUS, sides: TUBE_SIDES, step: TUBE_STEP, seam: SEAM, strap: STRAP, part: "vinyl",
    });
    for (const side of [-1, 1]) {
        const y = side * ARC_RADIUS;
        InflatableFoot(mesh, 0, y, FOOT);
        // Two guy ropes per leg, front and back, tied around it with one loop.
        for (const front of [-1, 1]) {
            GuyRope(mesh, [front * (TUBE_RADIUS - 1), y + side * 2, ROPE_HEIGHT], [front * ROPE_REACH, y + side * ROPE_SPREAD], ROPE);
        }
        RopeLoop(mesh, 0, y, ROPE_HEIGHT, TUBE_RADIUS, TUBE_SIDES, "rope");
    }
    // The blower behind the right foot, its duct into the ring.
    Blower(mesh, physics, {
        at: [BLOWER_X, ARC_RADIUS], into: [-FOOT_RADIUS + 3, ARC_RADIUS, PLATE_HEIGHT + FOOT_HEIGHT / 2],
        size: BLOWER_SIZE, ductRadius: DUCT_RADIUS, ductLow: DUCT_RADIUS + PLATE_HEIGHT,
        boxPart: "dark", ringPart: "rope", ductPart: "vinyl",
    });
}

/** Splits every edge longer than `step`, so a bend curves straight edges too. */
function Densify(contour, step) {
    const out = [];
    contour.forEach((p, i) => {
        const q = contour[(i + 1) % contour.length];
        const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
        for (let k = 0; k < n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
    });
    return out;
}

/** (angle from the top, radius) around the arc's center -> (u = Y, v = Z). */
const Polar = (angle, r) => [r * Math.sin(angle), ARC_CENTER_Z + r * Math.cos(angle)];

/** An annular sector of the arc, from radius r0 to r1, `half` radians either side of the top. */
function Sector(r0, r1, half) {
    const steps = Math.max(2, Math.ceil((2 * half * r1) / BEND_STEP));
    const outer = Array.from({ length: steps + 1 }, (_, i) => Polar(-half + (2 * half * i) / steps, r1));
    const inner = Array.from({ length: steps + 1 }, (_, i) => Polar(half - (2 * half * i) / steps, r0));
    return [...outer, ...inner];
}

/** `title` as 2D shapes (u = Y, v = Z) centered on the sign, bent around the arc's center, and its angle. */
function SignText(title) {
    const Shapes = height => TextShapes(font, title, height, {
        letterSpacing: (TEXT_LETTER_SPACING * height) / TEXT_HEIGHT, curveStep: TEXT_CURVE_STEP,
    });
    const Span = shapes => {
        const us = shapes.flatMap(s => s.outer.map(p => p[0]));
        return [Math.min(...us), Math.max(...us)];
    };
    const [min0, max0] = Span(Shapes(TEXT_HEIGHT));
    const height = Math.min(TEXT_HEIGHT, (TEXT_HEIGHT * TEXT_MAX_ANGLE * ARC_RADIUS) / (max0 - min0));
    const shapes = Shapes(height);
    const [min, max] = Span(shapes);
    // u (centered) becomes the angle from the top, along the centerline; v the height from a baseline
    // that centers the capitals on it.
    const Bend = c => Densify(c, TEXT_BEND_STEP).map(([u, v]) => Polar((u - (min + max) / 2) / ARC_RADIUS, ARC_RADIUS - height / 2 + v));
    return {
        shapes: shapes.map(s => ({ outer: Bend(s.outer), holes: s.holes.map(Bend) })),
        height,
        angle: (max - min) / ARC_RADIUS,
    };
}

/** Mirrored across u = 0 (outer still counter-clockwise), so it reads right from behind. */
const Mirror = shapes => shapes.map(s => ({
    outer: s.outer.map(([u, v]) => [-u, v]).reverse(),
    holes: s.holes.map(h => h.map(([u, v]) => [-u, v]).reverse()),
}));

/** The name sign for `title`: front (+X) and back, each a board on brackets, an edge and the letters. */
function BuildSign(mesh, title) {
    const text = SignText(title);
    const half = Math.max(SIGN_MIN_ANGLE, text.angle + (2 * SIGN_MARGIN) / ARC_RADIUS) / 2;
    const r0 = ARC_RADIUS - SIGN_HALF_HEIGHT, r1 = ARC_RADIUS + SIGN_HALF_HEIGHT;
    const board = Shape(Sector(r0, r1, half));
    const i0 = r0 + SIGN_EDGE_INSET, i1 = r1 - SIGN_EDGE_INSET;
    const edgeHalf = half - SIGN_EDGE_INSET / ARC_RADIUS, holeHalf = half - (SIGN_EDGE_INSET + SIGN_EDGE_WIDTH) / ARC_RADIUS;
    const edge = Shape(Sector(i0, i1, edgeHalf), [Sector(i0 + SIGN_EDGE_WIDTH, i1 - SIGN_EDGE_WIDTH, holeHalf)]);
    const back = SIGN_FRONT, face = SIGN_FRONT + SIGN_THICKNESS;
    // Each part on both sides: d0..d1 in front, mirrored behind (shapes are symmetric but the letters).
    const Both = (shapes, d0, d1, part, mirrored = shapes) => {
        mesh.Extrude(shapes, d0, d1, part, "x");
        mesh.Extrude(mirrored, -d1, -d0, part, "x");
    };
    Both(board, back, face, "dark");
    Both(edge, face - 0.2, face + SIGN_EDGE_RAISE, "white");
    Both(text.shapes, face - 0.2, face + TEXT_RAISE, "white", Mirror(text.shapes));
    // Brackets from inside the tube to the board: at the middle and near both ends.
    for (const angle of [-(half - 0.12), 0, half - 0.12]) {
        const [u, v] = Polar(angle, ARC_RADIUS);
        Both(Shape(ChamferedRect(u, v, BRACKET_SIZE, BRACKET_SIZE, 0.5)), TUBE_RADIUS - 3, back + 0.2, "dark");
    }
    return text;
}

const materials = {
    vinyl: VINYL_MATERIAL,
    ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])),
};
/** Only the parts a mesh uses. */
const Used = mesh => Object.fromEntries(Object.keys(mesh.tris).map(part => [part, materials[part]]));

// The gate.
const gate = new Mesh(64);
const physics = new Mesh();
BuildArch(gate, physics);
const physicsRings = Array.from({ length: 25 }, (_, i) => (PATH_LENGTH * i) / 24);
physics.Tube([...physicsRings, ...BENDS].sort((a, b) => a - b).map(PathPoint), TUBE_RADIUS, PHYSICS_SIDES, "vinyl");
for (const y of [-ARC_RADIUS, ARC_RADIUS]) physics.Tube([[0, y, 0], [0, y, PLATE_HEIGHT + FOOT_HEIGHT]], PLATE_RADIUS, PHYSICS_SIDES, "vinyl");
const gateObj = `${MODEL_DIR}/${NAME}.obj`;
const physicsObj = `${MODEL_DIR}/${NAME}_physics.obj`;
WriteAddonFile(gateObj, ObjText(gate, NAME, GENERATOR));
WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh: gateObj, physicsObj, materials: Used(gate) }));
const top = ARC_CENTER_Z + ARC_RADIUS + TUBE_RADIUS;
console.log(`  ${NAME}.vmdl: ${gate.triangleCount} triangles (collision ${physics.triangleCount}); opening ${2 * (ARC_RADIUS - TUBE_RADIUS)} wide, `
    + `${ARC_CENTER_Z + ARC_RADIUS - TUBE_RADIUS} high under the top; arch ${2 * (ARC_RADIUS + PLATE_RADIUS)} wide, ${top} high, `
    + `ropes and blower out to ${ROPE_REACH} / ${-BLOWER_X + BLOWER_SIZE[0] / 2 + 2} along X`);

// The name signs.
for (const { slug, title } of ROUTES) {
    const sign = new Mesh(64);
    const { height } = BuildSign(sign, title);
    const name = `${NAME}_name_${slug}`;
    const obj = `${MODEL_DIR}/${name}.obj`;
    WriteAddonFile(obj, ObjText(sign, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, materials: Used(sign) }));
    console.log(`  ${name}.vmdl: "${title}", letters ${height.toFixed(1)} high, ${sign.triangleCount} triangles`);
}

for (const [part, { rgb }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/<name>.vmdl"`);
