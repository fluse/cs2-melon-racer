// Generates a tower crane for the high-rise's roof (make-highrise-model.mjs)
// — `node tools/models/make-tower-crane-model.mjs`: a square lattice mast on
// a cross base with ballast blocks, on top the slewing part — a turntable,
// the operator's cab, a pyramid tower head, the triangular lattice jib along
// +X with a trolley and a hook on two cables, the counter-jib along -X with
// its counterweights, tie bars from the head to both. Scenery, far out of
// the melons' reach: no collision.
//   slew    the jib swings SLEW_ANGLE either way and back over SLEW_SECONDS,
//           the trolley running in and out along it twice meanwhile; looping
//   idle    standing still (one frame)
// Place it as a prop_dynamic with Idle Animation "slew", Idle Animation Loop
// Mode "Loop". The steel parts and the cab are white and tinted by the prop's
// render color (a crane yellow, red, ...); ballast, counterweights,
// turntable, trolley and cables are not. Writes
//   models/melon_racer/tower_crane/tower_crane.smd                render mesh + skeleton (bind pose)
//   models/melon_racer/tower_crane/tower_crane_{slew,idle}.smd    the animations
//   models/melon_racer/tower_crane/tower_crane.vmdl
//   materials/melon_racer/tower_crane/tower_crane_<part>.vmat (+ _color.png)
// Compile the .vmdl with resourcecompiler (see the end of the output).
// Origin on the floor in the middle of the base (the mast's axis).
import { BindFrame, Mesh, MeshSmdTriangles, Shape, SmdAnimationText, SmdText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the high-rise's floors are 157 high) ---
const BASE = { length: 144, width: 16, height: 10 }; // the cross under the mast
const BALLAST = { size: 40, height: 24 }; // a concrete block on each arm of the cross
const MAST = { width: 36, segments: 16, segment: 36 }; // square lattice, between the chords' centers
const CHORD = 2.5; // main chords' radius
const BRACE = 1.2; // diagonals, cross members, tie bars, cables
const TURNTABLE = { radius: 26, height: 12 };
const CAB = { length: 28, width: 24, height: 30, side: 22 }; // beside the turntable, its front (+X) glazed; `side`: its inner edge off the axis
const HEAD = 150; // the tower head's tip above the jib's bottom chords
const JIB = { length: 720, half: 18, height: 40, segment: 36 }; // bottom chords +-half apart, the top chord `height` above
const COUNTER_JIB = { length: 240, half: 20, segment: 40 };
const COUNTERWEIGHT = { count: 3, thickness: 14, gap: 2, depth: 54 }; // concrete slabs hung at the counter-jib's end
const WINCH = { length: 40, width: 28, height: 22 };
const TROLLEY = { at: 420, length: 26, height: 8 }; // along the jib, its middle position
const HOOK = { drop: 300, block: [14, 16, 22] }; // cable length below the trolley, the hook block's size

// --- animation ---
const SLEW_ANGLE = 70; // degrees either way
const SLEW_SECONDS = 60; // one full swing there and back
const TROLLEY_TRAVEL = 160; // either way of TROLLEY.at
const FPS = 10; // slow motion: 10 frames a second is plenty

// --- tessellation ---
const MEMBER_SIDES = 4; // lattice members: square tubes
const CABLE_SIDES = 4;

// --- look ---
const STEEL_COLOR = [0xf4, 0xf4, 0xf2]; // tinted by the prop's render color
const CAB_COLOR = [0xf4, 0xf4, 0xf2]; // tinted too
const GRAPHITE = [0x3a, 0x3e, 0x46]; // turntable, trolley, winch, cables
const CONCRETE = [0xa8, 0xa6, 0xa0]; // ballast, counterweights
const GLASS = [0x3c, 0x52, 0x60];
const HOOK_COLOR = [0xe8, 0xa0, 0x20]; // the hook block: amber, a load warning

const NAME = "tower_crane";
const MODEL_DIR = "models/melon_racer/tower_crane";
const MATERIAL_DIR = "materials/melon_racer/tower_crane";
const GENERATOR = "tools/models/make-tower-crane-model.mjs";

const mastTop = MAST.segments * MAST.segment + BASE.height;
const jibZ = mastTop + TURNTABLE.height; // the jib's bottom chords

// --- skeleton: the fixed mast, the slewing part on top, the trolley on that ---
const BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    { name: "slew", parent: 0, bind: [0, 0, mastTop] },
    { name: "trolley", parent: 1, bind: [TROLLEY.at, 0, 0] },
];
const ROOT_BONE = 0, SLEW_BONE = 1, TROLLEY_BONE = 2;

/** The skeleton t seconds into the slew: swinging around +Z, the trolley running along the jib at twice the pace. */
function SlewFrame(t) {
    const frame = BindFrame(BONES);
    const phase = (2 * Math.PI * t) / SLEW_SECONDS;
    frame[SLEW_BONE].rot = [0, 0, (SLEW_ANGLE * Math.PI / 180) * Math.sin(phase)];
    frame[TROLLEY_BONE].pos = [TROLLEY.at + TROLLEY_TRAVEL * Math.sin(2 * phase), 0, 0];
    return frame;
}

/** An upright box into `mesh`: x0..x1, y0..y1, z0..z1. */
function Box(mesh, [x0, y0, z0], [x1, y1, z1], part) {
    mesh.Extrude(Shape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), z0, z1, part, "z");
}
/** A straight lattice member from a to b. */
const Member = (mesh, a, b, radius, part = "steel") => mesh.Tube([a, b], radius, MEMBER_SIDES, part, false);

// --- The mast and its base: the root bone ---
const mast = new Mesh(64);
for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const l = BASE.length / 2, w = BASE.width / 2;
    Box(mast, [-(dx ? l : w), -(dy ? l : w), 0], [dx ? l : w, dy ? l : w, BASE.height], "graphite");
    for (const s of [-1, 1]) {
        const c = [dx * s * (l - BALLAST.size / 2), dy * s * (l - BALLAST.size / 2)];
        Box(mast, [c[0] - BALLAST.size / 2, c[1] - BALLAST.size / 2, BASE.height], [c[0] + BALLAST.size / 2, c[1] + BALLAST.size / 2, BASE.height + BALLAST.height], "concrete");
    }
}
const h = MAST.width / 2;
const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
for (const [x, y] of corners) Member(mast, [x, y, BASE.height], [x, y, mastTop], CHORD);
for (let s = 0; s < MAST.segments; s++) {
    const z0 = BASE.height + s * MAST.segment, z1 = z0 + MAST.segment;
    corners.forEach(([x0, y0], i) => {
        const [x1, y1] = corners[(i + 1) % 4];
        const [a, b] = s % 2 ? [[x0, y0], [x1, y1]] : [[x1, y1], [x0, y0]]; // zigzag up each face
        Member(mast, [...a, z0], [...b, z1], BRACE);
        if (s % 2 === 0) Member(mast, [x0, y0, z0], [x1, y1, z0], BRACE);
    });
}
corners.forEach(([x0, y0], i) => Member(mast, [x0, y0, mastTop], [...corners[(i + 1) % 4], mastTop], BRACE));

// --- The slewing part: the slew bone ---
const top = new Mesh(64);
top.Extrude(Shape(Array.from({ length: 12 }, (_, i) => [TURNTABLE.radius * Math.cos(i * Math.PI / 6), TURNTABLE.radius * Math.sin(i * Math.PI / 6)])), mastTop, jibZ, "graphite", "z");
// The cab, beside the turntable, glazed at its front.
const cabX0 = MAST.width / 2 - CAB.length / 2, cabY0 = CAB.side, cabZ0 = jibZ - CAB.height + 6;
Box(top, [cabX0, cabY0, cabZ0], [cabX0 + CAB.length, cabY0 + CAB.width, cabZ0 + CAB.height], "cab");
Box(top, [cabX0 + CAB.length - 0.5, cabY0 + 3, cabZ0 + 8], [cabX0 + CAB.length + 0.8, cabY0 + CAB.width - 3, cabZ0 + CAB.height - 4], "glass");
// The tower head: a pyramid from the turntable's corners to its tip.
const tip = [0, 0, jibZ + HEAD];
for (const [x, y] of corners) Member(top, [x, y, jibZ], tip, CHORD);
for (const f of [0.35, 0.7]) {
    const ring = corners.map(([x, y]) => [x * (1 - f), y * (1 - f), jibZ + HEAD * f]);
    ring.forEach((p, i) => Member(top, p, ring[(i + 1) % 4], BRACE));
}
// The jib: two bottom chords, a top chord, zigzag diagonals on both slanted faces, cross members underneath.
const jibX0 = h, jibSegments = Math.round((JIB.length - jibX0) / JIB.segment), jibSeg = (JIB.length - jibX0) / jibSegments;
const L = [0, -JIB.half, jibZ], R = [0, JIB.half, jibZ], T = [0, 0, jibZ + JIB.height];
const AtX = (p, x) => [x, p[1], p[2]];
for (const p of [L, R, T]) Member(top, AtX(p, jibX0), AtX(p, JIB.length), CHORD);
for (let s = 0; s < jibSegments; s++) {
    const x0 = jibX0 + s * jibSeg, x1 = x0 + jibSeg;
    for (const side of [L, R]) {
        const [a, b] = s % 2 ? [AtX(side, x0), AtX(T, x1)] : [AtX(T, x0), AtX(side, x1)];
        Member(top, a, b, BRACE);
    }
    Member(top, AtX(L, x0), AtX(R, x0), BRACE);
}
for (const p of [L, R]) Member(top, AtX(p, JIB.length), AtX(T, JIB.length), BRACE); // the tip's end frame
Member(top, AtX(L, JIB.length), AtX(R, JIB.length), BRACE);
// The counter-jib: two chords, cross members, a walkway, the winch, counterweights at its end.
const cjX1 = -COUNTER_JIB.length, cjSegments = Math.round((COUNTER_JIB.length - h) / COUNTER_JIB.segment);
for (const y of [-COUNTER_JIB.half, COUNTER_JIB.half]) Member(top, [-h, y, jibZ], [cjX1, y, jibZ], CHORD);
for (let s = 0; s <= cjSegments; s++) {
    const x = -h + ((cjX1 + h) * s) / cjSegments;
    Member(top, [x, -COUNTER_JIB.half, jibZ], [x, COUNTER_JIB.half, jibZ], BRACE);
}
Box(top, [cjX1, -COUNTER_JIB.half + 4, jibZ + CHORD], [-h, COUNTER_JIB.half - 4, jibZ + CHORD + 1], "graphite"); // walkway grating
const winchX = -h - 40;
Box(top, [winchX - WINCH.length, -WINCH.width / 2, jibZ + CHORD], [winchX, WINCH.width / 2, jibZ + CHORD + WINCH.height], "graphite");
let cwX = cjX1 + 2;
for (let i = 0; i < COUNTERWEIGHT.count; i++, cwX += COUNTERWEIGHT.thickness + COUNTERWEIGHT.gap) {
    Box(top, [cwX, -COUNTER_JIB.half - 2, jibZ + 12 - COUNTERWEIGHT.depth], [cwX + COUNTERWEIGHT.thickness, COUNTER_JIB.half + 2, jibZ + 12], "concrete");
}
// Tie bars from the head's tip to the jib's top chord and the counter-jib's end.
for (const x of [0.4, 0.8]) Member(top, tip, AtX(T, JIB.length * x), BRACE, "graphite");
for (const y of [-COUNTER_JIB.half, COUNTER_JIB.half]) Member(top, tip, [cjX1 + 4, y, jibZ], BRACE, "graphite");

// --- The trolley, its cables and the hook: the trolley bone ---
const trolley = new Mesh(64);
const tx = TROLLEY.at, ht = TROLLEY.length / 2;
Box(trolley, [tx - ht, -JIB.half - 2, jibZ - CHORD - TROLLEY.height], [tx + ht, JIB.half + 2, jibZ - CHORD], "graphite");
const blockTop = jibZ - CHORD - TROLLEY.height - HOOK.drop;
for (const dx of [-5, 5]) trolley.Tube([[tx + dx, 0, jibZ - CHORD - TROLLEY.height], [tx + dx, 0, blockTop]], 0.6, CABLE_SIDES, "graphite", false);
const [bx, by, bz] = HOOK.block;
Box(trolley, [tx - bx / 2, -by / 2, blockTop - bz], [tx + bx / 2, by / 2, blockTop], "hook");
trolley.Tube([[tx, 0, blockTop - bz], [tx, 0, blockTop - bz - 6]], 1.5, 6, "graphite", false);
trolley.Tube([[tx, 0, blockTop - bz - 6], [tx + 3, 0, blockTop - bz - 13], [tx + 7, 0, blockTop - bz - 11], [tx + 7, 0, blockTop - bz - 7]], 1.5, 6, "graphite", true); // the hook

const parts = { steel: STEEL_COLOR, cab: CAB_COLOR, graphite: GRAPHITE, concrete: CONCRETE, glass: GLASS, hook: HOOK_COLOR };
const TINTED = ["steel", "cab"];
const materials = Object.fromEntries(Object.keys(parts).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const loopFrames = Math.round(SLEW_SECONDS * FPS);
const slewFrames = Array.from({ length: loopFrames + 1 }, (_, f) => SlewFrame(f / FPS)); // the last frame is the first again: a seamless loop
const animations = [
    { name: "slew", file: `${MODEL_DIR}/${NAME}_slew.smd`, looping: true },
    { name: "idle", file: `${MODEL_DIR}/${NAME}_idle.smd`, looping: true },
];
const meshFile = `${MODEL_DIR}/${NAME}.smd`;
const triangles = [
    ...MeshSmdTriangles(mast, NAME, ROOT_BONE),
    ...MeshSmdTriangles(top, NAME, SLEW_BONE),
    ...MeshSmdTriangles(trolley, NAME, TROLLEY_BONE),
];
WriteAddonFile(meshFile, SmdText(BONES, triangles));
WriteAddonFile(animations[0].file, SmdAnimationText(BONES, slewFrames));
WriteAddonFile(animations[1].file, SmdAnimationText(BONES, [BindFrame(BONES)]));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh: meshFile, materials, animations, surfaceProp: "metal" }));
for (const [part, rgb] of Object.entries(parts)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: TINTED.includes(part) ? 1 : 0, metalness: part === "glass" ? 0.4 : part === "steel" ? 0.3 : 0 }));
}
console.log(`${triangles.length} triangles (mast ${mast.triangleCount}, slewing ${top.triangleCount}, trolley ${trolley.triangleCount}); `
    + `${(jibZ + HEAD).toFixed(0)} high to the head's tip, jib ${JIB.length} out, counter-jib ${COUNTER_JIB.length}; slew +-${SLEW_ANGLE} deg over ${SLEW_SECONDS} s (${slewFrames.length} frames), hook ${blockTop.toFixed(0)} above the base`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
