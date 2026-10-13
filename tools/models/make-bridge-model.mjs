// Builds a cable-stayed bridge after Cologne's Severinsbruecke as a race
// track for Hammer — `node tools/models/make-bridge-model.mjs`: a straight
// steel deck LENGTH long along +X, its road DECK_HEIGHT above the floor, held
// by one A-shaped pylon whose legs stand on a long low stone pier (the
// Sockel) in the river, apart on both sides of the deck and meeting high
// above it, tied together by cross ties; stay cables (bundles of ROPES
// parallel ropes) fan out from its head in two inclined planes to both edges
// of the deck, a long main span one way, a short back span the other. Under
// the slab, like the original: two trapezoid box girders with inclined outer
// webs, cross girders and a center stringer between them, and on the outside
// a stiffener and a cantilever bracket every BAY under the overhang. A
// second, lower stone pier in the river and concrete plinths on land carry
// the deck on pairs of steel struts leaning out to the girders. Street lamps
// on the parapets. The river runs along Y, under the main span (the water
// itself is a Hammer func_water). Steel paint, cables included: #87CC96.
// Writes
//   models/melon_racer/bridge.dmx  for Hammer's File > Import: edit it like any
//                                  mesh, collision from the mesh itself
//   materials/melon_racer/bridge/bridge_<part>.vmat (+ _color.png; the stone a
//                                  masonry texture, one repeat per 128 units)
// Origin: on the floor (the river bed), under the start of the road, in the
// middle of it; the road runs along +X. The parapets' inner faces and the
// railing posts are walls (melons bounce off them); the cables are anchored on
// brackets outside the parapets and run over the road high enough that a
// ground jump doesn't reach them, the lamps' arms higher still. A melon
// falling off lands DECK_HEIGHT down: put a melon_respawn (or melon_break)
// trigger below.
import { Area, DmxText, Mesh, SeededRandom, SolidPng, V3, VmatText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

// --- The deck ---
const LENGTH = 6000; // along X
const DECK_HEIGHT = 800; // the road's top above the floor
const ROAD_WIDTH = 512; // between the parapets' inner faces: room for a Grand Prix field side by side
const SLAB_THICKNESS = 24;
const GIRDER = { inner: 112, outerTop: 236, outerBottom: 196, depth: 128 }; // the two box girders: inner web, outer web (inclined) at the slab and at the bottom, depth below the slab
const BAY = 240; // along X: a cross girder, and on each side a stiffener and a bracket
const CROSS_GIRDER = { half: 6, depth: 80 };
const STRINGER = { half: 12, depth: 48 }; // the center stringer under the slab
const FASCIA = { width: 6, depth: 20 }; // the edge beam along the slab's outer edge
const BRACKET = { half: 4, depth: 72 }; // the cantilever brackets under the overhang: half thickness along X, how far down the web they reach
const STIFFENER = [4, 3]; // half sizes [along X, off the web]

// --- The edges ---
const PARAPET = { width: 24, height: 40 }; // a solid wall: the wall melons bounce off
const RAILING = { height: 96, postEvery: 192, post: 6, rail: 6 }; // top of the rail above the road (a ground jump reaches ~86)
const RAILS = [68, RAILING.height - 3]; // the rails' centers above the road
const LAMP = { every: 720, height: 340, reach: 64, radius: 3, sides: 6, clearance: 24 }; // street lamps on both parapets: pole top above the road, how far the arm reaches over the road; none where a cable passes closer than `clearance`

// --- The markings, a hair above the road ---
const MARK = { width: 8, edgeInset: 24, dash: 160, gap: 160, lift: 0.5 };

// --- The pylon and its cables ---
const PYLON_X = 3700; // along the deck: main span towards 0, back span towards LENGTH
const PYLON_TOP = 2000; // the head's top above the floor (Severinsbruecke: ~4x the deck's height over the water)
const PYLON_BASE_Y = 700; // each leg's foot this far out to the side: the deck and its railing pass between the legs
const LEG = { bottom: [72, 56], top: [44, 36] }; // half sizes [along X, across the leg], at its foot and at the head
const LEG_FOOT = { margin: 16, height: 16 }; // the steel base plate each leg stands on
const HEAD = { x: 120, y: 120, height: 260, cap: 16, capHeight: 20 }; // the block the legs meet in and the cables leave from; a cap plate on top, `cap` wider all round
const PYLON_TIES = [1340, 1600]; // cross ties between the legs, their centers above the floor
const TIE = [36, 28]; // half sizes [along X, up]
const PYLON_BEAM_HEIGHT = 80; // the cross beam between the legs that carries the deck
const MAIN_CABLES = [2200, 1500, 850]; // anchors on the deck, distance from the pylon towards the main span (a fan, 3 per plane like the original)
const BACK_CABLES = [400, 800, 1150]; // towards the back span; the last one over the anchor pier
const ROPES = { count: 3, radius: 3, spacing: 8, sides: 6 }; // each stay a bundle of parallel ropes, side by side in the cable plane
const CABLE_HEAD_STEP = 50; // the cables leave the head this far apart in height, the longest highest
const ANCHOR = { out: 24, x: 24, height: 24 }; // the cables' brackets outside the parapets: center this far out, half size along X, top above the road

// --- The piers ---
const FOUNDATION_TOP = 96; // the land plinths' and river piers' bottom courses: keep the water surface below this
const SOCKEL = { x: 240, point: 220, outY: 160, top: 220, coping: 12, copingHeight: 20 }; // the pylon's stone pier: half size along X, cutwaters up- and downstream, how far past the legs it reaches, its top; a coping slab on top, `coping` wider
const RIVER_PIER_X = 1300; // the main span's far end
const RIVER_PIER = { x: 120, y: 300, point: 140, top: 180 }; // a lower stone pier like the Sockel, half sizes and cutwaters
const LAND_SUPPORTS = [600, 4850, 5450]; // plinths with struts on land; one at each end too
const FOOTING = { x: 240, y: 360, height: 48 }; // the land plinths
const STRUT = { footY: 110, bottom: [24, 20], top: [48, 28] }; // the steel struts on every pier: their feet this far out, leaning out to the girders; half sizes [along X, across] at foot and top
const BEARING = { x: 40, y: 36, height: 16 }; // the block under the girder each strut ends in

const COLORS = {
    road: [0x3b, 0x3e, 0x44], // asphalt
    marking: [0xf2, 0xf4, 0xf5],
    concrete: [0xb9, 0xb6, 0xae], // land plinths, the piers' coping
    paint: [0x87, 0xcc, 0x96], // the Severinsbruecke's green steel paint: deck, pylon, struts, railing, cables
    steel: [0x2b, 0x30, 0x38], // lamp poles and heads: graphite
    lamp: [0xff, 0xf1, 0xd6], // the lamps' glass, glowing warm white
};
const STONE = { base: [0x8e, 0x84, 0x76], mortar: [0x5e, 0x58, 0x50], vary: 18, course: 32, block: 64, joint: 2 }; // the piers' masonry: a texture 128 px = 128 units, courses `course` high, blocks `block` long in a running bond
const GLOW = { lamp: 3 };

const NAME = "bridge";
const MATERIAL_DIR = "materials/melon_racer/bridge";
const GENERATOR = "tools/models/make-bridge-model.mjs";

const mesh = new Mesh(128);
/** A rectangle [x0, y0]..[x1, y1] as a counter-clockwise shape. */
const Rect = (x0, y0, x1, y1) => ({ outer: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], holes: [] });
/** A polygon as a shape, turned counter-clockwise whichever way it was given (mirrored outlines flip). */
const Polygon = pts => ({ outer: Area(pts) < 0 ? [...pts].reverse() : pts, holes: [] });
/** An upright box: x0..x1, y0..y1, z0..z1. */
const Box = (x0, y0, x1, y1, z0, z1, part, topPart = part) => mesh.Extrude([Rect(x0, y0, x1, y1)], z0, z1, part, "z", topPart);
/** A box lying along X (a rail): its cross-section y0..y1, z0..z1. Extrude along x maps (u, v) to (y, z). */
const BarX = (x0, x1, y0, y1, z0, z1, part) => mesh.Extrude([Rect(y0, z0, y1, z1)], x0, x1, part, "x");
/** A cross-section (points [y, z]) extruded along X from x0 to x1. */
const ProfileX = (pts, x0, x1, part) => mesh.Extrude([Polygon(pts)], x0, x1, part, "x");
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

/** The two axes across a line along `t`: `side` horizontal, `other` at right angles to both. */
function Across(t) {
    const side = V3.Unit(V3.Cross(t, Math.abs(t[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0]));
    return { side, other: V3.Cross(side, t) };
}

/**
 * A square-ish beam from point a to point b, closed at both ends: half sizes
 * [along its side axis, along its other axis] at a and at b (tapering). The
 * side axis is horizontal, across the beam; the other one at right angles.
 */
function Strut(a, b, halfA, halfB, part) {
    const { side, other } = Across(V3.Unit(V3.Sub(b, a)));
    const Ring = (p, [hs, ho]) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, o]) => V3.Add(V3.Add(p, V3.Scale(side, s * hs)), V3.Scale(other, o * ho)));
    const ra = Ring(a, halfA), rb = Ring(b, halfB), center = V3.Scale(V3.Add(a, b), 0.5);
    for (let i = 0; i < 4; i++) Quad(ra[i], ra[(i + 1) % 4], rb[(i + 1) % 4], rb[i], center, part);
    Quad(...ra, center, part);
    Quad(...rb, center, part);
}

/** The shortest distance between the segments p0..p1 and q0..q1 (sampled: good to a unit at these lengths). */
function SegmentDistance(p0, p1, q0, q1) {
    const d = V3.Sub(q1, q0), dd = V3.Dot(d, d);
    let best = Infinity;
    for (let i = 0; i <= 64; i++) {
        const p = V3.Add(p0, V3.Scale(V3.Sub(p1, p0), i / 64));
        const s = Math.min(1, Math.max(0, V3.Dot(V3.Sub(p, q0), d) / dd));
        best = Math.min(best, Math.hypot(...V3.Sub(p, V3.Add(q0, V3.Scale(d, s)))));
    }
    return best;
}

// --- Deck: slab (its top the road), parapets, railing ---
const halfRoad = ROAD_WIDTH / 2, halfDeck = halfRoad + PARAPET.width;
const slabBottom = DECK_HEIGHT - SLAB_THICKNESS, girderBottom = slabBottom - GIRDER.depth;
Box(0, -halfDeck, LENGTH, halfDeck, slabBottom, DECK_HEIGHT, "paint", "road");
const parapetMiddle = halfRoad + PARAPET.width / 2;
for (const side of [-1, 1]) {
    const [y0, y1] = side > 0 ? [halfRoad, halfDeck] : [-halfDeck, -halfRoad];
    Box(0, y0, LENGTH, y1, DECK_HEIGHT, DECK_HEIGHT + PARAPET.height, "paint");
    const yc = side * parapetMiddle, p = RAILING.post / 2, r = RAILING.rail / 2;
    const posts = Math.round(LENGTH / RAILING.postEvery);
    for (let i = 0; i <= posts; i++) {
        const x = Math.min(LENGTH - p, Math.max(p, (LENGTH * i) / posts));
        Box(x - p, yc - p, x + p, yc + p, DECK_HEIGHT + PARAPET.height, DECK_HEIGHT + RAILING.height - RAILING.rail, "paint");
    }
    for (const h of RAILS) BarX(0, LENGTH, yc - r, yc + r, DECK_HEIGHT + h - r, DECK_HEIGHT + h + r, "paint");
}

// --- Under the slab: box girders, fascia, center stringer; per bay cross girders, stiffeners, brackets ---
/** The outer web's distance from the middle at height z: inclined, narrower at the bottom. */
const WebY = z => GIRDER.outerBottom + ((GIRDER.outerTop - GIRDER.outerBottom) * (z - girderBottom)) / GIRDER.depth;
const bracketBottom = slabBottom - BRACKET.depth;
for (const side of [-1, 1]) {
    ProfileX([[side * GIRDER.inner, slabBottom], [side * GIRDER.outerTop, slabBottom], [side * GIRDER.outerBottom, girderBottom], [side * GIRDER.inner, girderBottom]], 0, LENGTH, "paint");
    const [f0, f1] = side > 0 ? [halfDeck - FASCIA.width, halfDeck] : [-halfDeck, -halfDeck + FASCIA.width];
    Box(0, f0, LENGTH, f1, slabBottom - FASCIA.depth, slabBottom, "paint");
}
Box(0, -STRINGER.half, LENGTH, STRINGER.half, slabBottom - STRINGER.depth, slabBottom, "paint");
const bays = Math.round(LENGTH / BAY);
for (let i = 0; i < bays; i++) {
    const x = (i + 0.5) * (LENGTH / bays);
    Box(x - CROSS_GIRDER.half, -GIRDER.inner, x + CROSS_GIRDER.half, GIRDER.inner, slabBottom - CROSS_GIRDER.depth, slabBottom, "paint");
    for (const side of [-1, 1]) {
        // The stiffener: a flat strip down the outer web, just proud of it.
        const off = STIFFENER[1];
        Strut([x, side * (WebY(slabBottom) + off), slabBottom], [x, side * (WebY(girderBottom) + off), girderBottom], STIFFENER, STIFFENER, "paint");
        // The bracket: a triangle from the web out to the fascia under the overhang.
        ProfileX([
            [side * (WebY(bracketBottom) - 2), bracketBottom],
            [side * (halfDeck - FASCIA.width), slabBottom - FASCIA.depth],
            [side * (halfDeck - FASCIA.width), slabBottom],
            [side * (GIRDER.outerTop - 2), slabBottom],
        ], x - BRACKET.half, x + BRACKET.half, "paint");
    }
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

// --- The pylon: the Sockel in the river, two legs leaning in to the head, cross ties, a cross beam under the deck ---
const headTop = PYLON_TOP, headBottom = PYLON_TOP - HEAD.height;
const legTopZ = headBottom + HEAD.height / 3; // the legs end inside the head
const legFootZ = SOCKEL.top + LEG_FOOT.height;
/** How far out to the side a leg's center is at height z. */
const LegY = z => PYLON_BASE_Y * (1 - (z - legFootZ) / (legTopZ - legFootZ));
const clearance = LegY(DECK_HEIGHT + RAILING.height) - LEG.bottom[1] - halfDeck;
if (clearance < 16) throw new Error(`the pylon's legs pass the railing only ${clearance.toFixed(0)} units off: raise PYLON_BASE_Y or PYLON_TOP`);
const sockelY = PYLON_BASE_Y + SOCKEL.outY, copingBottom = SOCKEL.top - SOCKEL.copingHeight;
mesh.Extrude([CutwaterShape(PYLON_X, SOCKEL.x, sockelY, SOCKEL.point)], 0, copingBottom, "stone", "z");
mesh.Extrude([CutwaterShape(PYLON_X, SOCKEL.x + SOCKEL.coping, sockelY + SOCKEL.coping, SOCKEL.point)], copingBottom, SOCKEL.top, "concrete", "z");
for (const side of [-1, 1]) {
    const fx = LEG.bottom[0] + LEG_FOOT.margin, fy = LEG.bottom[1] + LEG_FOOT.margin, y = side * PYLON_BASE_Y;
    Box(PYLON_X - fx, y - fy, PYLON_X + fx, y + fy, SOCKEL.top, legFootZ, "paint");
    Strut([PYLON_X, y, legFootZ], [PYLON_X, side * LegY(legTopZ), legTopZ], LEG.bottom, LEG.top, "paint");
}
for (const z of PYLON_TIES) {
    const y = LegY(z);
    if (z - TIE[1] < DECK_HEIGHT + RAILING.height + 200) throw new Error(`the tie at ${z} hangs too low over the road`);
    Strut([PYLON_X, -y, z], [PYLON_X, y, z], TIE, TIE, "paint");
}
Box(PYLON_X - HEAD.x / 2, -HEAD.y / 2, PYLON_X + HEAD.x / 2, HEAD.y / 2, headBottom, headTop, "paint");
const capX = HEAD.x / 2 + HEAD.cap, capY = HEAD.y / 2 + HEAD.cap;
Box(PYLON_X - capX, -capY, PYLON_X + capX, capY, headTop, headTop + HEAD.capHeight, "paint");
const pylonBeamTop = girderBottom, pylonBeamBottom = girderBottom - PYLON_BEAM_HEIGHT;
const beamY = LegY(pylonBeamBottom);
Box(PYLON_X - LEG.bottom[0], -beamY, PYLON_X + LEG.bottom[0], beamY, pylonBeamBottom, pylonBeamTop, "paint");

// --- The cables: bundles of ropes from the head down to brackets outside both deck edges ---
const cableAnchors = [...MAIN_CABLES.map(d => PYLON_X - d), ...BACK_CABLES.map(d => PYLON_X + d)];
const anchorY = halfDeck + ANCHOR.out, anchorZ = DECK_HEIGHT + ANCHOR.height;
const bundleHalf = ((ROPES.count - 1) / 2) * ROPES.spacing + ROPES.radius; // the bundle's half width in the cable plane
const cables = []; // [top, bottom] of every stay, for the lamps to keep clear of
let lowestOverRoad = Infinity;
for (const x of cableAnchors) {
    const reach = Math.abs(x - PYLON_X);
    const rank = [...MAIN_CABLES, ...BACK_CABLES].filter(d => d > reach).length; // longer cables leave higher
    const headZ = headTop - 40 - CABLE_HEAD_STEP * Math.min(rank, 2);
    for (const side of [-1, 1]) {
        const top = [PYLON_X + Math.sign(x - PYLON_X) * HEAD.x / 4, side * HEAD.y / 4, headZ]; // starts inside the head
        const bottom = [x, side * anchorY, anchorZ];
        cables.push([top, bottom]);
        const { other } = Across(V3.Unit(V3.Sub(bottom, top)));
        for (let k = 0; k < ROPES.count; k++) {
            const shift = V3.Scale(other, (k - (ROPES.count - 1) / 2) * ROPES.spacing);
            mesh.Tube([V3.Add(top, shift), V3.Add(bottom, shift)], ROPES.radius, ROPES.sides, "paint", false);
        }
        // The bracket: from under the slab out to the anchor, up to the bundle's top rope.
        const [y0, y1] = side > 0 ? [halfDeck, anchorY + bundleHalf] : [-anchorY - bundleHalf, -halfDeck];
        Box(x - ANCHOR.x, y0, x + ANCHOR.x, y1, slabBottom, anchorZ + bundleHalf, "paint");
        // Its height over the railing and over the road's edge: what a jumping melon could hit.
        const Over = y => anchorZ + ((anchorY - y) / (anchorY - Math.abs(top[1]))) * (headZ - anchorZ) - DECK_HEIGHT;
        if (Over(halfRoad + PARAPET.width) < RAILING.height + bundleHalf) throw new Error(`a cable cuts the railing at x ${x}: raise ANCHOR.height or ANCHOR.out`);
        lowestOverRoad = Math.min(lowestOverRoad, Over(halfRoad) - bundleHalf);
    }
}

// --- Street lamps on both parapets: pole, an arm bent out over the road, a head with glowing glass ---
let lamps = 0;
const poleBottom = DECK_HEIGHT + PARAPET.height, poleTop = DECK_HEIGHT + LAMP.height;
for (let x = LAMP.every / 2; x < LENGTH; x += LAMP.every) {
    for (const side of [-1, 1]) {
        const y = side * parapetMiddle, tipY = y - side * LAMP.reach;
        const arm = [[x, y, poleTop], [x, y - side * LAMP.reach * 0.4, poleTop + 18], [x, tipY, poleTop + 24]];
        const lampPath = [[x, y, poleBottom], ...arm];
        const near = Math.min(...cables.flatMap(([a, b]) => lampPath.slice(1).map((p, i) => SegmentDistance(lampPath[i], p, a, b))));
        if (near < LAMP.clearance + bundleHalf) continue;
        mesh.Tube([[x, y, poleBottom], [x, y, poleTop]], LAMP.radius, LAMP.sides, "steel", false);
        mesh.Tube(arm, LAMP.radius * 0.8, LAMP.sides, "steel", false);
        const hz = poleTop + 24;
        Box(x - 10, tipY - 16, x + 10, tipY + 16, hz - 6, hz + 4, "steel");
        Box(x - 8, tipY - 13, x + 8, tipY + 13, hz - 9, hz - 6, "lamp");
        lamps++;
    }
}

// --- Struts: a pair on every pier, leaning out from the pier's top to bearings under both girders ---
const bearingY = (GIRDER.inner + GIRDER.outerBottom) / 2, strutTopZ = girderBottom - BEARING.height;
function Struts(x, z) {
    for (const side of [-1, 1]) {
        Strut([x, side * STRUT.footY, z], [x, side * bearingY, strutTopZ], STRUT.bottom, STRUT.top, "paint");
        Box(x - BEARING.x, side * bearingY - BEARING.y, x + BEARING.x, side * bearingY + BEARING.y, strutTopZ, girderBottom, "paint");
    }
}

// --- The river pier: a lower stone Sockel with cutwaters ---
const riverCoping = RIVER_PIER.top - SOCKEL.copingHeight;
mesh.Extrude([CutwaterShape(RIVER_PIER_X, RIVER_PIER.x, RIVER_PIER.y, RIVER_PIER.point)], 0, riverCoping, "stone", "z");
mesh.Extrude([CutwaterShape(RIVER_PIER_X, RIVER_PIER.x + SOCKEL.coping, RIVER_PIER.y + SOCKEL.coping, RIVER_PIER.point)], riverCoping, RIVER_PIER.top, "concrete", "z");
Struts(RIVER_PIER_X, RIVER_PIER.top);

// --- Land supports: a concrete plinth and a pair of struts ---
const landXs = [FOOTING.x / 2, ...LAND_SUPPORTS, LENGTH - FOOTING.x / 2];
for (const x of landXs) {
    Box(x - FOOTING.x / 2, -FOOTING.y / 2, x + FOOTING.x / 2, FOOTING.y / 2, 0, FOOTING.height, "concrete");
    Struts(x, FOOTING.height);
}

// --- The masonry texture: courses of blocks in a running bond, each block a little lighter or darker ---
const random = SeededRandom(0x5e7e);
const shades = Array.from({ length: 64 }, () => (random() - 0.5) * 2 * STONE.vary);
const stoneColor = EncodePng(128, 128, (px, py) => {
    const course = Math.floor(py / STONE.course), shift = (course % 2) * (STONE.block / 2);
    const bx = (px + shift) % 128, block = Math.floor(bx / STONE.block);
    if (py % STONE.course < STONE.joint || bx % STONE.block < STONE.joint) return [...STONE.mortar, 255];
    const s = shades[(course * 2 + block) % shades.length] + ((px * 7 + py * 13) % 5) - 2;
    return [...STONE.base.map(c => Math.max(0, Math.min(255, Math.round(c + s)))), 255];
});

const parts = [...Object.keys(COLORS), "stone"];
const materials = Object.fromEntries(parts.map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(mesh, NAME, materials));
for (const part of parts) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, part === "stone" ? stoneColor : SolidPng(COLORS[part]));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, glow: GLOW[part] ?? 0 }));
}
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles; ${LENGTH} long, road ${DECK_HEIGHT} up and ${ROAD_WIDTH} wide, ${bays} bays; `
    + `pylon at x ${PYLON_X}, ${PYLON_TOP} high, legs ${clearance.toFixed(0)} clear of the railing, on a stone pier up to ${SOCKEL.top}; `
    + `${cableAnchors.length * 2} cables of ${ROPES.count} ropes, the lowest ${lowestOverRoad.toFixed(0)} over the road's edge; ${lamps} lamps; `
    + `river piers at x ${RIVER_PIER_X} (up to ${RIVER_PIER.top}) and ${PYLON_X}, land supports at x ${landXs.map(x => x.toFixed(0)).join(", ")}`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the floor under the start of the road, road along +X, the river along Y; keep the water below ${FOUNDATION_TOP})`);
