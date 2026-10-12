// Builds a cable-stayed bridge after Cologne's Severinsbruecke as a race
// track for Hammer — `node tools/models/make-bridge-model.mjs`: a straight
// steel deck LENGTH long along +X, its road DECK_HEIGHT above the floor, held
// by one A-shaped pylon whose legs stand on a pier in the river, apart on
// both sides of the deck and meeting high above it; stay cables fan out from
// its head in two inclined planes to both edges of the deck, a long main span
// one way, a short back span the other. A second river pier carries the main
// span's far end; plain twin columns on land carry the approaches. The river
// runs along Y, under the main span (the water itself is a Hammer func_water).
// Writes
//   models/melon_racer/bridge.dmx  for Hammer's File > Import: edit it like any
//                                  mesh, collision from the mesh itself
//   materials/melon_racer/bridge/bridge_<part>.vmat (+ _color.png)
// Origin: on the floor (the river bed), under the start of the road, in the
// middle of it; the road runs along +X. The parapets' inner faces and the
// railing posts are walls (melons bounce off them); the cables are anchored on
// brackets outside the parapets and run over the road high enough that a
// ground jump doesn't reach them. A melon falling off
// lands DECK_HEIGHT down: put a melon_respawn (or melon_break) trigger below.
import { DmxText, Mesh, SolidPng, V3, VmatText, WriteAddonFile } from "../lib/model.mjs";

// --- The deck ---
const LENGTH = 6000; // along X
const DECK_HEIGHT = 800; // the road's top above the floor
const ROAD_WIDTH = 512; // between the parapets' inner faces: room for a Grand Prix field side by side
const SLAB_THICKNESS = 24;
const GIRDER = { width: 384, depth: 96 }; // the steel box girder under the slab, its depth below the slab

// --- The edges ---
const PARAPET = { width: 24, height: 40 }; // a solid wall: the wall melons bounce off
const RAILING = { height: 96, postEvery: 192, post: 6, rail: 6 }; // top of the rail above the road (a ground jump reaches ~86)
const RAILS = [68, RAILING.height - 3]; // the rails' centers above the road

// --- The markings, a hair above the road ---
const MARK = { width: 8, edgeInset: 24, dash: 160, gap: 160, lift: 0.5 };

// --- The pylon and its cables ---
const PYLON_X = 3700; // along the deck: main span towards 0, back span towards LENGTH
const PYLON_TOP = 2000; // the head's top above the floor (Severinsbruecke: ~4x the deck's height over the water)
const PYLON_BASE_Y = 700; // each leg's foot this far out to the side: the deck and its railing pass between the legs
const LEG = { bottom: [72, 56], top: [44, 36] }; // half sizes [along X, across the leg], at its foot and at the head
const HEAD = { x: 120, y: 120, height: 260 }; // the block the legs meet in and the cables leave from
const PYLON_BEAM_HEIGHT = 80; // the cross beam between the legs that carries the deck
const MAIN_CABLES = [2200, 1500, 850]; // anchors on the deck, distance from the pylon towards the main span (a fan, 3 per plane like the original)
const BACK_CABLES = [400, 800, 1150]; // towards the back span; the last one over the anchor pier
const CABLE_RADIUS = 5; // half the square cable's width
const CABLE_HEAD_STEP = 50; // the cables leave the head this far apart in height, the longest highest
const ANCHOR = { out: 24, x: 24, height: 24 }; // the cables' brackets outside the parapets: center this far out, half size along X, top above the road

// --- The piers ---
const FOUNDATION_TOP = 96; // the river piers' footings: keep the water surface below this
const RIVER_PIER_X = 1300; // the main span's far end
const RIVER_PIER = { x: 200, y: 520, point: 140, cap: 64 }; // half sizes, the cutwaters' length up- and downstream, the cap that holds the girder
const PYLON_PIER = { x: 260, point: 180 }; // the pylon's footing: half size along X, cutwaters; across it reaches past both legs
const LAND_SUPPORTS = [600, 4850, 5450]; // twin columns on land; one at each end too
const COLUMN = { spacing: 288, top: [48, 48], bottom: [80, 72] }; // land columns: centers apart along Y, half sizes at the top and the floor
const CROSS_BEAM = { depthX: 96, height: 56, width: 480 }; // under the girder, across both columns
const FOOTING = { x: 240, y: 480, height: 24 };

const COLORS = {
    road: [0x3b, 0x3e, 0x44], // asphalt
    marking: [0xf2, 0xf4, 0xf5],
    concrete: [0xb9, 0xb6, 0xae], // piers and footings
    paint: [0xc9, 0xd2, 0xcc], // the steel girder and pylon: a pale grey-green steel paint, like the original
    steel: [0x2b, 0x30, 0x38], // railing, cables: graphite
};

const NAME = "bridge";
const MATERIAL_DIR = "materials/melon_racer/bridge";
const GENERATOR = "tools/models/make-bridge-model.mjs";

const mesh = new Mesh(128);
/** A rectangle [x0, y0]..[x1, y1] as a counter-clockwise shape. */
const Rect = (x0, y0, x1, y1) => ({ outer: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], holes: [] });
/** An upright box: x0..x1, y0..y1, z0..z1. */
const Box = (x0, y0, x1, y1, z0, z1, part, topPart = part) => mesh.Extrude([Rect(x0, y0, x1, y1)], z0, z1, part, "z", topPart);
/** A box lying along X (a rail): its cross-section y0..y1, z0..z1. Extrude along x maps (u, v) to (y, z). */
const BarX = (x0, x1, y0, y1, z0, z1, part) => mesh.Extrude([Rect(y0, z0, y1, z1)], x0, x1, part, "x");
/** A river pier's outline around (x, 0): half sizes hx, hy, pointed cutwaters `point` long at both ends along Y (the river's flow). */
const CutwaterShape = (x, hx, hy, point) => ({
    outer: [[x - hx, -hy], [x, -hy - point], [x + hx, -hy], [x + hx, hy], [x, hy + point], [x - hx, hy]],
    holes: [],
});

/** A convex quad, two triangles facing away from `center`. */
function Quad(a, b, c, d, center, part) {
    const n = V3.Cross(V3.Sub(b, a), V3.Sub(c, a));
    const mid = V3.Scale(V3.Add(V3.Add(a, b), V3.Add(c, d)), 0.25);
    if (V3.Dot(n, V3.Sub(mid, center)) < 0) [b, d] = [d, b];
    mesh.Tri(a, b, c, part);
    mesh.Tri(a, c, d, part);
}

/**
 * A square-ish beam from point a to point b, closed at both ends: half sizes
 * [along its side axis, along its other axis] at a and at b (tapering). The
 * side axis is horizontal, across the beam; the other one at right angles.
 */
function Strut(a, b, halfA, halfB, part) {
    const t = V3.Unit(V3.Sub(b, a));
    const side = V3.Unit(V3.Cross(t, Math.abs(t[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0]));
    const other = V3.Cross(side, t);
    const Ring = (p, [hs, ho]) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, o]) => V3.Add(V3.Add(p, V3.Scale(side, s * hs)), V3.Scale(other, o * ho)));
    const ra = Ring(a, halfA), rb = Ring(b, halfB), center = V3.Scale(V3.Add(a, b), 0.5);
    for (let i = 0; i < 4; i++) Quad(ra[i], ra[(i + 1) % 4], rb[(i + 1) % 4], rb[i], center, part);
    Quad(...ra, center, part);
    Quad(...rb, center, part);
}

// --- Deck: slab (its top the road), girder, parapets, railing ---
const halfRoad = ROAD_WIDTH / 2, halfDeck = halfRoad + PARAPET.width;
const slabBottom = DECK_HEIGHT - SLAB_THICKNESS, girderBottom = slabBottom - GIRDER.depth;
Box(0, -halfDeck, LENGTH, halfDeck, slabBottom, DECK_HEIGHT, "paint", "road");
Box(0, -GIRDER.width / 2, LENGTH, GIRDER.width / 2, girderBottom, slabBottom, "paint");
const parapetMiddle = halfRoad + PARAPET.width / 2;
for (const side of [-1, 1]) {
    const [y0, y1] = side > 0 ? [halfRoad, halfDeck] : [-halfDeck, -halfRoad];
    Box(0, y0, LENGTH, y1, DECK_HEIGHT, DECK_HEIGHT + PARAPET.height, "paint");
    const yc = side * parapetMiddle, p = RAILING.post / 2, r = RAILING.rail / 2;
    const posts = Math.round(LENGTH / RAILING.postEvery);
    for (let i = 0; i <= posts; i++) {
        const x = Math.min(LENGTH - p, Math.max(p, (LENGTH * i) / posts));
        Box(x - p, yc - p, x + p, yc + p, DECK_HEIGHT + PARAPET.height, DECK_HEIGHT + RAILING.height - RAILING.rail, "steel");
    }
    for (const h of RAILS) BarX(0, LENGTH, yc - r, yc + r, DECK_HEIGHT + h - r, DECK_HEIGHT + h + r, "steel");
}

// --- Markings: edge lines and a dashed center line, single faces a hair above the road ---
const w = MARK.width / 2;
const marks = [-1, 1].map(side => {
    const y = side * (halfRoad - MARK.edgeInset);
    return Rect(0, y - w, LENGTH, y + w);
});
const dashes = Math.floor((LENGTH + MARK.gap) / (MARK.dash + MARK.gap));
const dashStart = (LENGTH - (dashes * (MARK.dash + MARK.gap) - MARK.gap)) / 2;
for (let i = 0; i < dashes; i++) {
    const x = dashStart + i * (MARK.dash + MARK.gap);
    marks.push(Rect(x, -w, x + MARK.dash, w));
}
mesh.Cap(marks, DECK_HEIGHT + MARK.lift, "marking", "z");

// --- The pylon: footing in the river, two legs leaning in to the head, a cross beam under the deck ---
const headTop = PYLON_TOP, headBottom = PYLON_TOP - HEAD.height;
const legTopZ = headBottom + HEAD.height / 3; // the legs end inside the head
/** How far out to the side a leg's center is at height z. */
const LegY = z => PYLON_BASE_Y * (1 - (z - FOUNDATION_TOP) / (legTopZ - FOUNDATION_TOP));
const clearance = LegY(DECK_HEIGHT + RAILING.height) - LEG.bottom[1] - halfDeck;
if (clearance < 16) throw new Error(`the pylon's legs pass the railing only ${clearance.toFixed(0)} units off: raise PYLON_BASE_Y or PYLON_TOP`);
mesh.Extrude([CutwaterShape(PYLON_X, PYLON_PIER.x, PYLON_BASE_Y + 120, PYLON_PIER.point)], 0, FOUNDATION_TOP, "concrete", "z");
for (const side of [-1, 1]) {
    Strut([PYLON_X, side * PYLON_BASE_Y, FOUNDATION_TOP], [PYLON_X, side * LegY(legTopZ), legTopZ], LEG.bottom, LEG.top, "paint");
}
Box(PYLON_X - HEAD.x / 2, -HEAD.y / 2, PYLON_X + HEAD.x / 2, HEAD.y / 2, headBottom, headTop, "paint");
const pylonBeamTop = girderBottom, pylonBeamBottom = girderBottom - PYLON_BEAM_HEIGHT;
const beamY = LegY(pylonBeamBottom);
Box(PYLON_X - LEG.bottom[0], -beamY, PYLON_X + LEG.bottom[0], beamY, pylonBeamBottom, pylonBeamTop, "paint");

// --- The cables: from the head down to brackets outside both deck edges ---
const cableAnchors = [...MAIN_CABLES.map(d => PYLON_X - d), ...BACK_CABLES.map(d => PYLON_X + d)];
const anchorY = halfDeck + ANCHOR.out, anchorZ = DECK_HEIGHT + ANCHOR.height;
let lowestOverRoad = Infinity;
for (const x of cableAnchors) {
    const reach = Math.abs(x - PYLON_X);
    const rank = [...MAIN_CABLES, ...BACK_CABLES].filter(d => d > reach).length; // longer cables leave higher
    const headZ = headTop - 40 - CABLE_HEAD_STEP * Math.min(rank, 2);
    for (const side of [-1, 1]) {
        const top = [PYLON_X + Math.sign(x - PYLON_X) * HEAD.x / 2, side * HEAD.y / 4, headZ];
        const bottom = [x, side * anchorY, anchorZ];
        Strut(top, bottom, [CABLE_RADIUS, CABLE_RADIUS], [CABLE_RADIUS, CABLE_RADIUS], "steel");
        // The bracket: from under the slab out to the anchor.
        const [y0, y1] = side > 0 ? [halfDeck, anchorY + 2 * CABLE_RADIUS] : [-anchorY - 2 * CABLE_RADIUS, -halfDeck];
        Box(x - ANCHOR.x, y0, x + ANCHOR.x, y1, slabBottom, anchorZ, "paint");
        // Its height over the railing and over the road's edge: what a jumping melon could hit.
        const Over = y => anchorZ + ((anchorY - y) / (anchorY - Math.abs(top[1]))) * (headZ - anchorZ) - DECK_HEIGHT;
        if (Over(halfRoad + PARAPET.width) < RAILING.height + CABLE_RADIUS) throw new Error(`a cable cuts the railing at x ${x}: raise ANCHOR.height or ANCHOR.out`);
        lowestOverRoad = Math.min(lowestOverRoad, Over(halfRoad));
    }
}

// --- The river pier: a solid wall with cutwaters, a cap under the girder ---
const capBottom = girderBottom - RIVER_PIER.cap;
mesh.Extrude([CutwaterShape(RIVER_PIER_X, RIVER_PIER.x + 40, RIVER_PIER.y + 40, RIVER_PIER.point + 40)], 0, FOUNDATION_TOP, "concrete", "z");
mesh.Extrude([CutwaterShape(RIVER_PIER_X, RIVER_PIER.x / 2, RIVER_PIER.y / 2, RIVER_PIER.point / 2)], FOUNDATION_TOP, capBottom, "concrete", "z");
Box(RIVER_PIER_X - RIVER_PIER.x / 2, -halfDeck, RIVER_PIER_X + RIVER_PIER.x / 2, halfDeck, capBottom, girderBottom, "concrete");

// --- Land supports: footing, twin tapered columns, cross beam under the girder ---
const landXs = [FOOTING.x / 2, ...LAND_SUPPORTS, LENGTH - FOOTING.x / 2];
const beamBottom = girderBottom - CROSS_BEAM.height;
for (const x of landXs) {
    Box(x - FOOTING.x / 2, -FOOTING.y / 2, x + FOOTING.x / 2, FOOTING.y / 2, 0, FOOTING.height, "concrete");
    for (const side of [-1, 1]) {
        const y = side * COLUMN.spacing / 2;
        Strut([x, y, FOOTING.height], [x, y, beamBottom], COLUMN.bottom, COLUMN.top, "concrete");
    }
    Box(x - CROSS_BEAM.depthX / 2, -CROSS_BEAM.width / 2, x + CROSS_BEAM.depthX / 2, CROSS_BEAM.width / 2, beamBottom, girderBottom, "concrete");
}

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(mesh, NAME, materials));
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles; ${LENGTH} long, road ${DECK_HEIGHT} up and ${ROAD_WIDTH} wide; `
    + `pylon at x ${PYLON_X}, ${PYLON_TOP} high, legs ${clearance.toFixed(0)} clear of the railing; ${cableAnchors.length * 2} cables, `
    + `the lowest ${lowestOverRoad.toFixed(0)} over the road's edge; river piers at x ${RIVER_PIER_X} and ${PYLON_X} (footings up to ${FOUNDATION_TOP}), `
    + `land supports at x ${landXs.map(x => x.toFixed(0)).join(", ")}`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the floor under the start of the road, road along +X, the river along Y)`);
