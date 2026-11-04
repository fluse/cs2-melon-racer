// Builds a high-rise under construction (Rohbau) around the side-view track
// as a model — `node tools/models/make-highrise-model.mjs`.
// The track's volume (TRACK: its open face towards +X, where the side-view
// camera looks in from) is left free, CLEARANCE all round, so the building
// reads as a tower cut open on one side, the climb inside:
//   - CLOSED_FLOORS floors of raw formwork concrete round it: wings left and
//     right of the opening, a back part behind it, the floor above it with a
//     plain band across the front (room for the MELON RACER logo); dark
//     window openings on every outside face, some boarded with plywood, some
//     covered in foil or taped off; slab edges standing proud at every floor;
//   - OPEN_FLOORS floors of bare skeleton on top: slabs on perimeter columns,
//     a stair/lift core rising through them, red/white safety rails round
//     every open slab edge, rebar sticking out of the top slab's columns —
//     the next floor not built yet; the tower crane (make-tower-crane-model.mjs)
//     stands on the roof;
//   - a scaffold up one side (SCAFFOLD.side) over the lower floors.
// Place it as a prop_static. Faces another solid or the ground covers aren't
// in the render mesh at all; collision is a coarser mesh of its own: the
// closed floors (the track's volume left free), slabs, columns, core,
// scaffold decks — no rails, rebar or tubes. Writes
//   models/melon_racer/highrise/highrise.obj           render mesh
//   models/melon_racer/highrise/highrise_physics.obj   collision
//   models/melon_racer/highrise/highrise.vmdl
//   models/melon_racer/highrise.dmx  the same as mesh geometry for Hammer's File >
//                                    Import, to edit it there: every solid closed, its covered
//                                    faces toolsnodraw, collision from the mesh itself
//   materials/melon_racer/highrise/highrise_<part>.vmat (+ _color.png)
// Compile the .vmdl with resourcecompiler (see the end of the output).
// Origin: on the floor in the middle of the track's open face (its bottom
// edge), the track behind it along -X, its width along Y.
import { DmxText, Mesh, ObjText, SeededRandom, Shape, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

// --- The track's volume, kept free (measured in Hammer) ---
const TRACK = { width: 912, depth: 256, height: 944 };
const CLEARANCE = 2; // the building's inner faces stand this far off the track's bounds: no face on top of the track's own walls

// --- The building ---
const TRACK_FLOORS = 6; // floors beside the track: the floor height follows from the track's
const FLOOR = TRACK.height / TRACK_FLOORS;
const CLOSED_FLOORS = 7; // closed concrete floors, ground floor included (one more than the track: the floor over it)
const OPEN_FLOORS = 2; // bare skeleton floors on top
const WING = 160; // wall left and right of the opening
const DEPTH = 512; // the building, front (x = 0) to back
const SLAB = 14; // slab thickness, the bands on the facade too
const PROUD = 4; // how far slab edges stand out of the facade
const WINDOW = { width: 64, height: 84, sill: 30 }; // the openings; sill above the floor line
const BAY = 128; // aimed-for window spacing (each face's bays are spread evenly)
const COLUMN = 22; // skeleton columns, square
const COLUMN_SPANS = { x: 3, y: 8 }; // perimeter columns: spans along each side
const CORE = { back: 32, depth: 144, width: 176, head: 112 }; // stair/lift core: from the back facade, along X, across, how far above the roof
const DOOR = { width: 44, height: 80 }; // in the core's head, onto the roof
const REBAR = { length: 44, size: 2, spread: 6 }; // two bars out of every column on the roof
const RAIL = { size: 3, heights: [44, 88] }; // safety rails round the open slabs: two bars
const SCAFFOLD = { side: 1, floors: 5, bays: 4, inset: 24, gap: 16, depth: 44, tube: 2, plank: 3, toe: 8, rails: [48, 92] }; // side +-1 (Y); bays along it

const COLORS = {
    slab: [0xc6, 0xc4, 0xbe], // slab edges, slabs, columns: fresher concrete
    rebar: [0x7a, 0x4c, 0x32], // rust
    steel: [0x9a, 0xa0, 0xa6], // scaffold tubes, galvanized
    wood: [0xc8, 0x9c, 0x5c], // scaffold planks
};
const METAL = { steel: 0.6, rebar: 0.3 };

const NAME = "highrise";
const MATERIAL_DIR = "materials/melon_racer/highrise";
const GENERATOR = "tools/models/make-highrise-model.mjs";

const UV_TILE = 256; // one concrete texture repeat
const mesh = new Mesh(UV_TILE);
const random = SeededRandom(0x7a11);
/** A rectangle's outline [x0, y0]..[x1, y1], counter-clockwise. */
const RectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const physics = new Mesh(UV_TILE); // collision: closed solids, overlapping freely
const dmx = new Mesh(UV_TILE); // the .dmx: every solid a closed shell of its own (see Mesh.NewShell), covered faces NODRAW
const NODRAW = "nodraw";
/**
 * An upright prism over `outline` (counter-clockwise from above), z0..z1.
 * `top` the top face's part; `hidden` the faces another solid or the
 * ground covers — "top", "bottom" or a side's index (side i runs from point
 * i to i + 1) — left out; `solid` also puts it, closed, into the collision.
 * Sides are textured along their length, V up.
 */
function Prism(outline, z0, z1, part, { top = part, hidden = [], solid = false } = {}) {
    const shape = Shape(outline);
    if (solid) physics.Extrude(shape, z0, z1, "concrete", "z");
    dmx.NewShell();
    for (const target of [mesh, dmx]) {
        const Part = (face, p) => (!hidden.includes(face) ? p : target === dmx ? NODRAW : null);
        if (Part("top", top)) target.Cap(shape, z1, Part("top", top), "z", 1);
        if (Part("bottom", part)) target.Cap(shape, z0, Part("bottom", part), "z", -1);
    }
    outline.forEach((p, i) => {
        const q = outline[(i + 1) % outline.length];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]), e = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
        const U = ([x, y]) => (x * e[0] + y * e[1]) / UV_TILE, V = z => -z / UV_TILE; // texcoord v runs down the image
        const quad = [[...p, z0], [...q, z0], [...q, z1], [...p, z1]], uvs = [[U(p), V(z0)], [U(q), V(z0)], [U(q), V(z1)], [U(p), V(z1)]];
        if (!hidden.includes(i)) mesh.Face(quad, uvs, part);
        dmx.Face(quad, uvs, hidden.includes(i) ? NODRAW : part);
    });
}
const BOX_SIDES = ["-y", "+x", "+y", "-x"]; // RectPts' sides in order, by the way they face
/** An upright box: x0..x1, y0..y1, z0..z1 (the bounds in either order); `hidden` as Prism's, its sides by name ("-y", "+x", ...). */
const Box = (x0, y0, x1, y1, z0, z1, part, { top = part, hidden = [], solid = false } = {}) =>
    Prism(RectPts(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)), Math.min(z0, z1), Math.max(z0, z1), part,
        { top, solid, hidden: hidden.map(h => (BOX_SIDES.includes(h) ? BOX_SIDES.indexOf(h) : h)) });
/** A tube from a to b (3D); open ends in the model (they butt into something or are too thin to see), closed in the .dmx. */
function Tube(a, b, radius, part, sides = 6) {
    mesh.Tube([a, b], radius, sides, part, false);
    dmx.NewShell();
    dmx.Tube([a, b], radius, sides, part, true);
}
const Linspace = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

const W = TRACK.width + 2 * WING;
const halfW = W / 2, P = PROUD;
const openY = TRACK.width / 2 + CLEARANCE, openX = -(TRACK.depth + CLEARANCE), openTop = TRACK.height + CLEARANCE; // the free volume
const closedTop = CLOSED_FLOORS * FLOOR, roofZ = (CLOSED_FLOORS + OPEN_FLOORS) * FLOOR;
if (closedTop - SLAB < openTop + SLAB) throw new Error("the floor over the track is too thin: raise CLOSED_FLOORS");

// --- The closed floors: a U round the track up to its top, the same U above it, the floor over the track filling the U's notch ---
const plan = [[-DEPTH, -halfW], [0, -halfW], [0, -openY], [openX, -openY], [openX, openY], [0, openY], [0, halfW], [-DEPTH, halfW]]; // sides 2..4 line the notch
Prism(plan, 0, openTop, "concrete", { hidden: ["bottom", "top"], solid: true }); // on the ground; the upper U on top of it
Prism(plan, openTop, closedTop, "concrete", { top: "slab", hidden: ["bottom", 2, 3, 4], solid: true }); // the notch filled by the floor over the track
Box(openX, -openY, 0, openY, openTop, closedTop, "concrete", { top: "slab", hidden: ["-x", "-y", "+y"], solid: true });

// The outside faces of the closed floors: the plane `axis` = `at`, its outside
// towards `out`, running from..to along the other horizontal axis; `ext` how
// far its slab bands reach past each end (round an outer corner), `bands` the
// floor lines k (z = k * FLOOR) that get one, `windows` the floors that do.
const faces = [
    { axis: "x", at: -DEPTH, out: -1, from: -halfW, to: halfW, ext: [P, P], bands: [1, CLOSED_FLOORS], windows: [0, CLOSED_FLOORS - 1] }, // back
    ...[-1, 1].map(out => ({ axis: "y", at: out * halfW, out, from: -DEPTH, to: 0, ext: [P, P], bands: [1, CLOSED_FLOORS], windows: [0, CLOSED_FLOORS - 1] })), // sides
    { axis: "x", at: 0, out: 1, from: openY, to: halfW, ext: [0, P], bands: [1, CLOSED_FLOORS - 1], windows: [0, CLOSED_FLOORS - 1] }, // front wings
    { axis: "x", at: 0, out: 1, from: -halfW, to: -openY, ext: [P, 0], bands: [1, CLOSED_FLOORS - 1], windows: [0, CLOSED_FLOORS - 1] },
    { axis: "x", at: 0, out: 1, from: -halfW, to: halfW, ext: [P, P], bands: [CLOSED_FLOORS, CLOSED_FLOORS], windows: [1, 0] }, // the front's top band, full width
];
/** A point `s` along the face, `o` out from it, as [x, y]. */
const At = (face, s, o) => (face.axis === "y" ? [s, face.at + face.out * o] : [face.at + face.out * o, s]);

/** A band's faces nobody sees: its back on the wall, and an end reaching round a corner (the other face's band covers it). */
function bandHidden(face) {
    const other = face.axis === "x" ? "y" : "x";
    return [`${face.out > 0 ? "-" : "+"}${face.axis}`, ...(face.ext[0] ? [`-${other}`] : []), ...(face.ext[1] ? [`+${other}`] : [])];
}
// Slab edges: a proud band at every floor line.
for (const face of faces) {
    for (let k = face.bands[0]; k <= face.bands[1]; k++) {
        const [x0, y0] = At(face, face.from - face.ext[0], 0), [x1, y1] = At(face, face.to + face.ext[1], P);
        Box(x0, y0, x1, y1, k * FLOOR - SLAB, k * FLOOR, "slab", { hidden: bandHidden(face) });
    }
}
// The lintel over the opening.
Box(0, -openY - P, P, openY + P, openTop, openTop + SLAB, "slab", { hidden: ["-x"] });

// --- Window openings: flat dark faces just off the wall, a texture atlas of 2 x 2 kinds ---
const OPENING_KINDS = [0.55, 0.72, 0.88, 1]; // cumulative share: dark, plywood, foil, taped off
/** One opening on `face`, centered at s, from z0 to z1, w wide; `kind` picks the atlas cell. */
function Opening(face, s, z0, z1, w, kind) {
    const n = face.axis === "x" ? [face.out, 0, 0] : [0, face.out, 0];
    const right = V3.Cross(V3.Scale(n, -1), [0, 0, 1]); // seen from outside
    const along = face.axis === "x" ? [0, 1, 0] : [1, 0, 0];
    const [sl, sr] = V3.Dot(along, right) > 0 ? [s - w / 2, s + w / 2] : [s + w / 2, s - w / 2];
    const Pt = (ss, z) => [...At(face, ss, 0.5), z];
    const e = 2 / 512; // keep off the cell's edge
    const u0 = (kind % 2) / 2 + e, u1 = (kind % 2) / 2 + 0.5 - e;
    const vTop = Math.floor(kind / 2) / 2 + e, vBottom = Math.floor(kind / 2) / 2 + 0.5 - e; // texcoord v runs down the image
    const quad = [Pt(sl, z0), Pt(sr, z0), Pt(sr, z1), Pt(sl, z1)], uvs = [[u0, vBottom], [u1, vBottom], [u1, vTop], [u0, vTop]];
    mesh.Face(quad, uvs, "opening");
    dmx.NewShell();
    dmx.Face(quad, uvs, "opening");
}
let openings = 0;
for (const face of faces) {
    const len = face.to - face.from, bays = Math.max(1, Math.round(len / BAY)), bayL = len / bays;
    for (let k = face.windows[0]; k <= face.windows[1]; k++) {
        for (let b = 0; b < bays; b++) {
            const r = random(), kind = OPENING_KINDS.findIndex(share => r < share);
            const z0 = k * FLOOR + WINDOW.sill;
            Opening(face, face.from + (b + 0.5) * bayL, z0, z0 + WINDOW.height, WINDOW.width, kind);
            openings++;
        }
    }
}

// --- The skeleton floors: perimeter columns, slabs, the core ---
const columnXs = Linspace(-DEPTH + COLUMN / 2, -COLUMN / 2, COLUMN_SPANS.x);
const columnYs = Linspace(-halfW + COLUMN / 2, halfW - COLUMN / 2, COLUMN_SPANS.y);
const columns = columnXs.flatMap((x, i) => columnYs.map((y, j) => [x, y, i === 0 || i === COLUMN_SPANS.x || j === 0 || j === COLUMN_SPANS.y]))
    .filter(([, , outer]) => outer).map(([x, y]) => [x, y]);
for (let k = CLOSED_FLOORS; k < CLOSED_FLOORS + OPEN_FLOORS; k++) {
    for (const [x, y] of columns) Box(x - COLUMN / 2, y - COLUMN / 2, x + COLUMN / 2, y + COLUMN / 2, k * FLOOR, (k + 1) * FLOOR - SLAB, "slab", { hidden: ["bottom", "top"], solid: true });
    Box(-DEPTH - P, -halfW - P, P, halfW + P, (k + 1) * FLOOR - SLAB, (k + 1) * FLOOR, "slab", { solid: true });
}
// The core, one piece per storey between the slabs (no faces buried in them), its head above the roof.
const coreX0 = -DEPTH + CORE.back, coreX1 = coreX0 + CORE.depth;
for (let k = CLOSED_FLOORS; k < CLOSED_FLOORS + OPEN_FLOORS; k++) {
    Box(coreX0, -CORE.width / 2, coreX1, CORE.width / 2, k * FLOOR, (k + 1) * FLOOR - SLAB, "concrete", { hidden: ["bottom", "top"], solid: true });
}
Box(coreX0, -CORE.width / 2, coreX1, CORE.width / 2, roofZ, roofZ + CORE.head, "concrete", { top: "slab", hidden: ["bottom"], solid: true });
Opening({ axis: "x", at: coreX1, out: 1 }, 0, roofZ, roofZ + DOOR.height, DOOR.width, 0);

// Rebar out of every column on the roof: the next floor not built yet.
for (const [x, y] of columns) {
    for (const dx of [-REBAR.spread, REBAR.spread]) {
        const r = REBAR.size / 2;
        Box(x + dx - r, y - r, x + dx + r, y + r, roofZ, roofZ + REBAR.length, "rebar", { hidden: ["bottom"] });
    }
}

// Safety rails round every open slab edge (the closed floors' top, each skeleton slab), just outside the columns.
const railLevels = Array.from({ length: OPEN_FLOORS + 1 }, (_, i) => (CLOSED_FLOORS + i) * FLOOR);
const r0 = RAIL.size;
for (const z of railLevels) {
    for (const h of RAIL.heights) {
        const z0 = z + h - r0 / 2, z1 = z + h + r0 / 2;
        Box(-DEPTH - r0, -halfW - r0, r0, -halfW, z0, z1, "rail");
        Box(-DEPTH - r0, halfW, r0, halfW + r0, z0, z1, "rail");
        Box(-DEPTH - r0, -halfW, -DEPTH, halfW, z0, z1, "rail", { hidden: ["-y", "+y"] }); // between the side rails, its ends against them
        Box(0, -halfW, r0, halfW, z0, z1, "rail", { hidden: ["-y", "+y"] });
    }
}
// Posts for the roof's rails, halfway between the columns (below it the columns carry them).
const Mid = list => list.slice(1).map((v, i) => (v + list[i]) / 2);
const postTop = roofZ + Math.max(...RAIL.heights) + r0 / 2;
const posts = [
    ...Mid(columnYs).flatMap(y => [[-DEPTH - r0 / 2, y], [r0 / 2, y]]),
    ...Mid(columnXs).flatMap(x => [[x, -halfW - r0 / 2], [x, halfW + r0 / 2]]),
];
for (const [x, y] of posts) Box(x - r0 / 2, y - r0 / 2, x + r0 / 2, y + r0 / 2, roofZ, postTop, "rail", { hidden: ["bottom"] });

// --- The scaffold up one side ---
{
    const S = SCAFFOLD, side = S.side;
    const yIn = side * (halfW + P + S.gap), yOut = side * (halfW + P + S.gap + S.depth);
    const xs = Linspace(-DEPTH + S.inset, -S.inset, S.bays);
    const top = S.floors * FLOOR + Math.max(...S.rails) + 4;
    for (const x of xs) for (const y of [yIn, yOut]) Tube([x, y, 0], [x, y, top], S.tube, "steel");
    const x0 = xs[0], x1 = xs[S.bays];
    for (let k = 1; k <= S.floors; k++) {
        const z = k * FLOOR;
        Box(x0 - 8, yIn - side * 4, x1 + 8, yOut + side * 4, z - S.plank, z, "wood", { solid: true }); // the deck
        Box(x0 - 8, yOut + side * 2, x1 + 8, yOut + side * 3.5, z, z + S.toe, "wood", { hidden: ["bottom"] }); // toe board, on the deck
        for (const y of [yIn, yOut]) Tube([x0, y, z - S.plank - S.tube], [x1, y, z - S.plank - S.tube], S.tube, "steel"); // ledgers
        for (const h of S.rails) Tube([x0, yOut, z + h], [x1, yOut, z + h], S.tube, "steel"); // guard rails
    }
    for (let k = 0; k < S.floors; k++) { // bracing: a diagonal in every bay of the outer row, zigzagging floor by floor
        for (let b = 0; b < S.bays; b++) {
            const up = (b + k) % 2 === 0;
            Tube([xs[b], yOut, (up ? k : k + 1) * FLOOR], [xs[b + 1], yOut, (up ? k + 1 : k) * FLOOR], S.tube, "steel");
        }
    }
}

// --- Textures ---
const noise = Array.from({ length: 512 * 512 }, () => random() - 0.5);
const Clamp = c => Math.max(0, Math.min(255, Math.round(c)));
const Mix = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
// Formwork concrete, one 256-unit repeat: panels 128 x 64 with seams, tie holes, each panel its own tone.
const panelTones = Array.from({ length: 8 }, () => random() - 0.5);
const TIE_HOLES = [16, 64, 112].flatMap(x => [16, 48].map(y => [x, y]));
const concreteColor = EncodePng(256, 256, (px, py) => {
    const lx = px % 128, ly = py % 64;
    let c = 176 + panelTones[Math.floor(py / 64) * 2 + Math.floor(px / 128)] * 14 + noise[py * 256 + px] * 10;
    if (lx === 0 || ly === 0) c -= 28;
    else if (lx === 1 || ly === 1) c -= 10;
    if (TIE_HOLES.some(([hx, hy]) => (lx - hx) ** 2 + (ly - hy) ** 2 < 7)) c -= 46;
    return [Clamp(c), Clamp(c - 2), Clamp(c - 6), 255];
});
// The openings, 2 x 2 cells of 256 px; u, v 0..1 across a cell, v down from the top.
const REVEAL = [0x78, 0x76, 0x72];
function Interior(u, v) {
    if (v < 0.16) return [0x5c, 0x5a, 0x58]; // the ceiling slab's underside
    if (v > 0.88) return [0x46, 0x44, 0x40]; // the floor
    return Mix([0x2e, 0x30, 0x34], [0x1e, 0x1f, 0x22], (v - 0.16) / 0.72);
}
const OPENING_PAINT = [
    Interior,
    (u, v) => { // plywood boarding over the lower part
        if (v < 0.42) return Interior(u, v);
        if (Math.abs(v - 0.42) < 0.012 || Math.abs(u - 0.5) < 0.008) return [0x7c, 0x5e, 0x3a];
        const grain = Math.sin(v * 140 + Math.sin(u * 9) * 3) * 10;
        const screw = [0.12, 0.88].some(x => [0.5, 0.92].some(y => (u - x) ** 2 + ((v - y) * 0.76) ** 2 < 0.0004));
        return screw ? [0x50, 0x4c, 0x48] : [0xc4 + grain, 0x98 + grain, 0x60 + grain * 0.6];
    },
    (u, v) => { // construction foil, creased
        const crease = Math.sin(u * 37 + Math.sin(v * 6) * 2) * 14 + Math.sin(u * 91) * 5;
        return Mix([0x8c, 0xa8, 0xb8], [0x6c, 0x86, 0x96], v).map(c => c + crease);
    },
    (u, v) => { // taped off: red/white barrier tape across a dark opening
        const t = v - 0.48 + (u - 0.5) * 0.18;
        if (Math.abs(t) < 0.055) return Math.floor((u * 9 + t * 4) * 2) % 2 ? [0xe8, 0xe6, 0xe0] : [0xd8, 0x34, 0x2a];
        return Interior(u, v);
    },
];
const openingColor = EncodePng(512, 512, (px, py) => {
    const kind = Math.floor(py / 256) * 2 + Math.floor(px / 256);
    const u = (px % 256) / 255, v = (py % 256) / 255;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const rgb = edge < 0.05 ? REVEAL.map(c => c - (0.05 - edge) * 300) : OPENING_PAINT[kind](u, v);
    return [...rgb.map(c => Clamp(c + noise[py * 512 + px] * 8)), 255];
});
// Safety rails: red and white, 32 units each, along the rail.
const railColor = EncodePng(256, 4, px => (Math.floor(px / 32) % 2 ? [0xee, 0xec, 0xe6, 255] : [0xd8, 0x34, 0x2a, 255]));

const textures = { concrete: concreteColor, opening: openingColor, rail: railColor, ...Object.fromEntries(Object.entries(COLORS).map(([part, rgb]) => [part, SolidPng(rgb)])) };
const MODEL_DIR = `models/melon_racer/${NAME}`;
const materials = Object.fromEntries(Object.keys(textures).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`${MODEL_DIR}/${NAME}.obj`, ObjText(mesh, NAME, GENERATOR));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(dmx, NAME, { ...materials, [NODRAW]: "materials/tools/toolsnodraw.vmat" }));
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics.obj`, ObjText(physics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh: `${MODEL_DIR}/${NAME}.obj`, physicsObj: `${MODEL_DIR}/${NAME}_physics.obj`, materials, surfaceProp: "concrete" }));
for (const [part, png] of Object.entries(textures)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, png);
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, metalness: METAL[part] ?? 0 }));
}
const f = n => n.toFixed(0);
console.log(`${NAME}.vmdl: ${mesh.triangleCount} triangles (collision ${physics.triangleCount}); .dmx ${dmx.triangleCount - dmx.tris[NODRAW].length} drawn + ${dmx.tris[NODRAW].length} nodraw; ${f(W)} wide x ${DEPTH} deep, roof at ${f(roofZ)} (core to ${f(roofZ + CORE.head)}), `
    + `${CLOSED_FLOORS} closed + ${OPEN_FLOORS} open floors of ${FLOOR.toFixed(1)}; free volume x ${openX}..0, y +-${openY}, z 0..${openTop}; ${openings} openings`);
console.log(`tower crane: its origin on the core's head at (${f((coreX0 + coreX1) / 2)}, 0, ${f(roofZ + CORE.head)})`);
console.log(`a prop_static, origin on the floor in the middle of the track's open face, the track along -X; compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
