// Builds the hub's first-aid tent, a place for melons to heal up while they
// wait — `node tools/models/make-heal-tent-model.mjs`. An inflatable tunnel
// tent in the route gates', pavilion's and boutique's style
// (tools/lib/inflatable.mjs): two fat vinyl arches, white canvas between
// them down to the floor, a big glowing green pharmacy cross on both sides
// and on the roof, open at both ends — melons drive in at one end and out
// at the other. On the roof an inflatable green cross turns on a mast.
//
// Every piece at the same origin (the tent's middle, on the floor), the
// tunnel running along X:
//   heal_tent_frame   the two arches (x = +-LENGTH / 2) in segments with pinched
//                     seams and straps, their feet, guy ropes, a blower       solid
//   heal_tent_canvas  the canvas over the arches with its hem piping, the green
//                     crosses on it, a "HEAL" sign under each arch       solid side walls + roof
//   heal_tent_floor   a mat inside with a glowing cross: where the heal trigger
//                     goes (1 unit high, melons roll onto it)                 solid
//   heal_tent_cross   the cross on the roof, its mast and motor: a prop_dynamic
//                     with Idle Animation "spin", Loop Mode "Loop"
// The vinyl (arches, mast) is the shared white inflatable material and the
// canvas white too, both tinted per prop; the green (crosses), graphite and
// white letters aren't. Writes models/melon_racer/heal_tent/heal_tent_<piece>.vmdl
// (+ .obj, _physics.obj for the solid ones; the cross as a skinned .smd with its
// animations) and materials/melon_racer/heal_tent/heal_tent_<part>.vmat
// (+ _color.png). Compile the .vmdl files with resourcecompiler (see the output).
import { BUNGEE, LoadFont, TextShapes } from "../lib/font.mjs";
import { Blower, GuyRope, InflatableBlock, InflatableFoot, PolylinePath, RopeLoop, SegmentedTube, SquashedRing } from "../lib/inflatable.mjs";
import { BindFrame, ChamferedRect, Mesh, MeshSmdTriangles, ObjText, Shape, SmdAnimationText, SmdText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- The arches (units; a melon is ~14 across) ---
const LENGTH = 256; // along X, arch to arch
const HALF_WIDTH = 112; // along Y, the arches' legs' centerline
const SPRING = 88; // the legs rise straight up to here, then the half circle
const TUBE = { radius: 14, sides: 10, step: 44 };
const SEAM = { radius: 0.86, rounding: 5, rings: [0, 1.5, 5] };
const STRAP = { radius: 13, halfWidth: 1.3, part: "dark" };
const ARCH_SEGMENTS = 6;
const ARC_POINTS = 18; // the half circle, sampled
const FOOT = { plateRadius: 22, plateHeight: 3, platePart: "dark", radius: 20, height: 10, rings: 6, sides: TUBE.sides, part: "vinyl" };
const LEG_BOTTOM = FOOT.plateHeight + FOOT.height - 1; // the legs start inside the foot rings
const ROPE = { ropeRadius: 0.4, ropePart: "rope", stakeRadius: 0.8, stakeHeight: 3.5, stakePart: "dark" };
const ROPE_HEIGHT = 60; // where a guy rope is tied around its leg
const ROPE_OUT = 44; // the stake: this far out past the leg, diagonally (clear of the openings)
const BLOWER = { size: [10, 12, 9], ductRadius: 3.2 };
const PHYSICS_SIDES = 8;

// --- The canvas ---
const CANVAS_INSET = 0.4 * TUBE.radius; // inside the tubes' centerline
const CANVAS_SAG = 0.05; // pulled in by this share of its distance from the middle, halfway between the arches
const HEM_Z = 4; // the canvas' bottom edge
const CANVAS_COLUMNS = 8; // along X, arch to arch
const LEG_ROWS = 3; // up each straight wall
const PIPING_RADIUS = 1.1;
// The crosses on it, in canvas coordinates: along X and along the canvas (from the hem up and over).
const SIDE_CROSS = { size: 96, arm: 32, up: 62 }; // centered `up` from the hem, at x = 0
const ROOF_CROSS = { size: 96, arm: 32 };
const CROSS_RAISE = 0.5; // off the canvas
const PATCH_STEP = [16, 8]; // the crosses' grid: along X, along the canvas

// --- The sign under each arch ---
const SIGN = { width: 96, height: 32, thickness: 2, gap: 6, text: "HEAL", cap: 18, edge: [1.5, 1], raise: 0.15, curveStep: 3 };

// --- The floor mat ---
const MAT = { length: 208, width: 176, height: 1, chamfer: 16, border: [4, 2], badge: 128, cross: 96, crossArm: 32, raise: [0.12, 0.24, 0.36] };

// --- The cross on the roof ---
const ROOF_X = 0;
const MAST = { radius: 4.5, height: 24, sides: 10, pad: { radius: 14, height: 6 } }; // from the roof
const MOTOR = { radius: 7, height: 8 };
const CROSS = { half: 36, arm: 12, thickness: 7, round: 0.32, rows: 8, cols: 16, gap: 4 }; // arms' half length, half width; half thickness
const SPIN_SECONDS = 6; // one full turn
const FPS = 30;

// tint: whether the prop's render color tints it.
const COLORS = {
    canvas: { rgb: [0xf4, 0xf5, 0xf2], tint: 1 }, // the white canvas
    dark: { rgb: [0x2b, 0x30, 0x38], tint: 0 }, // the hub gates' graphite: straps, plates, piping, sign board
    rope: { rgb: [0x1a, 0x1c, 0x20], tint: 0 },
    white: { rgb: [0xf2, 0xf4, 0xf5], tint: 0 }, // letters, edges, the mat's badge
    deck: { rgb: [0xd8, 0xdc, 0xe0], tint: 1 }, // the stage's light grey: the mat
    green: { rgb: [0x28, 0xff, 0x6e], tint: 0, glow: 2 }, // the pharmacy cross: heal holo green (docs/GAME_CI.md)
};
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat"; // tools/materials/make-inflatable.mjs, tinted per prop

const NAME = "heal_tent";
const MODEL_DIR = "models/melon_racer/heal_tent";
const MATERIAL_DIR = "materials/melon_racer/heal_tent";
const GENERATOR = "tools/models/make-heal-tent-model.mjs";
const font = LoadFont(BUNGEE);

// --- The arch's profile, in (y, z) ---
/** The arch's centerline, `grown` out from the tubes' (negative: inside), from z0 up the -Y leg, over and down the +Y leg. */
function ArchProfile(grown, z0) {
    const r = HALF_WIDTH + grown;
    const leg = Array.from({ length: LEG_ROWS + 1 }, (_, i) => z0 + ((SPRING - z0) * i) / LEG_ROWS);
    const arc = Array.from({ length: ARC_POINTS - 1 }, (_, i) => {
        const a = Math.PI - (Math.PI * (i + 1)) / ARC_POINTS;
        return [r * Math.cos(a), SPRING + r * Math.sin(a)];
    });
    return [...leg.map(z => [-r, z]), ...arc, ...[...leg].reverse().map(z => [r, z])];
}
/** The middle a profile point bulges out from: the arch's center, or level with it on the legs. */
const ProfileCenter = ([, z]) => [0, Math.min(z, SPRING)];

/** Both arches' tubes, feet and guy ropes. */
function BuildFrame(mesh, physics) {
    const profile = ArchProfile(0, LEG_BOTTOM);
    for (const x of [-LENGTH / 2, LENGTH / 2]) {
        const points = profile.map(([y, z]) => [x, y, z]);
        const path = PolylinePath(points);
        const legLength = SPRING - LEG_BOTTOM;
        SegmentedTube(mesh, { ...path, bends: [legLength, path.length - legLength], segments: ARCH_SEGMENTS, radius: TUBE.radius, sides: TUBE.sides, step: TUBE.step, seam: SEAM, strap: STRAP, part: "vinyl" });
        physics.Tube(Array.from({ length: 15 }, (_, k) => path.At((path.length * k) / 14)), TUBE.radius, PHYSICS_SIDES, "vinyl");
        for (const side of [-1, 1]) {
            const y = side * HALF_WIDTH;
            InflatableFoot(mesh, x, y, FOOT);
            physics.Tube([[x, y, 0], [x, y, FOOT.plateHeight + FOOT.height]], FOOT.plateRadius, PHYSICS_SIDES, "vinyl");
            // A guy rope out diagonally, away from the tent and its opening.
            const out = V3.Unit([Math.sign(x), side, 0]);
            GuyRope(mesh, V3.Add([x, y, ROPE_HEIGHT], V3.Scale(out, TUBE.radius - 1)), [x + out[0] * ROPE_OUT, y + out[1] * ROPE_OUT], ROPE);
            RopeLoop(mesh, x, y, ROPE_HEIGHT, TUBE.radius, TUBE.sides, "rope");
        }
    }
    // The blower beside the -X, -Y foot, outside the side wall.
    const [x, y] = [-LENGTH / 2, -HALF_WIDTH];
    Blower(mesh, physics, {
        at: [x + 34, y - 26], into: [x + FOOT.radius - 3, y - 4, FOOT.plateHeight + FOOT.height / 2],
        ...BLOWER, ductLow: BLOWER.ductRadius + FOOT.plateHeight, boxPart: "dark", ringPart: "rope", ductPart: "vinyl",
    });
}

// --- The canvas: the inset profile swept from arch to arch, sagging in between ---
const canvasProfile = ArchProfile(-CANVAS_INSET, HEM_Z);
const canvasPath = PolylinePath(canvasProfile);
/** The canvas at x and `along` it (0 at the -Y hem), `lift` out from it. */
function CanvasPoint(x, along, lift = 0) {
    const [y, z] = canvasPath.At(along);
    const [cy, cz] = ProfileCenter([y, z]);
    const shrink = 1 - CANVAS_SAG * Math.sin((Math.PI * (x + LENGTH / 2)) / LENGTH);
    const dist = Math.hypot(y - cy, z - cz);
    const k = (dist * shrink + lift) / dist;
    return [x, cy + (y - cy) * k, cz + (z - cz) * k];
}
const profileAlong = canvasProfile.map((_, i) => canvasProfile.slice(1, i + 1).reduce((s, p, k) => s + Math.hypot(p[0] - canvasProfile[k][0], p[1] - canvasProfile[k][1]), 0));
const columnsX = Array.from({ length: CANVAS_COLUMNS + 1 }, (_, j) => -LENGTH / 2 + (LENGTH * j) / CANVAS_COLUMNS);

/** A rectangle [x0, x1] x [a0, a1] of the canvas (x, along), `lift` out, as a smooth patch. */
function CanvasPatch(mesh, x0, x1, a0, a1, lift, part) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / PATCH_STEP[0])), na = Math.max(1, Math.ceil((a1 - a0) / PATCH_STEP[1]));
    const grid = Array.from({ length: na + 1 }, (_, i) => Array.from({ length: nx + 1 }, (_, j) => CanvasPoint(x0 + ((x1 - x0) * j) / nx, a0 + ((a1 - a0) * i) / na, lift)));
    const mid = CanvasPoint((x0 + x1) / 2, (a0 + a1) / 2);
    mesh.Surface(grid, part, { away: [mid[0], ...ProfileCenter([mid[1], mid[2]])] });
}

/** A plus centered on (x, along) of the canvas: one bar along the canvas and the two arms either side, not overlapping. */
function CanvasCross(mesh, x, along, { size, arm }) {
    const h = size / 2, w = arm / 2;
    CanvasPatch(mesh, x - w, x + w, along - h, along + h, CROSS_RAISE, "green");
    CanvasPatch(mesh, x - h, x - w, along - w, along + w, CROSS_RAISE, "green");
    CanvasPatch(mesh, x + w, x + h, along - w, along + w, CROSS_RAISE, "green");
}

function BuildCanvas(mesh, physics) {
    const grid = profileAlong.map(a => columnsX.map(x => CanvasPoint(x, a)));
    const away = [0, 0, SPRING - 40]; // inside, below the arc's middle: every part of the canvas faces away from it
    mesh.Surface(grid, "canvas", { away });
    mesh.Surface(grid, "canvas", { away, flip: true });
    // The hems' piping along the bottom of both walls.
    for (const row of [grid[0], grid.at(-1)]) mesh.Tube(row, PIPING_RADIUS, 4, "dark", false);
    // The crosses: on both walls, and on the roof (the canvas' middle).
    for (const along of [SIDE_CROSS.up, canvasPath.length - SIDE_CROSS.up]) CanvasCross(mesh, 0, along, SIDE_CROSS);
    CanvasCross(mesh, 0, canvasPath.length / 2, ROOF_CROSS);
    for (const end of [-1, 1]) BuildSign(mesh, end);
    // Collision: the walls up to the arc, the roof as flat slabs under the arc's chords.
    const wallY = HALF_WIDTH - CANVAS_INSET;
    for (const side of [-1, 1]) physics.Extrude(Shape(ChamferedRect(0, side * wallY, LENGTH, 4, 0)), 0, SPRING, "canvas", "z");
    const roof = canvasProfile.slice(LEG_ROWS, canvasProfile.length - LEG_ROWS);
    for (let i = 0; i + 2 < roof.length; i += 2) {
        const [a, b] = [roof[i], roof[i + 2]];
        const n = V3.Unit([0, a[0] + b[0], a[1] + b[1] - 2 * SPRING]); // outward, from the arc's center
        const slab = [a, b, [b[0] - 4 * n[1], b[1] - 4 * n[2]], [a[0] - 4 * n[1], a[1] - 4 * n[2]]];
        physics.Extrude(Shape(slab), -LENGTH / 2, LENGTH / 2, "canvas", "x");
    }
}

// --- Signs and flat crosses ---
/** A plus outline (12 corners) around (u, v), `size` across, arms `arm` wide. */
function Plus(u, v, size, arm) {
    const h = size / 2, w = arm / 2;
    return [[w, -h], [w, -w], [h, -w], [h, w], [w, w], [w, h], [-w, h], [-w, w], [-h, w], [-h, -w], [-w, -w], [-w, -h]].map(([a, b]) => [u + a, v + b]);
}
/** Mirrored across u = 0, so it reads right from behind. */
const Mirror = shapes => shapes.map(s => ({ outer: s.outer.map(([u, v]) => [-u, v]).reverse(), holes: s.holes.map(h => h.map(([u, v]) => [-u, v]).reverse()) }));
const Move = (shapes, du, dv) => shapes.map(s => ({ outer: s.outer.map(([u, v]) => [u + du, v + dv]), holes: s.holes.map(h => h.map(([u, v]) => [u + du, v + dv])) }));

/** The "HEAL" sign hanging under the arch at x = end * LENGTH / 2, both faces. */
function BuildSign(mesh, end) {
    const x = (end * LENGTH) / 2;
    const top = SPRING + HALF_WIDTH - TUBE.radius - SIGN.gap, mid = top - SIGN.height / 2, face = SIGN.thickness / 2;
    mesh.Extrude(Shape(ChamferedRect(0, mid, SIGN.width, SIGN.height, 3)), x - face, x + face, "dark", "x");
    // The word, centered.
    const text = TextShapes(font, SIGN.text, SIGN.cap, { letterSpacing: 1, curveStep: SIGN.curveStep, minSegments: 1 });
    const us = text.flatMap(s => s.outer.map(p => p[0]));
    const words = Move(text, -(Math.min(...us) + Math.max(...us)) / 2, mid - SIGN.cap / 2);
    const [inset, edge] = SIGN.edge, ew = SIGN.width - 2 * inset, eh = SIGN.height - 2 * inset;
    const frame = Shape(ChamferedRect(0, mid, ew, eh, 2.2), [ChamferedRect(0, mid, ew - 2 * edge, eh - 2 * edge, 1.5)]);
    // Seen from +X, +Y is to the right: the face towards +X shows it as drawn, the one towards -X mirrored.
    for (const facing of [1, -1]) {
        const d = x + facing * (face + SIGN.raise);
        const Side = shapes => (facing > 0 ? shapes : Mirror(shapes));
        mesh.Cap(Side([...frame, ...words]), d, "white", "x", facing);
    }
    // Hung from the arch by two straps.
    for (const s of [-1, 1]) mesh.Tube([[x, s * (SIGN.width / 2 - 12), top - 1], [x, s * (SIGN.width / 2 - 12), top + SIGN.gap + 3]], 0.5, 4, "rope", false);
}

function BuildFloor(mesh, physics) {
    const outline = Shape(ChamferedRect(0, 0, MAT.length, MAT.width, MAT.chamfer));
    for (const m of [mesh, physics]) m.Extrude(outline, 0, MAT.height, "deck", "z");
    const [inset, edge] = MAT.border, l = MAT.length - 2 * inset, w = MAT.width - 2 * inset, c = MAT.chamfer * 0.8;
    const [r0, r1, r2] = MAT.raise;
    mesh.Cap(Shape(ChamferedRect(0, 0, l, w, c), [ChamferedRect(0, 0, l - 2 * edge, w - 2 * edge, c * 0.85)]), MAT.height + r0, "white", "z");
    mesh.Cap(Shape(ChamferedRect(0, 0, MAT.badge, MAT.badge, MAT.badge * 0.12)), MAT.height + r1, "white", "z");
    mesh.Cap(Shape(Plus(0, 0, MAT.cross, MAT.crossArm)), MAT.height + r2, "green", "z");
}

// --- The cross on the roof: a fixed mast and motor, the cross turning on its bone ---
const roofZ = CanvasPoint(ROOF_X, canvasPath.length / 2)[2];
const MOTOR_TOP = roofZ + MAST.pad.height / 2 + MAST.height + MOTOR.height;
const CROSS_Z = MOTOR_TOP + CROSS.gap + CROSS.half; // the cross' middle
const SPIN_BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    { name: "cross", parent: 0, bind: [ROOF_X, 0, MOTOR_TOP] },
];

function BuildMast(mesh) {
    const z0 = roofZ - MAST.pad.height / 2; // the pad sits half into the roof
    SquashedRing(mesh, ROOF_X, 0, z0, { radius: MAST.pad.radius, height: MAST.pad.height, rings: 4, sides: MAST.sides + 2, part: "vinyl" });
    mesh.Tube([[ROOF_X, 0, z0 + MAST.pad.height - 1], [ROOF_X, 0, MOTOR_TOP - MOTOR.height + 0.5]], MAST.radius, MAST.sides, "vinyl", false);
    mesh.Tube([[ROOF_X, 0, MOTOR_TOP - MOTOR.height], [ROOF_X, 0, MOTOR_TOP]], MOTOR.radius, MAST.sides, "dark");
}
/** The cross standing in the YZ plane (facing +-X), two puffy bars through each other, and the short shaft it turns on. */
function BuildCross(mesh) {
    const { half, arm, thickness, round, rows, cols } = CROSS;
    InflatableBlock(mesh, { center: [ROOF_X, 0, CROSS_Z], half: [thickness, arm, half], round, rows, cols, part: "green" });
    InflatableBlock(mesh, { center: [ROOF_X, 0, CROSS_Z], half: [thickness, half, arm], round, rows, cols, part: "green" });
    mesh.Tube([[ROOF_X, 0, MOTOR_TOP - 0.5], [ROOF_X, 0, CROSS_Z - half + 2]], 2, 8, "dark", false);
}
/** The skeleton t seconds into the spin: the cross turned around +Z. */
function SpinFrame(t) {
    const frame = BindFrame(SPIN_BONES);
    frame[1].rot = [0, 0, (2 * Math.PI * t) / SPIN_SECONDS];
    return frame;
}
/** ModelDoc turns an .smd 90 degrees around Z on import ((x, y, z) -> (-y, x, z)); turned the other way first, it lines up with the .obj pieces. */
const Unturn = ([x, y, z]) => [y, -x, z];

// --- Writing ---
const materials = {
    vinyl: VINYL_MATERIAL,
    ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])),
};
const Used = mesh => Object.fromEntries(Object.keys(mesh.tris).map(part => [part, materials[part]]));
let total = 0;

/** Builds one plain piece with `Build(mesh, physics)` and writes it; `solid` writes its collision. */
function Piece(piece, Build, { solid = false, note = "" } = {}) {
    const mesh = new Mesh(64), physics = new Mesh();
    Build(mesh, physics);
    const name = `${NAME}_${piece}`;
    const obj = `${MODEL_DIR}/${name}.obj`, physicsObj = solid ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    if (solid) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Used(mesh) }));
    total += mesh.triangleCount;
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles${solid ? ` (collision ${physics.triangleCount})` : ""}${note}`);
}

/** The spinning cross as a skinned model: mast and motor on the root, the cross on its bone; "spin" looping, "idle" still. */
function WriteCross() {
    const mast = new Mesh(64), cross = new Mesh(64);
    BuildMast(mast);
    BuildCross(cross);
    const name = `${NAME}_cross`;
    const triangles = [...MeshSmdTriangles(mast, NAME, 0), ...MeshSmdTriangles(cross, NAME, 1)]
        .map(tri => ({ ...tri, corners: tri.corners.map(c => ({ ...c, p: Unturn(c.p), n: Unturn(c.n) })) }));
    const bones = SPIN_BONES.map(b => ({ ...b, bind: Unturn(b.bind) }));
    // The last frame is a full turn, the same pose as the first: the loop closes seamlessly.
    const frames = Array.from({ length: SPIN_SECONDS * FPS + 1 }, (_, f) => SpinFrame(f / FPS).map(({ pos, rot }) => ({ pos: Unturn(pos), rot })));
    WriteAddonFile(`${MODEL_DIR}/${name}.smd`, SmdText(bones, triangles));
    WriteAddonFile(`${MODEL_DIR}/${name}_spin.smd`, SmdAnimationText(bones, frames));
    WriteAddonFile(`${MODEL_DIR}/${name}_idle.smd`, SmdAnimationText(bones, [BindFrame(bones)]));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({
        name: NAME, mesh: `${MODEL_DIR}/${name}.smd`,
        materials: { ...Used(mast), ...Used(cross) },
        animations: [
            { name: "spin", file: `${MODEL_DIR}/${name}_spin.smd`, looping: true },
            { name: "idle", file: `${MODEL_DIR}/${name}_idle.smd`, looping: true },
        ],
    }));
    total += triangles.length;
    console.log(`  ${name}.vmdl: ${triangles.length} triangles, "spin" ${frames.length} frames (one turn in ${SPIN_SECONDS} s) - a prop_dynamic, Idle Animation "spin", Loop Mode "Loop"`);
}

Piece("frame", BuildFrame, { solid: true });
Piece("canvas", BuildCanvas, { solid: true });
Piece("floor", BuildFloor, { solid: true, note: ` - the heal trigger over it: ${MAT.length} x ${MAT.width}` });
WriteCross();

for (const [part, { rgb, tint, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint, glow }));
}

const top = CROSS_Z + CROSS.half;
console.log(`all pieces: ${total} triangles; every piece at the same origin (the middle, on the floor), the tunnel along X`);
console.log(`${LENGTH + 2 * TUBE.radius} long, ${2 * (HALF_WIDTH + FOOT.plateRadius)} wide over the feet, openings ${2 * (HALF_WIDTH - TUBE.radius)} wide, `
    + `${(SPRING + HALF_WIDTH - TUBE.radius - SIGN.gap - SIGN.height).toFixed(0)} clear under the signs; roof ${roofZ.toFixed(0)}, ${top.toFixed(0)} high with the cross; `
    + `stakes ${ROPE_OUT} out on the diagonals`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<piece>.vmdl"`);
