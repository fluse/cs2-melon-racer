// Builds Cologne's Hohenzollernbruecke as a race track for Hammer —
// `node tools/models/make-hohenzollern-bridge-model.mjs`: like the original,
// SECTIONS bridges side by side (each its own deck), along +X LENGTH long, the
// decks' top DECK_HEIGHT above the floor, carried by three steel arch trusses
// in a row (SPANS), the middle one, over the river's channel, wider and higher. Each section's deck runs between two truss planes; two
// neighbouring sections share the plane between them (SECTIONS + 1 planes).
// A plane: a curved top chord and a lower arch chord below it, verticals from
// the deck up to the top chord and diagonals zigzagging between the chords,
// the arches of neighbouring spans meeting low over the river piers (the three
// humps of the skyline). In every section, high over its deck, cross beams and
// a zigzag of diagonals brace its two top chords. Each deck: two tracks laid
// flat (ballast with sleepers, the rails single faces, no bumps), a tie along
// each truss foot that is the wall melons bounce off; outside the outer planes
// a walkway on each side with the love lock fence along the truss and a
// parapet with a handrail at the river side. Two stone river piers with
// cutwaters, a stone abutment under each end. The river runs along Y (the
// water itself is a Hammer func_water). Steel paint: a grey green.
// Writes
//   models/melon_racer/hohenzollern_bridge.dmx  for Hammer's File > Import: edit it
//                                               like any mesh, collision from the mesh itself
//   materials/melon_racer/hohenzollern_bridge/hohenzollern_bridge_<part>.vmat (+ _color.png;
//                                               stone, track and locks are textures, 1 px = 1 unit)
// Origin: on the floor (the river bed), under the start of the decks, in the
// middle of the middle section; the decks run along +X. Over the abutments
// the trusses and their ties end: there the three decks and the walkways
// meet, so a melon can pick its lane or the walkway (or jump through the truss
// openings into the next one). A melon falling off lands DECK_HEIGHT down:
// put a melon_respawn (or melon_break) trigger below.
import { Area, DmxText, Mesh, SeededRandom, SolidPng, V3, VmatText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

// --- Along the decks ---
// The arch trusses in a row, like the original (118 m - 167 m - 118 m): pier middle to pier middle, truss panels
// (verticals and diagonals at the panel points), the chords' centerlines above the deck at the crown (top and lower chord).
const SPANS = [
    { length: 2600, panels: 9, crownTop: 560, crownLow: 390 },
    { length: 3680, panels: 12, crownTop: 800, crownLow: 580 },
    { length: 2600, panels: 9, crownTop: 560, crownLow: 390 },
];
const END = 240; // the decks over each abutment, beyond the last arch
const LENGTH = 2 * END + SPANS.reduce((sum, span) => sum + span.length, 0); // along X
const ARCH_GAP = 24; // between the arch ends of two spans over a pier, from the pier's middle

// --- Height ---
const DECK_HEIGHT = 560; // the decks' top above the floor
const SLAB_THICKNESS = 32;
const ARCH = { endTop: 320, endLow: 20 }; // the chords' centerlines above the deck at the arch ends (the lower one down in the tie); the crowns per span in SPANS

// --- Across the decks (Y, from the middle) ---
const SECTIONS = 3; // bridges side by side, like the original
const PITCH = 480; // truss plane to truss plane: one section's width
const TIE = { half: 24, height: 40, below: 60 }; // along each truss foot, centered on its plane: its faces are the walls; top above the deck, how far it hangs below it
const WALKWAY = 160; // outside the outer ties, up to the parapet
const PARAPET = { width: 16, height: 40 }; // at the walkway's river side: a solid wall
const HANDRAIL = { height: 96, size: 6, postEvery: 720, post: 6 }; // on the parapet: top above the deck (a ground jump reaches ~86)
const LOCK_FENCE = { thickness: 6, height: 90 }; // the love lock fence along the outer trusses, on the walkway side

// --- The trusses' members: half sizes ---
const CHORD = { y: 14, depth: 44 }; // both chords: half thickness across, full depth in the truss plane
const VERTICAL = [12, 9]; // [across, along X]
const END_POST = [14, 16];
const DIAGONAL = [10, 7];
const BRACE = { beam: [8, 14], diagonal: [6, 8], minShare: 0.85 }; // the top bracing: cross beams [along X, up], diagonals; only where the top chord is at least this share of its crown's height over the deck

// --- Tracks per section, laid flat a hair above the deck ---
const TRACKS = [-96, 96]; // the tracks' middles from the section's middle
const TRACK_BED = 72; // half width of the ballast strip (a sleeper's length)
const GAUGE = 48; // the rails' middles from the track's middle
const RAIL = 3; // half width
const LIFT = { bed: 0.5, rail: 1 };

// --- Piers ---
const PIER = { x: 160, point: 240, coping: 12, copingHeight: 20, overhang: 40 }; // river piers: half size along X, cutwaters up- and downstream, a coping slab on top (`coping` wider), reaching `overhang` past the parapets
const ABUTMENT_OVERHANG = 40; // the abutments past the parapets

const COLORS = {
    paint: [0x6e, 0x8c, 0x7a], // the Hohenzollernbruecke's grey green steel: trusses, ties, fence frame, handrail
    deck: [0x6a, 0x66, 0x60], // the deck between and beside the tracks: gravel grey
    walkway: [0x4a, 0x4d, 0x52], // dark asphalt
    rail: [0xa4, 0xa8, 0xae], // polished rail heads
    coping: [0xb8, 0xb0, 0xa2], // the piers' coping, light stone
};
const STONE = { base: [0x9a, 0x8e, 0x7c], mortar: [0x62, 0x5a, 0x50], vary: 16, course: 32, block: 64, joint: 2 }; // masonry: courses `course` high, blocks `block` long in a running bond
const TRACK = { ballast: [0x7c, 0x74, 0x6a], vary: 22, sleeper: [0x8e, 0x88, 0x80], every: 32, width: 10 }; // ballast with a concrete sleeper across every `every` units
const LOCKS = { mesh: [0x3c, 0x46, 0x40], grid: 6, count: 420, colors: [[0xd8, 0x2b, 0x2b], [0xe8, 0xb4, 0x22], [0xec, 0x5f, 0x9a], [0x2f, 0x6f, 0xd0], [0x3b, 0xa0, 0x58], [0xc0, 0xc4, 0xc8], [0xee, 0x7a, 0x1e], [0x8a, 0x4c, 0xc8], [0xb0, 0x8a, 0x3c]] };

const NAME = "hohenzollern_bridge";
const MATERIAL_DIR = "materials/melon_racer/hohenzollern_bridge";
const GENERATOR = "tools/models/make-hohenzollern-bridge-model.mjs";

const mesh = new Mesh(128);
/** A rectangle [x0, y0]..[x1, y1] as a counter-clockwise shape. */
const Rect = (x0, y0, x1, y1) => ({ outer: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], holes: [] });
/** A polygon as a shape, turned counter-clockwise whichever way it was given. */
const Polygon = pts => ({ outer: Area(pts) < 0 ? [...pts].reverse() : pts, holes: [] });
/** An upright box x0..x1, y0..y1, z0..z1, a closed shell of its own (it touches others; see Mesh.NewShell). */
function Box(x0, y0, x1, y1, z0, z1, part, topPart = part) {
    mesh.NewShell();
    mesh.Extrude([Rect(x0, y0, x1, y1)], z0, z1, part, "z", topPart);
}
/** A box lying along X: its cross-section y0..y1, z0..z1. */
function BarX(x0, x1, y0, y1, z0, z1, part) {
    mesh.NewShell();
    mesh.Extrude([Rect(y0, z0, y1, z1)], x0, x1, part, "x");
}
/** A river pier's outline around (x, 0): half sizes hx, hy, pointed cutwaters `point` long at both ends along Y. */
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
 * A square beam from a to b, its ends left open (they sit inside the chords
 * and ties): half sizes [across, the other way]. The `across` axis is
 * horizontal at right angles to the beam (for a vertical one: along Y).
 */
function Member(a, b, [hs, ho], part) {
    const t = V3.Unit(V3.Sub(b, a));
    const side = V3.Unit(V3.Cross(t, Math.abs(t[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0]));
    const other = V3.Cross(side, t);
    const Ring = p => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, o]) => V3.Add(V3.Add(p, V3.Scale(side, s * hs)), V3.Scale(other, o * ho)));
    const ra = Ring(a), rb = Ring(b), center = V3.Scale(V3.Add(a, b), 0.5);
    mesh.NewShell();
    for (let i = 0; i < 4; i++) Quad(ra[i], ra[(i + 1) % 4], rb[(i + 1) % 4], rb[i], center, part);
}

/** A parabola over t 0..1: `end` at both ends, `crown` in the middle. */
const Arc = (end, crown, t) => end + (crown - end) * (1 - (2 * t - 1) ** 2);

// --- Across: the truss planes' and the sections' middles, the outer edges ---
const planeYs = Array.from({ length: SECTIONS + 1 }, (_, i) => (i - SECTIONS / 2) * PITCH);
const sectionYs = planeYs.slice(1).map(y => y - PITCH / 2);
const tieOuter = planeYs[SECTIONS] + TIE.half; // the outer ties' outer faces
const walkwayOuter = tieOuter + WALKWAY + PARAPET.width; // the parapets' outer faces

// --- The decks: one slab under all of them, the walkways, ties along the trusses ---
const slabBottom = DECK_HEIGHT - SLAB_THICKNESS;
const archStart = END, archEnd = LENGTH - END; // the first arch's foot, the last one's
Box(0, -tieOuter, LENGTH, tieOuter, slabBottom, DECK_HEIGHT, "paint", "deck");
for (const y of planeYs) Box(archStart, y - TIE.half, archEnd, y + TIE.half, DECK_HEIGHT - TIE.below, DECK_HEIGHT + TIE.height, "paint");
for (const side of [-1, 1]) {
    const Y = (a, b) => (side > 0 ? [a, b] : [-b, -a]);
    const [w0, w1] = Y(tieOuter, walkwayOuter - PARAPET.width);
    Box(0, w0, LENGTH, w1, slabBottom, DECK_HEIGHT, "paint", "walkway");
    const [p0, p1] = Y(walkwayOuter - PARAPET.width, walkwayOuter);
    Box(0, p0, LENGTH, p1, slabBottom, DECK_HEIGHT + PARAPET.height, "paint");
    // The handrail on posts along the parapet.
    const yc = side * (walkwayOuter - PARAPET.width / 2), h = HANDRAIL.size / 2, p = HANDRAIL.post / 2;
    const posts = Math.round(LENGTH / HANDRAIL.postEvery);
    for (let i = 0; i <= posts; i++) {
        const x = Math.min(LENGTH - p, Math.max(p, (LENGTH * i) / posts));
        Member([x, yc, DECK_HEIGHT + PARAPET.height], [x, yc, DECK_HEIGHT + HANDRAIL.height - HANDRAIL.size], [p, p], "paint");
    }
    BarX(0, LENGTH, yc - h, yc + h, DECK_HEIGHT + HANDRAIL.height - HANDRAIL.size, DECK_HEIGHT + HANDRAIL.height, "paint");
    // The love lock fence, against the outer truss on the walkway side.
    const [f0, f1] = Y(tieOuter, tieOuter + LOCK_FENCE.thickness);
    Box(archStart, f0, archEnd, f1, DECK_HEIGHT, DECK_HEIGHT + LOCK_FENCE.height, "locks", "paint");
}

// --- Tracks: two per section, ballast strips with sleepers, the rails on top, single faces ---
const trackYs = sectionYs.flatMap(c => TRACKS.map(t => c + t));
mesh.NewShell();
mesh.Cap(trackYs.map(y => Rect(0, y - TRACK_BED, LENGTH, y + TRACK_BED)), DECK_HEIGHT + LIFT.bed, "track", "z");
mesh.NewShell();
mesh.Cap(trackYs.flatMap(y => [-GAUGE, GAUGE].map(g => Rect(0, y + g - RAIL, LENGTH, y + g + RAIL))), DECK_HEIGHT + LIFT.rail, "rail", "z");

// --- The arch trusses: per span every plane's chords, verticals, diagonals; per section the top bracing between its two planes ---
let members = 0, braces = 0;
const archFeet = [];
let lowestBrace = Infinity;
for (let s = 0, pierA = END; s < SPANS.length; pierA += SPANS[s++].length) {
    const { length, panels: PANELS, crownTop, crownLow } = SPANS[s], pierB = pierA + length;
    const a = pierA + (s === 0 ? 0 : ARCH_GAP), b = pierB - (s === SPANS.length - 1 ? 0 : ARCH_GAP);
    archFeet.push([a, b]);
    const X = i => a + ((b - a) * i) / PANELS;
    const Top = i => DECK_HEIGHT + Arc(ARCH.endTop, crownTop, i / PANELS);
    const Low = i => DECK_HEIGHT + Arc(ARCH.endLow, crownLow, i / PANELS);
    const half = CHORD.depth / 2;
    for (const y of planeYs) {
        // The chords: curved bands in the truss plane, extruded across it (smooth along the curve).
        for (const Z of [Top, Low]) {
            const upper = Array.from({ length: PANELS + 1 }, (_, i) => [Z(i) + half, X(i)]);
            const lower = Array.from({ length: PANELS + 1 }, (_, i) => [Z(PANELS - i) - half, X(PANELS - i)]);
            mesh.NewShell();
            mesh.Extrude([Polygon([...upper, ...lower])], y - CHORD.y, y + CHORD.y, "paint", "y");
        }
        // Verticals from the tie up into the top chord, end posts at the arch's feet.
        for (let i = 0; i <= PANELS; i++) {
            const end = i === 0 || i === PANELS;
            Member([X(i), y, DECK_HEIGHT + TIE.height - 4], [X(i), y, Top(i) + half - 4], end ? END_POST : VERTICAL, "paint");
            members++;
        }
        // Diagonals between the chords, zigzagging from panel to panel.
        for (let i = 0; i < PANELS; i++) {
            const [lo, hi] = i % 2 === 0 ? [i, i + 1] : [i + 1, i];
            Member([X(lo), y, Low(lo)], [X(hi), y, Top(hi)], DIAGONAL, "paint");
            members++;
        }
    }
    // The top bracing: a cross beam at every panel point high enough over the deck, diagonals between them.
    const braced = [];
    for (let i = 0; i <= PANELS; i++) if (Top(i) - DECK_HEIGHT >= BRACE.minShare * crownTop) braced.push(i);
    lowestBrace = Math.min(lowestBrace, ...braced.map(i => Top(i) - DECK_HEIGHT - BRACE.beam[1]));
    for (let k = 0; k < SECTIONS; k++) {
        const [y0, y1] = [planeYs[k], planeYs[k + 1]];
        for (const i of braced) {
            Member([X(i), y0, Top(i)], [X(i), y1, Top(i)], BRACE.beam, "paint");
            braces++;
        }
        for (let n = 0; n + 1 < braced.length; n++) {
            const i = braced[n], j = braced[n + 1], [ya, yb] = n % 2 ? [y1, y0] : [y0, y1];
            Member([X(i), ya, Top(i)], [X(j), yb, Top(j)], BRACE.diagonal, "paint");
            braces++;
        }
    }
}

// --- The river piers, between the spans: stone with cutwaters, a coping slab ---
const pierXs = SPANS.slice(0, -1).map((_, i) => END + SPANS.slice(0, i + 1).reduce((sum, span) => sum + span.length, 0));
const pierY = walkwayOuter + PIER.overhang;
const copingBottom = slabBottom - PIER.copingHeight;
for (const x of pierXs) {
    mesh.NewShell();
    mesh.Extrude([CutwaterShape(x, PIER.x, pierY, PIER.point)], 0, copingBottom, "stone", "z");
    mesh.NewShell();
    mesh.Extrude([CutwaterShape(x, PIER.x + PIER.coping, pierY + PIER.coping, PIER.point)], copingBottom, slabBottom, "coping", "z");
}

// --- The abutments under both ends ---
const abutmentY = walkwayOuter + ABUTMENT_OVERHANG;
for (const [x0, x1] of [[0, END], [LENGTH - END, LENGTH]]) Box(x0, -abutmentY, x1, abutmentY, 0, slabBottom, "stone");

// --- Textures: masonry, ballast with sleepers, the lock fence ---
const random = SeededRandom(0x4011);
const shades = Array.from({ length: 64 }, () => (random() - 0.5) * 2 * STONE.vary);
const Clamp = c => Math.max(0, Math.min(255, Math.round(c)));
const stoneColor = EncodePng(128, 128, (px, py) => {
    const course = Math.floor(py / STONE.course), shift = (course % 2) * (STONE.block / 2);
    const bx = (px + shift) % 128, block = Math.floor(bx / STONE.block);
    if (py % STONE.course < STONE.joint || bx % STONE.block < STONE.joint) return [...STONE.mortar, 255];
    const s = shades[(course * 2 + block) % shades.length] + ((px * 7 + py * 13) % 5) - 2;
    return [...STONE.base.map(c => Clamp(c + s)), 255];
});
// The ballast: a stone every 2 px, a little lighter or darker; the sleepers across X (the texture's U).
const gravel = Array.from({ length: 64 * 64 }, () => (random() - 0.5) * 2 * TRACK.vary);
const trackColor = EncodePng(128, 128, (px, py) => {
    if (px % TRACK.every < TRACK.width) return [...TRACK.sleeper.map(c => Clamp(c + ((py * 5) % 7) - 3)), 255];
    const g = gravel[(py >> 1) * 64 + (px >> 1)];
    return [...TRACK.ballast.map(c => Clamp(c + g)), 255];
});
// The fence: a dark mesh, covered in padlocks of every color (drawn wrapping round, so it tiles).
const lockPixels = Array.from({ length: 128 * 128 }, (_, i) => {
    const px = i % 128, py = i >> 7;
    return px % LOCKS.grid === 0 || py % LOCKS.grid === 0 ? LOCKS.mesh.map(c => c + 18) : LOCKS.mesh;
});
const Put = (x, y, rgb) => { lockPixels[((y + 128) % 128) * 128 + ((x + 128) % 128)] = rgb; };
for (let k = 0; k < LOCKS.count; k++) {
    const color = LOCKS.colors[Math.floor(random() * LOCKS.colors.length)];
    const w = 4 + Math.floor(random() * 4), h = 5 + Math.floor(random() * 4);
    const x = Math.floor(random() * 128), y = Math.floor(random() * 128);
    const light = color.map(c => Clamp(c * 1.25 + 20)), dark = color.map(c => Clamp(c * 0.6));
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) Put(x + dx, y + dy, dx === 0 || dy === 0 ? light : dx === w - 1 || dy === h - 1 ? dark : color);
    // The shackle: a grey loop above the body — further down the image, since V (down the image) runs up the fence.
    const steel = [0x9a, 0x9e, 0xa4];
    for (let dx = 1; dx < w - 1; dx++) Put(x + dx, y + h + 1, steel);
    Put(x + 1, y + h, steel);
    Put(x + w - 2, y + h, steel);
}
const locksColor = EncodePng(128, 128, (px, py) => [...lockPixels[py * 128 + px], 255]);

const textures = { stone: stoneColor, track: trackColor, locks: locksColor };
const parts = [...Object.keys(COLORS), ...Object.keys(textures)];
const materials = Object.fromEntries(parts.map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const dmx = DmxText(mesh, NAME, materials);
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, dmx);
for (const part of parts) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, textures[part] ?? SolidPng(COLORS[part]));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, metalness: part === "rail" ? 0.6 : 0 }));
}
const polygons = (dmx.match(/"-1"/g) ?? []).length;
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles (${polygons} polygons after merging in Hammer); ${LENGTH} long, decks ${DECK_HEIGHT} up; `
    + `${SECTIONS} sections side by side, each ${PITCH - 2 * TIE.half} wide between its ties (middles at y ${sectionYs.join(", ")}), walkways ${WALKWAY} wide, ${2 * walkwayOuter} wide in all; `
    + `arch spans ${SPANS.map(span => `${span.length} (${span.panels} panels, crown ${span.crownTop})`).join(" - ")}, ${planeYs.length} truss planes, ${members} truss members, ${braces} top braces, `
    + `the lowest brace ${lowestBrace.toFixed(0)} over the deck; river piers at x ${pierXs.join(", ")}, arch feet ${archFeet.map(([a, b]) => `${a}-${b}`).join(", ")}`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the floor under the start of the decks, in the middle section's middle, decks along +X, the river along Y; water below ${slabBottom - PIER.copingHeight})`);
