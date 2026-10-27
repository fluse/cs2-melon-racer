// Builds a vertical parkour race track shaped like a snail shell as mesh
// geometry for Hammer — `node tools/models/make-parkour-model.mjs`: the course
// winds counter-clockwise (seen from above) round a central spire, its radius
// shrinking by SPIRAL.shrink every turn while it climbs, so each turn runs
// inside and above the one before and the finish is the shell's tip. Laid out
// along the course (s along it, t across it, positive outwards, z up), in
// five sections:
//   1. JUMPS: floating platforms, each a little higher and off to the side,
//      a gap between each (ground jumps),
//   2. CANYON: a gap too long for a plain jump between two tall curved
//      walls — crossed by wall jumps / wall bounces off them (the curve keeps
//      sending the melon into the outer wall), landing a bit lower,
//   3. TOWER: a tower entered through a door at its foot, climbed without a
//      lift zone: a spiral staircase of ledges in its four corners, round and
//      round, each TOWER.rise higher (a ground jump; wall jumps off its walls
//      skip some), left from the last one over its far wall onto
//   4. DECK: a long curved deck with railings, chicanes (half-width walls
//      from alternating sides) to weave through and hurdles to jump,
//   5. STAIRS: ledges on alternating sides between two tall walls, each
//      LEDGE.rise higher, jumped up (wall jumps help) to the summit, the finish.
// A round catch floor (BASE) under it all: falls end there — give it a
// melon_respawn trigger (the output says where). Colors say what a surface
// is for: grey floors, orange walls to jump/bounce off, magenta obstacles,
// graphite edges, supports and the spire.
// Writes
//   models/melon_racer/parkour.dmx  for Hammer's File > Import: edit it like
//                                   any mesh, collision from the mesh itself
//   materials/melon_racer/parkour/parkour_<part>.vmat (+ _color.png)
// Origin: on the catch floor in the spiral's middle (under the spire); the
// course starts on +X and runs counter-clockwise. Every solid is a shell of
// its own (Mesh.NewShell): they touch and overlap. Curved solids are cut into
// straight pieces of at most SPIRAL.stepDegrees.
// Every horizontal size below (along, across, the spiral's radius) is in
// course units, shrunk by SCALE on the way into the world; heights aren't
// (they're tied to the jump physics).
import { Circle, DmxText, Mesh, SolidPng, V3, VmatText, WriteAddonFile } from "../lib/model.mjs";

const SCALE = 0.8; // horizontal: the whole course a fifth smaller than its course units

// --- The spiral ---
const SPIRAL = {
    radius: 1500, // the course's middle line at the start
    shrink: 600, // inwards per turn: more than the widest part (stairs and summit, 512) plus room, so turns never touch
    stepDegrees: 4, // curved solids in straight pieces of at most this
};
const SPIRE = { gap: 96, sides: 24, above: 384 }; // the middle column: this far inside the summit, up past it

// --- Sizes: a melon is ~14 across; a ground jump rises ~85 and flies ~600 at
// MAX_SPEED (JUMP_SPEED 370, GRAVITY 800, MAX_SPEED 650) — so a gap of up to
// ~300 with LEDGE.rise up is a sure jump, and CANYON.gap needs walls ---
const SLAB = 32; // thickness of every deck and platform
const START = { z: 384, length: 640, width: 512 }; // the first deck's top; long enough to reach top speed (~650 units)
const RAIL = { height: 40, thickness: 24 }; // along deck edges: walls melons bounce off
const BACK_WALL = 128; // behind the start and the summit
const JUMPS = [ // 1. gap before each platform, rise from the one before, sideways offset of its middle
    { gap: 192, rise: 64, t: 0 },
    { gap: 224, rise: 64, t: 96 },
    { gap: 256, rise: 64, t: -96 },
    { gap: 256, rise: 64, t: 0 },
];
const PLATFORM = { length: 256, width: 288 };
const FORECOURT = { gap: 224, length: 384, width: 384 }; // the deck before the canyon, level with the last platform
const CANYON = { gap: 896, width: 224, wallAbove: 320, overlap: 160, drop: 64 }; // the gap along the course; between the walls' inner faces; how high they stand over the deck; how far they reach onto the decks; the landing lower by
const WALL = 32; // thickness of the canyon's, tower's and stairs' walls
const LANDING = { length: 384, width: 384 }; // after the canyon, up to the tower's door
// The tower: inside (square), its corner ledges (square, the gap between two
// neighbours inside - 2 * corner), up per ledge, how many (the last one must
// sit in a far corner: count % 4 is 2 or 3), the door (height, width) in the
// near wall, the other walls past the far wall's top (= the deck).
const TOWER = { inside: 360, corner: 140, rise: 64, ledges: 11, door: [160, 80], above: 192, ledgeThickness: 24 };
const DECK = { length: 1920, width: 384 };
const CHICANES = { first: 320, every: 256, count: 4, lane: 144, height: 128 }; // from the deck's start; spacing; the gap left at the other railing; height
const HURDLES = { at: [1408, 1600], height: 40, depth: 32 }; // along the deck; low enough to jump (~85)
const LEDGE = { count: 10, gap: 64, every: 176, length: 192, rise: 64, inner: 16 }; // the stairs: gap from the deck; step along; size along; up per ledge; from the middle line to its inner edge
const STAIRS_WIDTH = 448; // between the stairs' walls' inner faces
const SUMMIT = { gap: 64, length: 448, width: 512 };
const SUPPORT = 32; // columns under the decks
const BASE = { margin: 384, thickness: 16, sides: 48 };

const COLORS = {
    floor: [0xd3, 0xd6, 0xda], // light grey, what melons drive on
    edge: [0x2b, 0x30, 0x38], // graphite slab edges, railings, supports, the spire
    wall: [0xff, 0x8a, 0x1f], // orange: walls to wall-jump and bounce off (canyon, tower, stairs)
    obstacle: [0xff, 0x20, 0xff], // magenta like the buffer stop and spike spring: get out of its way
    base: [0x1e, 0x22, 0x28], // the catch floor
};

const NAME = "parkour";
const MATERIAL_DIR = "materials/melon_racer/parkour";
const GENERATOR = "tools/models/make-parkour-model.mjs";
const Deg = r => (r * 180) / Math.PI;

// --- The spiral's middle line: radius by angle, angle by distance along it (a table, integrated) ---
const RadiusAt = a => SPIRAL.radius - (SPIRAL.shrink * a) / (2 * Math.PI);
const table = [{ a: 0, s: 0 }];
for (let a = 0, s = 0, da = 0.0005; RadiusAt(a) > 0;) {
    s += Math.hypot(RadiusAt(a + da / 2), SPIRAL.shrink / (2 * Math.PI)) * da;
    a += da;
    table.push({ a, s });
}
/** The angle at distance s along the middle line. */
function AngleAt(s) {
    if (s > table.at(-1).s) throw new Error(`the course (${s.toFixed(0)} long) runs past the spiral's middle: raise SPIRAL.radius or lower SPIRAL.shrink`);
    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (table[mid].s <= s) lo = mid; else hi = mid; }
    const f = (s - table[lo].s) / (table[hi].s - table[lo].s || 1);
    return table[lo].a + f * (table[hi].a - table[lo].a);
}
/** Course coordinates to the world: s along, t across (outwards), z up; horizontally shrunk by SCALE. */
const P = (s, t, z) => {
    const a = AngleAt(s), r = (RadiusAt(a) + t) * SCALE;
    return [r * Math.cos(a), r * Math.sin(a), z];
};
const Outward = s => { const a = AngleAt(s); return [Math.cos(a), Math.sin(a), 0]; };
const Forward = s => V3.Unit(V3.Sub(P(s + 0.5, 0, 0), P(s - 0.5, 0, 0)));

const mesh = new Mesh(128);
/** A flat quad facing `out`, UVs projected from the world (top/bottom on X/Y, sides along their own width and Z). */
function Quad(points, out, part) {
    let n = V3.Unit(V3.Cross(V3.Sub(points[1], points[0]), V3.Sub(points[2], points[0])));
    if (V3.Dot(n, out) < 0) { points = [...points].reverse(); n = V3.Scale(n, -1); }
    const across = Math.abs(n[2]) > 0.7 ? null : V3.Unit(V3.Cross([0, 0, 1], n));
    const uvs = points.map(p => (across ? [V3.Dot(p, across) / 128, p[2] / 128] : [p[0] / 128, p[1] / 128]));
    mesh.Face(points, uvs, part);
}
/** A solid following the course, a shell of its own: s0..s1 along, t0..t1 across, z0..z1 (bounds in either order), its top `topPart`. */
function Block(s0, s1, t0, t1, z0, z1, part, topPart = part) {
    [s0, s1] = [Math.min(s0, s1), Math.max(s0, s1)];
    [t0, t1] = [Math.min(t0, t1), Math.max(t0, t1)];
    [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
    const n = Math.max(1, Math.ceil(Deg(AngleAt(s1) - AngleAt(s0)) / SPIRAL.stepDegrees));
    const ss = Array.from({ length: n + 1 }, (_, i) => s0 + ((s1 - s0) * i) / n);
    mesh.NewShell();
    for (let i = 0; i < n; i++) {
        const a = ss[i], b = ss[i + 1], out = Outward((a + b) / 2);
        Quad([P(a, t0, z1), P(b, t0, z1), P(b, t1, z1), P(a, t1, z1)], [0, 0, 1], topPart);
        Quad([P(a, t0, z0), P(b, t0, z0), P(b, t1, z0), P(a, t1, z0)], [0, 0, -1], part);
        Quad([P(a, t1, z0), P(b, t1, z0), P(b, t1, z1), P(a, t1, z1)], out, part);
        Quad([P(a, t0, z0), P(b, t0, z0), P(b, t0, z1), P(a, t0, z1)], V3.Scale(out, -1), part);
    }
    Quad([P(s0, t0, z0), P(s0, t1, z0), P(s0, t1, z1), P(s0, t0, z1)], V3.Scale(Forward(s0), -1), part);
    Quad([P(s1, t0, z0), P(s1, t1, z0), P(s1, t1, z1), P(s1, t0, z1)], Forward(s1), part);
}
/** A round solid around the origin, radius r, z0..z1, a shell of its own. */
function Disc(r, sides, z0, z1, part, topPart = part) {
    mesh.NewShell();
    mesh.Extrude([{ outer: Circle(0, 0, r, sides), holes: [] }], z0, z1, part, "z", topPart);
}
/** A deck s0..s1, `width` across around t, its top at z: floor on top, graphite sides. */
const Deck = (s0, s1, t, width, z) => Block(s0, s1, t - width / 2, t + width / 2, z - SLAB, z, "edge", "floor");
/** Railings along both long edges of a deck, on it. */
const Rails = (s0, s1, t, width, z) => {
    for (const side of [-1, 1]) Block(s0, s1, t + side * width / 2, t + side * (width / 2 - RAIL.thickness), z, z + RAIL.height, "edge");
};
/** Columns from the catch floor up under a deck, inset from its corners (one in the middle if it's short). */
let supports = 0;
function Supports(s0, s1, t, width, z, every = 384) {
    const inset = 48, n = Math.max(1, Math.round((s1 - s0 - 2 * inset) / every));
    const ss = s1 - s0 < 2 * inset + 160 ? [(s0 + s1) / 2] : Array.from({ length: n + 1 }, (_, i) => s0 + inset + ((s1 - s0 - 2 * inset) * i) / n);
    const ts = width < 320 ? [t] : [t - width / 2 + inset, t + width / 2 - inset];
    for (const s of ss) for (const tt of ts) {
        Block(s - SUPPORT / 2, s + SUPPORT / 2, tt - SUPPORT / 2, tt + SUPPORT / 2, 0, z - SLAB, "edge");
        supports++;
    }
}
const notes = []; // what to place in Hammer, printed at the end
const fmt = p => p.map(n => Math.round(n)).join(" ");
const Yaw = s => Math.round(Deg(Math.atan2(Forward(s)[1], Forward(s)[0])));
/** A trigger box across the course: centered at s, `length` along, the whole `width`, `height` up from z. */
const Note = (what, s, length, t, width, z, height) => notes.push(`${what}: center ${fmt(P(s, t, z + height / 2))}, yaw ${Yaw(s)}, size ${Math.round(length * SCALE)} along x ${Math.round(width * SCALE)} across x ${height} high`);
const At = (what, s, t, z) => notes.push(`${what}: at ${fmt(P(s, t, z))}, yaw ${Yaw(s)}`);

// --- Start ---
let s = 0, z = START.z;
Deck(0, START.length, 0, START.width, z);
Rails(0, START.length, 0, START.width, z);
Block(-WALL, 0, -START.width / 2, START.width / 2, z - SLAB, z + BACK_WALL, "edge");
Supports(0, START.length, 0, START.width, z);
At("start gate prefab (start_<trackId>) + start_spawn, facing along the course", START.length - 96, 0, z);
s = START.length;

// --- 1. Jump platforms ---
for (const j of JUMPS) {
    s += j.gap;
    z += j.rise;
    Deck(s, s + PLATFORM.length, j.t, PLATFORM.width, z);
    Supports(s, s + PLATFORM.length, j.t, PLATFORM.width, z);
    s += PLATFORM.length;
}
s += FORECOURT.gap;
Deck(s, s + FORECOURT.length, 0, FORECOURT.width, z);
Supports(s, s + FORECOURT.length, 0, FORECOURT.width, z);
At("checkpoint 1 (checkpoint gate prefab)", s + 112, 0, z);
s += FORECOURT.length;

// --- 2. Canyon: curved walls from the catch floor up, reaching onto both decks ---
const canyonS0 = s, canyonS1 = s + CANYON.gap, landingZ = z - CANYON.drop;
for (const side of [-1, 1]) {
    Block(canyonS0 - CANYON.overlap, canyonS1 + CANYON.overlap, side * CANYON.width / 2, side * (CANYON.width / 2 + WALL), 0, z + CANYON.wallAbove, "wall");
}
s = canyonS1;
z = landingZ;

// --- 3. Landing, then the tower: a spiral staircase of corner ledges inside ---
const I = TOWER.inside, half = I / 2, C = TOWER.corner, [doorH, doorW] = TOWER.door;
const towerS0 = s + LANDING.length, towerS1 = towerS0 + I, top = z + TOWER.rise * (TOWER.ledges + 1);
if (TOWER.ledges % 4 < 2) throw new Error(`TOWER.ledges ${TOWER.ledges}: the last ledge must sit in a far corner (ledges % 4 = 2 or 3)`);
Deck(s, towerS0, 0, LANDING.width, z);
Rails(s, towerS0 - WALL, 0, LANDING.width, z);
Supports(s, towerS0 - WALL, 0, LANDING.width, z);
At("checkpoint 2", s + 144, 0, z);
Deck(towerS0, towerS1, 0, I, z); // the tower's floor: a fall inside ends here, back to the first ledge
// The near wall round the door, the side walls, the far wall up to the deck: all from the catch floor.
for (const side of [-1, 1]) Block(towerS0 - WALL, towerS0, side * doorW / 2, side * (half + WALL), 0, top + TOWER.above, "wall");
Block(towerS0 - WALL, towerS0, -doorW / 2, doorW / 2, z + doorH, top + TOWER.above, "wall");
Block(towerS0 - WALL, towerS0, -doorW / 2, doorW / 2, 0, z - SLAB, "wall");
for (const side of [-1, 1]) Block(towerS0, towerS1, side * half, side * (half + WALL), 0, top + TOWER.above, "wall");
Block(towerS1, towerS1 + WALL, -half, half, 0, top, "wall", "floor");
// Ledge k in corner k % 4, round and round: near-outer, far-outer, far-inner, near-inner.
const CORNERS = [[0, 1], [1, 1], [1, -1], [0, -1]]; // [far?, outer side]
for (let k = 0; k < TOWER.ledges; k++) {
    const [far, side] = CORNERS[k % 4], ls = far ? towerS1 - C : towerS0, lz = z + TOWER.rise * (k + 1);
    Block(ls, ls + C, side * half, side * (half - C), lz - TOWER.ledgeThickness, lz, "edge", "floor");
}
s = towerS1 + WALL;
z = top;

// --- 4. Deck: chicanes and hurdles ---
const deckS0 = s;
Deck(s, s + DECK.length, 0, DECK.width, z);
Rails(s, s + DECK.length, 0, DECK.width, z);
Supports(s, s + DECK.length, 0, DECK.width, z);
At("checkpoint 3", s + 112, 0, z);
const halfIn = DECK.width / 2 - RAIL.thickness;
for (let i = 0; i < CHICANES.count; i++) {
    const cs = deckS0 + CHICANES.first + i * CHICANES.every, side = i % 2 ? 1 : -1; // from this railing, the lane at the other
    Block(cs, cs + WALL, side * halfIn, side * (halfIn - (2 * halfIn - CHICANES.lane)), z, z + CHICANES.height, "obstacle");
}
for (const h of HURDLES.at) Block(deckS0 + h, deckS0 + h + HURDLES.depth, -halfIn, halfIn, z, z + HURDLES.height, "obstacle");
At("spin_hammer prop_dynamic (optional hazard, sweeps 110 round)", deckS0 + (CHICANES.first + (CHICANES.count - 1) * CHICANES.every + WALL + HURDLES.at[0]) / 2, 0, z);
s = deckS0 + DECK.length;
At("checkpoint 4", s - 112, 0, z);

// --- 5. Stairs: ledges on alternating sides between two tall walls ---
const stairsS0 = s;
for (let i = 0; i < LEDGE.count; i++) {
    const ls = stairsS0 + LEDGE.gap + i * LEDGE.every, side = i % 2 ? -1 : 1;
    z += LEDGE.rise;
    Block(ls, ls + LEDGE.length, side * LEDGE.inner, side * STAIRS_WIDTH / 2, z - SLAB, z, "edge", "floor");
}
s = stairsS0 + LEDGE.gap + (LEDGE.count - 1) * LEDGE.every + LEDGE.length + SUMMIT.gap;
z += LEDGE.rise;
for (const side of [-1, 1]) Block(stairsS0, s, side * STAIRS_WIDTH / 2, side * (STAIRS_WIDTH / 2 + WALL), 0, z + 192, "wall");

// --- Summit: the finish ---
Deck(s, s + SUMMIT.length, 0, SUMMIT.width, z);
Rails(s, s + SUMMIT.length, 0, SUMMIT.width, z);
Block(s + SUMMIT.length, s + SUMMIT.length + WALL, -SUMMIT.width / 2, SUMMIT.width / 2, z - SLAB, z + BACK_WALL, "edge");
Supports(s, s + SUMMIT.length, 0, SUMMIT.width, z);
Note("finish_<trackId> trigger", s + 176, 96, 0, SUMMIT.width, z, 192);
const endS = s + SUMMIT.length + WALL;

// --- The spire in the middle, the catch floor ---
const innermost = RadiusAt(AngleAt(endS)) - Math.max(SUMMIT.width, STAIRS_WIDTH + 2 * WALL) / 2;
const spireR = (innermost - SPIRE.gap) * SCALE;
if (spireR > 32) Disc(spireR, SPIRE.sides, 0, z + SPIRE.above, "edge", "wall");
const baseR = Math.round((SPIRAL.radius + START.width / 2 + BASE.margin) * SCALE);
Disc(baseR, BASE.sides, -BASE.thickness, 0, "base");
notes.push(`melon_respawn trigger over the whole catch floor: ${fmt([-baseR, -baseR, 0])} .. ${fmt([baseR, baseR, 96])}`);

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(mesh, NAME, materials));
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
const turns = AngleAt(endS) / (2 * Math.PI);
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles; ${(endS * SCALE).toFixed(0)} along the course, ${turns.toFixed(2)} turns, radius ${SPIRAL.radius * SCALE} -> `
    + `${(RadiusAt(AngleAt(endS)) * SCALE).toFixed(0)}; start deck ${START.z} up, summit ${z} up (+${z - START.z}); spire radius ${spireR.toFixed(0)}, `
    + `catch floor radius ${baseR}; ${supports} supports`);
console.log("place in Hammer (world positions relative to where the .dmx's origin lands; yaw = the course's direction there):");
for (const note of notes) console.log(`  ${note}`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the catch floor in the spiral's middle)`);
