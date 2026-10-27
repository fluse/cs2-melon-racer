// Builds the lighthouse parkour race track as mesh geometry for Hammer —
// `node tools/models/make-parkour-model.mjs [section]`: a rock in the sea with
// a lighthouse on top. The course starts on a harbor quay at sea level, jumps
// from ship to ship across the harbor bay, climbs the rock counter-clockwise
// (seen from above) twice round on paths cut into its flank — a gorge
// crossed by wall jumps, boulders, rock steps, a crevice — onto the plateau,
// and winds up a ramp round the lighthouse, over gaps, to the finish on its gallery.
//
// One .dmx per section, so a change re-imports only that part — every file
// has the same origin (the lighthouse's middle, at sea level z 0): import each
// at the same spot.
//   models/melon_racer/parkour/parkour_01_harbor.dmx    quay (start), harbor moles, warehouse
//   models/melon_racer/parkour/parkour_02_ships.dmx     fishing boat, tug, freighter (containers), barge
//   models/melon_racer/parkour/parkour_03_cliff_path.dmx rock ledge, cliff path 1, the gorge (wall jumps), its landing
//   models/melon_racer/parkour/parkour_04_cliff_climb.dmx cliff path 2 (boulders), rock steps
//   models/melon_racer/parkour/parkour_05_cliff_summit.dmx the second turn: cliff paths 3 + 4 (a crevice between), 5 (boulders), the plateau
//   models/melon_racer/parkour/parkour_06_lighthouse.dmx tower, the ramp round it, gallery (finish), lantern
//   models/melon_racer/parkour/parkour_07_rock.dmx       the rock's core (its top the plateau), the rocks round its foot
//   models/melon_racer/parkour/parkour_08_seabed.dmx     the sea floor under it all
//   materials/melon_racer/parkour/parkour_<part>.vmat (+ _color.png)
// `node … ships` writes only that section (and the materials). The course is
// laid out in one go, so a section's length shifts every section after it.
//
// Laid out along the course (s along it, t across it — positive outwards, to
// the right of the direction of travel on the spiral — z up), in world units.
// Every solid is a shell of its own (Mesh.NewShell): they touch and overlap.
// Curved solids are cut into straight pieces of at most stepDegrees.
import { Circle, DmxText, Mesh, SeededRandom, SolidPng, V3, VmatText, WriteAddonFile } from "../lib/model.mjs";

// --- Jump physics (src/melon_drive): a ground jump rises ~85 and flies ~600
// at MAX_SPEED (JUMP_SPEED 370, GRAVITY 800, MAX_SPEED 650); over a gap with
// +64 up it still reaches ~450 — so gaps up to 192 there are sure jumps ---
const SEABED = -128; // water from here up to z 0 (a func_water, placed in Hammer)
let stepDegrees = 4; // curved solids in straight pieces of at most this (the lighthouse ramp: coarser, it turns tightly)
const LIP = { height: 40, thickness: 24, piece: 128 }; // the rock lip along a path's outer edge: a wall melons bounce off
const RAIL = { height: 40, thickness: 16 }; // the lighthouse ramp's and the ships' railings

// --- The course: [kind, length, z at its start, z at its end, width, section] ---
const segments = [];
const Add = (kind, length, z0, z1, width, section, extra = {}) => segments.push({ kind, length, z0, z1, width, section, ...extra });
// 1. Harbor: the quay, then ship to ship, each a little higher.
Add("quay", 640, 96, 96, 512, "harbor");
Add("gap", 160, 96, 128, 0, "ships");
Add("ship", 320, 128, 128, 224, "ships", { ship: "cutter" });
Add("gap", 176, 128, 160, 0, "ships");
Add("ship", 384, 160, 160, 256, "ships", { ship: "tug" });
Add("gap", 192, 160, 224, 0, "ships");
Add("ship", 896, 224, 224, 320, "ships", { ship: "freighter" });
Add("gap", 192, 224, 256, 0, "ships");
Add("ship", 384, 256, 256, 320, "ships", { ship: "barge" });
Add("gap", 160, 256, 288, 0, "ships");
// 2. The rock: paths up its flank, twice round it, ~5 degrees — each turn
// runs inside and above the one before, whose inner wall it is.
Add("path", 384, 288, 288, 384, "cliff_path", { name: "ledge" });
Add("path", 2000, 288, 448, 384, "cliff_path", { name: "path1" });
Add("gorge", 768, 448, 384, 224, "cliff_path"); // longer than a plain jump reaches (~740 with the drop): wall jumps
Add("path", 384, 384, 384, 384, "cliff_path", { name: "landing" });
Add("path", 2400, 384, 624, 384, "cliff_climb", { name: "path2", boulders: [480, 1200, 1920] });
let z = 624;
for (let i = 0; i < 4; i++) { // rock steps, +64 each
    Add("gap", 96, z, z + 64, 0, "cliff_climb");
    z += 64;
    Add("path", 256, z, z, 320, "cliff_climb", { name: `step${i + 1}` });
}
Add("path", 1800, z, z + 160, 384, "cliff_summit", { name: "path3" });
z += 160;
Add("gap", 192, z, z, 0, "cliff_summit"); // a crevice: a jump on the level
Add("path", 1800, z, z + 160, 384, "cliff_summit", { name: "path4" });
z += 160;
Add("path", 2000, z, z + 180, 384, "cliff_summit", { name: "path5", boulders: [480, 1100, 1600] });
z += 180;
Add("path", 512, z, z, 512, "cliff_summit", { name: "plateau" });
const PLATEAU_Z = z;
// 3. The lighthouse: a ramp round it, its inner edge on the tower.
const TOWER = { r0: 256, r1: 176, sides: 24, bands: 11 }; // radius at its foot / top, red and white bands
const RAMP = { width: 224, slab: 24, turns: 4, slope: 0.22 }; // ~430 up per turn
// Gaps in the ramp (where along it, 0..1, and how long): uphill jumps of
// +30..40 that get longer the higher they are; a miss drops onto the turn below.
const RAMP_GAPS = [{ at: 0.3, length: 128 }, { at: 0.5, length: 144 }, { at: 0.7, length: 160 }, { at: 0.86, length: 176 }];
const RampMiddle = r => r + RAMP.width / 2;
const HELIX_ANGLE = 2 * Math.PI * RAMP.turns;
const HELIX_LENGTH = HELIX_ANGLE * (RampMiddle(TOWER.r0) + RampMiddle(TOWER.r1)) / 2;
const GALLERY_Z = Math.round(PLATEAU_Z + HELIX_LENGTH * RAMP.slope);
Add("ramp", HELIX_LENGTH, PLATEAU_Z, GALLERY_Z, RAMP.width, "lighthouse");
const GALLERY = { radius: 416, slab: 24, rail: 48 };
const LANTERN = { radius: 128, height: 240, roof: 160 };

let total = 0;
for (const g of segments) { g.s0 = total; total += g.length; g.s1 = total; }
const First = section => segments.find(g => g.section === section);
const ROCK_S = First("cliff_path").s0, HELIX_S = First("lighthouse").s0;
const Segment = name => segments.find(g => g.name === name);
/** The course's height at s: along each segment from its z0 to its z1. */
function ZAt(s) {
    const g = segments.find(g => s >= g.s0 && s <= g.s1) ?? (s < 0 ? segments[0] : segments.at(-1));
    return g.z0 + ((g.z1 - g.z0) * (Math.min(Math.max(s, g.s0), g.s1) - g.s0)) / g.length;
}

// --- The course's middle line: the harbor straight north along x = SPIRAL.r0,
// then a spiral round the rock (radius SPIRAL.r0 -> SPIRAL.r1), then the helix round the tower ---
const SPIRAL = { r0: 1600, r1: 760 };
const CORE = { radius: 640, jag: 48, sides: 28, tiers: [160, 360, 560, 760, 960, 1160], flare: 0.5 }; // the rock's core: tiers ending at these heights, wider by flare per unit lower; the top one is the plateau
const rockLength = HELIX_S - ROCK_S;
function SpiralTable(k) { // [length, angle] along r(a) = r0 - k a
    const rows = [[0, 0]];
    for (let a = 0, s = 0, da = 0.0005; s < rockLength + 50; a += da) { s += Math.hypot(SPIRAL.r0 - k * (a + da / 2), k) * da; rows.push([s, a + da]); }
    return rows;
}
const AngleIn = (rows, s) => {
    let lo = 0, hi = rows.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rows[mid][0] <= s) lo = mid; else hi = mid; }
    const f = (s - rows[lo][0]) / (rows[hi][0] - rows[lo][0] || 1);
    return rows[lo][1] + f * (rows[hi][1] - rows[lo][1]);
};
let k = 100, spiral; // the shrink per radian, so the spiral ends at SPIRAL.r1
for (let i = 0; i < 60; i++) { spiral = SpiralTable(k); k *= SPIRAL.r0 - k * AngleIn(spiral, rockLength) > SPIRAL.r1 ? 1.02 : 0.99; }
const SPIRAL_END = AngleIn(spiral, rockLength);
const SHRINK_PER_TURN = 2 * Math.PI * k, WIDEST = Math.max(...segments.filter(g => g.section.startsWith("cliff") && g.name !== "plateau").map(g => g.width)); // the plateau is innermost, nothing inside it
if (SHRINK_PER_TURN < WIDEST + 2 * LIP.thickness) throw new Error(`the rock's turns overlap: ${SHRINK_PER_TURN.toFixed(0)} in per turn, the widest path ${WIDEST}: raise SPIRAL.r0 or lower SPIRAL.r1`);
const SpiralRadius = a => SPIRAL.r0 - k * Math.min(a, SPIRAL_END);
const HELIX_START = SPIRAL_END + 0.5; // the ramp starts a bit on from where the plateau ends, across the core's top
const TowerRadius = zz => TOWER.r0 + ((TOWER.r1 - TOWER.r0) * (zz - PLATEAU_Z)) / (GALLERY_Z - PLATEAU_Z);

/** Course coordinates to the world: s along, t across (outwards), z up. */
function P(s, t, zz) {
    if (s < ROCK_S) return [SPIRAL.r0 + t, s - ROCK_S, zz];
    if (s < HELIX_S) { const a = AngleIn(spiral, s - ROCK_S), r = SpiralRadius(a) + t; return [r * Math.cos(a), r * Math.sin(a), zz]; }
    const a = HELIX_START + (HELIX_ANGLE * (s - HELIX_S)) / HELIX_LENGTH, r = RampMiddle(TowerRadius(ZAt(s))) + t;
    return [r * Math.cos(a), r * Math.sin(a), zz];
}
/** The course's direction at s, measured within its own part (harbor, spiral, helix), so one part's change doesn't reach into the next. */
function Forward(s) {
    const ends = [ROCK_S, HELIX_S].filter(e => e > s), end = ends.length ? ends[0] : Infinity, start = [ROCK_S, HELIX_S].filter(e => e <= s).at(-1) ?? -Infinity;
    const a = Math.max(s - 0.5, start), b = Math.min(s + 0.5, end - 1e-3);
    return V3.Unit(V3.Sub(P(b, 0, 0), P(a, 0, 0)));
}
const Heading = s => Math.atan2(Forward(s)[1], Forward(s)[0]);

// --- Mesh helpers (on the section being built) ---
let mesh;
const Num = (v, s) => (typeof v === "function" ? v(s) : v);
/** A flat quad facing `out`, UVs projected from the world (top/bottom on X/Y, sides along their own width and Z). */
function Quad(points, out, part) {
    let n = V3.Unit(V3.Cross(V3.Sub(points[1], points[0]), V3.Sub(points[2], points[0])));
    if (V3.Dot(n, out) < 0) { points = [...points].reverse(); n = V3.Scale(n, -1); }
    const across = Math.abs(n[2]) > 0.7 ? null : V3.Unit(V3.Cross([0, 0, 1], n));
    mesh.Face(points, points.map(p => (across ? [V3.Dot(p, across) / 128, p[2] / 128] : [p[0] / 128, p[1] / 128])), part);
}
/**
 * A solid following the course, a shell of its own: s0..s1 along, t0..t1
 * across, from zBottom to zTop (numbers, or functions of s for slopes); its
 * top `topPart`. Cut into pieces wherever the course turns.
 */
function Block(s0, s1, t0, t1, zBottom, zTop, part, topPart = part) {
    [s0, s1] = [Math.min(s0, s1), Math.max(s0, s1)];
    [t0, t1] = [Math.min(t0, t1), Math.max(t0, t1)];
    let turn = 0;
    for (let i = 0; i < 16; i++) {
        let d = Heading(s0 + ((s1 - s0) * (i + 1)) / 16) - Heading(s0 + ((s1 - s0) * i) / 16);
        d = Math.atan2(Math.sin(d), Math.cos(d));
        turn += Math.abs(d);
    }
    const sloped = typeof zTop === "function" || typeof zBottom === "function";
    const n = Math.max(1, Math.ceil((turn * 180) / Math.PI / stepDegrees), sloped ? Math.ceil((s1 - s0) / 256) : 1);
    const ss = Array.from({ length: n + 1 }, (_, i) => s0 + ((s1 - s0) * i) / n);
    mesh.NewShell();
    for (let i = 0; i < n; i++) {
        const a = ss[i], b = ss[i + 1], ba = Num(zBottom, a), bb = Num(zBottom, b), ta = Num(zTop, a), tb = Num(zTop, b);
        const out = V3.Unit(V3.Sub(P((a + b) / 2, 1, 0), P((a + b) / 2, 0, 0)));
        Quad([P(a, t0, ta), P(b, t0, tb), P(b, t1, tb), P(a, t1, ta)], [0, 0, 1], topPart);
        Quad([P(a, t0, ba), P(b, t0, bb), P(b, t1, bb), P(a, t1, ba)], [0, 0, -1], part);
        Quad([P(a, t1, ba), P(b, t1, bb), P(b, t1, tb), P(a, t1, ta)], out, part);
        Quad([P(a, t0, ba), P(b, t0, bb), P(b, t0, tb), P(a, t0, ta)], V3.Scale(out, -1), part);
    }
    Quad([P(s0, t0, Num(zBottom, s0)), P(s0, t1, Num(zBottom, s0)), P(s0, t1, Num(zTop, s0)), P(s0, t0, Num(zTop, s0))], V3.Scale(Forward(s0), -1), part);
    Quad([P(s1, t0, Num(zBottom, s1)), P(s1, t1, Num(zBottom, s1)), P(s1, t1, Num(zTop, s1)), P(s1, t0, Num(zTop, s1))], Forward(s1), part);
}
const CounterClockwise = pts => (pts.reduce((sum, p, i) => sum + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) < 0 ? [...pts].reverse() : pts);
/** A prism of a world-space outline (x, y points) from z0 to z1, a shell of its own. */
function Prism(outline, z0, z1, part, topPart = part) {
    mesh.NewShell();
    mesh.Extrude([{ outer: CounterClockwise(outline), holes: [] }], z0, z1, part, "z", topPart);
}
const Cylinder = (x, y, r, sides, z0, z1, part, topPart = part) => Prism(Circle(x, y, r, sides), z0, z1, part, topPart);
/** A frustum round the vertical axis through (x, y): radius r0 at z0 to r1 at z1, closed. */
function Frustum(x, y, r0, r1, z0, z1, sides, part) {
    mesh.NewShell();
    mesh.Tube([[x, y, z0], [x, y, z1]], i => (i === 0 ? r0 : r1), sides, part, true, { slopedNormals: true });
}
/** Rock pieces along s0..s1 (each `piece` long): t0..t1 across, from zBottom up to the course height + rand(lo..hi) — a rough top. */
function RockPieces(random, s0, s1, piece, t0, t1, zBottom, lo, hi, part = "rock") {
    const n = Math.max(1, Math.round((s1 - s0) / piece));
    for (let i = 0; i < n; i++) {
        const a = s0 + ((s1 - s0) * i) / n, b = s0 + ((s1 - s0) * (i + 1)) / n;
        const top = Math.max(ZAt(a), ZAt(b)) + lo + (hi - lo) * random();
        Block(a, b, Num(t0, a), Num(t1, a), zBottom, top, part);
    }
}

// --- What to place in Hammer, printed at the end ---
const notes = [];
const fmt = p => p.map(n => Math.round(n)).join(" ");
const Yaw = s => Math.round((Heading(s) * 180) / Math.PI);
const NoteBox = (what, s, length, width, height) => notes.push(`${what}: center ${fmt(P(s, 0, ZAt(s) + height / 2))}, yaw ${Yaw(s)}, size ${length} along x ${width} across x ${height} high`);
const NoteAt = (what, s) => notes.push(`${what}: at ${fmt(P(s, 0, ZAt(s)))}, yaw ${Yaw(s)}`);

// ============================== Sections ==============================

function Harbor() {
    const g = First("harbor"), top = g.z0, half = 576;
    Block(g.s0 - 256, g.s1, -half, half, SEABED, top, "quay", "paving"); // the quay, the start lane in its middle
    Block(g.s0 - 256, g.s0 - 224, -half, half, top, top + 128, "quay"); // the wall behind the start
    for (const t of [-512, -320, 320, 512]) { const [x, y] = P(g.s1 - 20, t, 0); Cylinder(x, y, 12, 8, top, top + 24, "edge"); } // bollards on the front edge
    // A warehouse on the quay, off the lane: brick walls, a red roof.
    Block(g.s0 - 192, g.s0 + 320, -half + 32, -320, top, top + 192, "brick");
    Block(g.s0 - 208, g.s0 + 336, -half + 16, -304, top + 192, top + 216, "red");
    // The harbor moles: two low stone walls along the bay, out to the rock.
    for (const side of [-1, 1]) Block(g.s1, ROCK_S - 600, side * 640, side * 768, SEABED, 64, "quay", "paving");
    NoteAt("start gate prefab (start_<trackId>), facing along the course", g.s1 - 96);
    NoteAt("start_spawn_<trackId>", g.s1 - 320);
}

// --- Ship parts. The deck and everything on it that the course runs past
// (bulwarks, deckhouses, containers, hurdles) keep their footprint; the
// details sit outside the lanes, on the hull's sides or high above the deck. ---
const HULL = { keel: SEABED / 2, bootTop: 10, sheer: 14 }; // the keel's depth, the dark band over the waterline, the stripe under the deck edge
const BOW_STATIONS = [0, 0.3, 0.55, 0.75, 0.9, 1]; // cross-sections along the bow, 0 where it starts narrowing
/**
 * A ship's hull lofted from cross-sections at five heights — keel, waterline,
 * boot top, the stripe's lower edge, deck — flared (narrower lower down), the
 * stem raked back and the transom narrowing below the deck. The deck is the
 * course's: square stern at s0, full width, the bow narrowing to half the
 * width at s1. Bands: antifouling under water, a graphite boot top, `hull`,
 * a `stripe` under the deck edge. Returns HalfAt(s, z), the hull's half width there.
 */
function Hull(g, hull, stripe, deckPart) {
    const half = g.width / 2, deck = g.z0, bow = Math.min(160, g.length / 3);
    const water = { z: 0, k: 0.86, sternK: 0.92, stern: 12, tip: bow * 0.4, tipHalf: 4 };
    const top = { z: deck, k: 1, sternK: 1, stern: 0, tip: 0, tipHalf: half / 2 };
    const Between = zz => Object.fromEntries(Object.keys(top).map(key => [key, water[key] + ((top[key] - water[key]) * zz) / deck]));
    const keel = { z: HULL.keel, k: 0.5, sternK: 0.7, stern: 32, tip: bow * 0.8, tipHalf: 3 };
    const levels = [keel, water, Between(HULL.bootTop), Between(deck - HULL.sheer), top];
    const bands = ["antifouling", "edge", hull, stripe];
    const aft = g.s0 + Math.min(96, g.length * 0.2); // where the transom's narrowing ends
    /** [s, half width] of a level at a station: "stern", "aft" or a fraction along the bow. */
    const Station = (L, station) => {
        if (station === "stern") return [g.s0 + L.stern, L.k * L.sternK * half];
        if (station === "aft") return [aft, L.k * half];
        const s0 = g.s1 - bow - L.tip * 0.6, s1 = g.s1 - L.tip;
        return [s0 + station * (s1 - s0), L.k * half + (L.tipHalf - L.k * half) * station ** 1.6];
    };
    const stations = ["stern", "aft", ...BOW_STATIONS];
    const pts = stations.map(station => levels.map(L => { const [s, w] = Station(L, station); return [-1, 1].map(side => P(s, side * w, L.z)); }));
    mesh.NewShell();
    for (let i = 0; i + 1 < stations.length; i++) {
        for (let l = 0; l + 1 < levels.length; l++) {
            for (const [k, side] of [[0, -1], [1, 1]]) { // the sides in triangles: along the bow a quad isn't flat
                const a = pts[i][l][k], b = pts[i + 1][l][k], c = pts[i + 1][l + 1][k], d = pts[i][l + 1][k];
                Quad([a, b, c], [side, 0, 0], bands[l]);
                Quad([a, c, d], [side, 0, 0], bands[l]);
            }
        }
        Quad([pts[i][0][0], pts[i + 1][0][0], pts[i + 1][0][1], pts[i][0][1]], [0, 0, -1], "antifouling");
        Quad([pts[i][4][0], pts[i + 1][4][0], pts[i + 1][4][1], pts[i][4][1]], [0, 0, 1], deckPart);
    }
    for (const [i, out] of [[0, [0, -1, 0]], [stations.length - 1, [0, 1, 0]]]) { // the transom, the stem
        for (let l = 0; l + 1 < levels.length; l++) Quad([pts[i][l][0], pts[i][l][1], pts[i][l + 1][1], pts[i][l + 1][0]], out, bands[l]);
    }
    return (s, zz) => {
        const L = zz >= 0 ? Between(Math.min(zz, deck)) : keel;
        const [sStern, wStern] = Station(L, "stern"), [sAft, wAft] = Station(L, "aft"), [sBow] = Station(L, 0), [sTip] = Station(L, 1);
        if (s < sAft) return wStern + ((wAft - wStern) * (s - sStern)) / (sAft - sStern);
        return s < sBow ? wAft : Station(L, Math.min(1, (s - sBow) / (sTip - sBow)))[1];
    };
}
/** A straight bar from a to b (course coordinates [s, t, z]), `sides` round (4: square), a shell of its own. */
function Beam(a, b, r, part, sides = 4) {
    mesh.NewShell();
    mesh.Tube([P(...a), P(...b)], r, sides, part);
}
/** A ring facing out of a ship's side (side ±1) — a lifebuoy, a tire fender: centered at s, z, from t `thick` outwards. */
function SideRing(s, t, z, side, r, hole, thick, part, sides = 6) {
    const [x0, y] = P(s, t, 0), x1 = x0 + side * thick;
    mesh.NewShell();
    mesh.Extrude([{ outer: CounterClockwise(Circle(y, z, r, sides)), holes: [CounterClockwise(Circle(y, z, hole, sides)).reverse()] }], Math.min(x0, x1), Math.max(x0, x1), part, "x");
}
/** A deckhouse: walls up to the windows, a band of glass set in between corner posts, walls again, a roof slab overhanging by `eave`. */
function Deckhouse(s0, s1, t0, t1, z0, [w0, w1], top, wall, roof, eave = 4) {
    Block(s0, s1, t0, t1, z0, w0, wall);
    Block(s0 + 3, s1 - 3, t0 + 3, t1 - 3, w0, w1, "glass");
    for (const s of [s0, s1 - 6]) for (const t of [t0, t1 - 6]) Block(s, s + 6, t, t + 6, w0, w1, wall);
    if (top - 8 > w1) Block(s0, s1, t0, t1, w1, top - 8, wall);
    Block(s0 - eave, s1 + eave, t0 - eave, t1 + eave, top - 8, top, roof);
}
/** A mast from z0 to z1 at (s, t): a pole, a yard across it near the top (0: none), a light on its tip. */
function Mast(s, t, z0, z1, part, yard = 32) {
    Beam([s, t, z0], [s, t, z1], 3, part, 6);
    if (yard) Beam([s, t - yard, z1 - 36], [s, t + yard, z1 - 36], 2, part);
    Block(s - 4, s + 4, t - 4, t + 4, z1, z1 + 8, "lantern");
}
/** A radar on a short post at (s, t, z): a flat bar across the ship. */
function Radar(s, t, z, length = 40) {
    Beam([s, t, z], [s, t, z + 12], 2, "edge");
    Block(s - 3, s + 3, t - length / 2, t + length / 2, z + 12, z + 16, "edge", "white");
}
/** Navigation lights on a deckhouse's sides at s, z: red to port (t0, left of the way on), green to starboard. */
function SideLights(s, t0, t1, zz) {
    Block(s - 4, s + 4, t0 - 4, t0, zz, zz + 6, "red");
    Block(s - 4, s + 4, t1, t1 + 4, zz, zz + 6, "green");
}

function Ships() {
    const random = SeededRandom(2);
    for (const g of segments.filter(g => g.kind === "ship")) {
        const half = g.width / 2, deck = g.z0, bow = Math.min(160, g.length / 3), inner = half - RAIL.thickness;
        const at = f => g.s0 + g.length * f;
        const [hull, stripe, deckPart, bulwark] = {
            cutter: ["red", "white", "wood", "white"], tug: ["navy", "white", "wood", "white"],
            freighter: ["hull", "white", "steel", "hull"], barge: ["hull", "red", "steel", "red"],
        }[g.ship];
        const HalfAt = Hull(g, hull, stripe, deckPart);
        // Bulwarks along the sides only: the stern and the bow stay open to jump on and off.
        for (const side of [-1, 1]) Block(g.s0 + 32, g.s1 - bow, side * half, side * inner, deck, deck + 32, bulwark);
        const Strake = (zz, part) => { for (const side of [-1, 1]) Block(at(0.04), g.s1 - bow, side * (HalfAt(at(0.5), zz) - 6), side * (HalfAt(at(0.5), zz) + 5), zz - 4, zz + 4, part); };
        const Tires = (fs, zz) => { for (const f of fs) for (const side of [-1, 1]) SideRing(at(f), side * (HalfAt(at(f), zz) - 2), zz, side, 12, 6, 9, "tire"); };
        if (g.ship === "cutter") {
            // The wheelhouse off to one side (the lane beside it), a mast and a derrick on it.
            Deckhouse(at(0.3), at(0.65), 40, inner, deck, [deck + 40, deck + 62], deck + 72, "white", "red", 4);
            Mast(at(0.5), 76, deck + 72, deck + 260, "white", 36);
            Radar(at(0.4), 64, deck + 72, 32);
            SideLights(at(0.62), 40, inner, deck + 50);
            Beam([at(0.5), 70, deck + 96], [at(0.12), 80, deck + 180], 3, "orange"); // the derrick, over the aft deck
            Beam([at(0.12), 80, deck + 180], [at(0.12), 80, deck + 110], 0.8, "edge", 3);
            Block(at(0.12) - 4, at(0.12) + 4, 76, 84, deck + 100, deck + 110, "edge");
            // A gantry over the open stern, the trawl doors hanging off it on both sides.
            for (const side of [-1, 1]) {
                Beam([g.s0 + 14, side * (half - 8), deck], [g.s0 + 14, side * (half - 22), deck + 150], 4, "orange");
                Block(g.s0 + 4, g.s0 + 28, side * (HalfAt(g.s0 + 16, deck - 30) + 2), side * (HalfAt(g.s0 + 16, deck - 30) + 7), deck - 58, deck - 6, "steel");
            }
            Beam([g.s0 + 14, -(half - 22), deck + 150], [g.s0 + 14, half - 22, deck + 150], 5, "orange");
            // Fish crates behind the wheelhouse, a lifebuoy on its wall to the lane.
            Block(at(0.65), at(0.65) + 28, 52, 84, deck, deck + 16, "blue");
            Block(at(0.65) + 2, at(0.65) + 26, 56, 80, deck + 16, deck + 30, "orange");
            SideRing(at(0.47), 40, deck + 26, -1, 10, 6, 3, "orange", 8);
            Strake(deck - 26, "white");
        } else if (g.ship === "tug") {
            // The deckhouse in the middle (pass it on either side), a tall wheelhouse on it, a funnel behind it.
            Deckhouse(at(0.35), at(0.7), -48, 48, deck, [deck + 54, deck + 78], deck + 96, "white", "edge", 3);
            Deckhouse(at(0.48), at(0.68), -36, 36, deck + 96, [deck + 104, deck + 126], deck + 136, "white", "edge", 6);
            SideLights(at(0.64), -36, 36, deck + 112);
            Mast(at(0.58), 0, deck + 136, deck + 240, "white", 30);
            Radar(at(0.53), 0, deck + 136, 44);
            Block(at(0.67) - 6, at(0.67), -8, 8, deck + 136, deck + 146, "lantern"); // a searchlight looking forward
            for (const side of [-1, 1]) SideRing(at(0.5), side * 48, deck + 30, side, 10, 6, 3, "orange", 8);
            const funnel = Array.from({ length: 10 }, (_, i) => { const a = (2 * Math.PI * i) / 10; return P(at(0.28) + 26 * Math.cos(a), 20 * Math.sin(a), 0).slice(0, 2); });
            Prism(funnel, deck, deck + 104, "red");
            Prism(funnel, deck + 104, deck + 118, "white");
            Prism(funnel, deck + 118, deck + 150, "tire");
            // The towing arch over the aft deck, tire fenders all round the hull.
            for (const side of [-1, 1]) Beam([at(0.16), side * (half - 8), deck + 32], [at(0.16), side * (half - 28), deck + 140], 4, "white");
            Beam([at(0.16), -(half - 28), deck + 140], [at(0.16), half - 28, deck + 140], 5, "white");
            Tires([0.16, 0.34, 0.52, 0.66], deck - 36);
            Block(g.s1 - 6, g.s1 + 14, -40, 40, deck - 46, deck - 6, "tire"); // the push fender on the stem
            Block(g.s0 - 12, g.s0 + 8, -(half - 24), half - 24, deck - 40, deck - 8, "tire");
        } else if (g.ship === "freighter") {
            // Containers stacked from alternating sides: chicanes — two across, two high, colors at random.
            const colors = ["blue", "orange", "green", "red", "white", "navy"], lane = 112;
            [224, 432, 640].forEach((s, i) => {
                const side = i % 2 ? 1 : -1, t0 = side * inner, t1 = side * (lane - inner), middle = (t0 + t1) / 2;
                for (const z0 of [deck, deck + 64]) for (const [a, b] of [[t0, middle], [middle, t1]]) {
                    Block(g.s0 + s, g.s0 + s + 96, a, b, z0, z0 + 64, colors[Math.floor(random() * colors.length)]);
                }
            });
            // Two gantry cranes between the stacks, on the bulwarks, the trolley's hook high over the lane.
            for (const s of [g.s0 + 376, g.s0 + 584]) {
                for (const side of [-1, 1]) for (const ds of [-40, 40]) Beam([s + ds, side * (half - 8), deck + 32], [s + ds / 4, side * (half - 12), deck + 256], 4, "yellow");
                Block(s - 14, s + 14, -(half + 4), half + 4, deck + 256, deck + 274, "yellow");
                Block(s - 14, s + 14, half - 44, half - 12, deck + 220, deck + 256, "white"); // the crane driver's cab
                Block(s - 15, s + 15, half - 40, half - 16, deck + 228, deck + 244, "glass");
                const trolley = (random() - 0.5) * 120;
                Block(s - 12, s + 12, trolley - 16, trolley + 16, deck + 274, deck + 286, "edge");
                Beam([s, trolley, deck + 256], [s, trolley, deck + 176], 0.8, "edge", 3);
                Block(s - 6, s + 6, trolley - 10, trolley + 10, deck + 164, deck + 176, "yellow");
            }
            // A bulbous bow under the water, the anchors in their hawses on both sides of the bow.
            mesh.NewShell();
            mesh.Tube([[g.s1 - 150, 0, -42], [g.s1 - 96, 0, -40], [g.s1 - 52, 0, -36], [g.s1 - 26, 0, -34], [g.s1 - 12, 0, -34]].map(p => P(...p)), i => [12, 22, 22, 16, 1][i], 8, "antifouling", true, { slopedNormals: true });
            for (const side of [-1, 1]) {
                const s = g.s1 - bow + 36, w = HalfAt(s, deck - 40);
                Block(s - 12, s + 12, side * (w - 4), side * (w + 2), deck - 50, deck - 26, "edge");
                Block(s - 3, s + 3, side * (w - 2), side * (w + 5), deck - 96, deck - 38, "steel");
                Block(s - 16, s + 16, side * (w - 2), side * (w + 5), deck - 104, deck - 96, "steel");
            }
            for (const f of [0.08, 0.72]) for (const side of [-1, 1]) SideRing(at(f), side * half, deck + 16, side, 10, 6, 3, "orange", 8);
            Strake(deck - 40, "white");
        } else if (g.ship === "barge") {
            // Two hatch coamings across the deck — hurdles — their covers green.
            for (const f of [0.3, 0.62]) Block(at(f), at(f) + 32, -inner, inner, deck, deck + 32, "edge", "green");
            // Bollards by the bulwarks, a light mast on the stern, tires on the sides.
            for (const s of [g.s0 + 48, g.s1 - bow - 24]) for (const side of [-1, 1]) {
                for (const ds of [-9, 9]) { const [x, y] = P(s + ds, side * (inner - 10), 0); Cylinder(x, y, 5, 6, deck, deck + 18, "tire"); }
            }
            Mast(g.s0 + 40, -(half - 8), deck + 32, deck + 170, "white", 0);
            Tires([0.2, 0.46, 0.7], deck - 30);
            Strake(deck - 50, "edge");
        }
    }
}

/** A rock path: solid from the sea floor up to the course, a rough rock wall on its inner side up to the core, a lip on its outer edge. */
function RockPath(random, g, { innerWall = true, lip = true } = {}) {
    const half = g.width / 2;
    Block(g.s0, g.s1, -half, half, SEABED, ZAt, "rock", "floor");
    if (innerWall) RockPieces(random, g.s0, g.s1, 192, s => -(SpiralRadius(AngleIn(spiral, s - ROCK_S)) - CORE.radius + 16), -half, SEABED, 160, 320);
    if (lip) RockPieces(random, g.s0, g.s1, LIP.piece, half - LIP.thickness, half, s => ZAt(s) - 8, LIP.height, LIP.height + 16);
}

/** Boulders on a path from alternating sides (g.boulders: where along it), each leaving 144 free at the other edge. */
function Boulders(random, g) {
    for (const [i, at] of g.boulders.entries()) {
        const side = i % 2 ? 1 : -1, s = g.s0 + at, edge = g.width / 2;
        RockPieces(random, s, s + 96, 96, side * edge, side * (edge - (g.width - 144)), s0 => ZAt(s0) - 8, 72, 112, "rock");
    }
}

function CliffPath() {
    const random = SeededRandom(3);
    for (const name of ["ledge", "path1", "landing"]) RockPath(random, Segment(name));
    // The gorge: no floor, a rock wall on both sides — the course 224 wide between them, reaching onto the paths before and after.
    const g = segments.find(g => g.kind === "gorge"), overlap = 160, half = g.width / 2;
    RockPieces(random, g.s0, g.s1, 192, s => -(SpiralRadius(AngleIn(spiral, s - ROCK_S)) - CORE.radius + 16), -half, SEABED, 192, 320);
    for (const side of [-1, 1]) Block(g.s0 - overlap, g.s1 + overlap, side * half, side * (half + 64), SEABED, Math.max(g.z0, g.z1) + 320, "cliff");
    NoteAt("checkpoint 1 (checkpoint gate prefab)", Segment("ledge").s0 + 192);
    NoteAt("checkpoint 2", Segment("landing").s0 + 224);
}

function CliffClimb() {
    const random = SeededRandom(4);
    const path2 = Segment("path2");
    RockPath(random, path2);
    Boulders(random, path2);
    const steps = segments.filter(g => g.name?.startsWith("step"));
    for (const g of steps) RockPath(random, g, { innerWall: false });
    // One rough wall along the steps' inner side, over the gaps too.
    RockPieces(random, steps[0].s0 - 96, steps.at(-1).s1, 192, s => -(SpiralRadius(AngleIn(spiral, s - ROCK_S)) - CORE.radius + 16), -steps[0].width / 2, SEABED, 192, 320);
    NoteAt("checkpoint 3", Segment("step1").s0 + 128);
}

function CliffSummit() {
    const random = SeededRandom(5);
    for (const name of ["path3", "path4"]) RockPath(random, Segment(name)); // the crevice between them stays open
    const path5 = Segment("path5");
    RockPath(random, path5);
    Boulders(random, path5);
    RockPath(random, Segment("plateau"), { innerWall: false }); // opens onto the core's top
    NoteAt("checkpoint 4", Segment("path3").s0 + 224);
    NoteAt("checkpoint 5", Segment("path5").s0 + 224);
    NoteAt("checkpoint 6", Segment("plateau").s0 + 256);
}

function Lighthouse() {
    const g = First("lighthouse");
    stepDegrees = 8; // ~45-unit pieces round the tower
    // The tower: red and white bands from the plateau up to the gallery.
    for (let i = 0; i < TOWER.bands; i++) {
        const z0 = PLATEAU_Z + ((GALLERY_Z - PLATEAU_Z) * i) / TOWER.bands, z1 = PLATEAU_Z + ((GALLERY_Z - PLATEAU_Z) * (i + 1)) / TOWER.bands;
        Frustum(0, 0, TowerRadius(z0), TowerRadius(z1), i === 0 ? PLATEAU_Z - 16 : z0, z1, TOWER.sides, i % 2 ? "red" : "white");
    }
    // The ramp round it, its inner edge on the tower, a railing on its outer edge — in pieces between its gaps.
    const cuts = RAMP_GAPS.map(gap => [g.s0 + g.length * gap.at, g.s0 + g.length * gap.at + gap.length]);
    const pieces = [g.s0, ...cuts.flat(), g.s1].reduce((list, s, i, all) => (i % 2 ? [...list, [all[i - 1], s]] : list), []);
    for (const [a, b] of pieces) {
        Block(a, b, -RAMP.width / 2, RAMP.width / 2, s => ZAt(s) - RAMP.slab, ZAt, "edge", "floor");
        Block(a === g.s0 ? a + 64 : a, b, RAMP.width / 2 - RAIL.thickness, RAMP.width / 2, ZAt, s => ZAt(s) + RAIL.height, "white");
    }
    // The gallery: a round deck over the tower's top with a railing round it — the finish.
    Cylinder(0, 0, GALLERY.radius, 32, GALLERY_Z - GALLERY.slab, GALLERY_Z, "edge", "floor");
    mesh.NewShell();
    mesh.Extrude([{ outer: Circle(0, 0, GALLERY.radius, 32), holes: [[...Circle(0, 0, GALLERY.radius - RAIL.thickness, 32)].reverse()] }], GALLERY_Z, GALLERY_Z + GALLERY.rail, "white", "z");
    // The lantern on top: glowing glass, a graphite ring, a red roof.
    Cylinder(0, 0, LANTERN.radius, 16, GALLERY_Z, GALLERY_Z + LANTERN.height, "lantern", "edge");
    Cylinder(0, 0, LANTERN.radius + 16, 16, GALLERY_Z + LANTERN.height, GALLERY_Z + LANTERN.height + 16, "edge");
    mesh.NewShell();
    mesh.Cone([0, 0, GALLERY_Z + LANTERN.height + 16], [0, 0, GALLERY_Z + LANTERN.height + 16 + LANTERN.roof], LANTERN.radius + 24, 16, "red");
    NoteBox("finish_<trackId> trigger, on the gallery where the ramp arrives", g.s1 - 48, 96, RAMP.width, 192);
    notes.push(`light_spot / env_light in the lantern: at ${fmt([0, 0, GALLERY_Z + LANTERN.height / 2])}`);
}

function Rock() {
    const random = SeededRandom(6);
    // The core: irregular tiers from the sea floor up, wider the lower they
    // end (a mountain, not a tower), the top one the plateau. A tier stays
    // inside every rock path lower than its top (their inner edge), and is at
    // least CORE.radius (the paths' inner walls reach into it).
    const rockSegments = segments.filter(g => g.s0 >= ROCK_S && g.s1 <= HELIX_S && g.kind !== "gap");
    const Free = top => {
        let free = Infinity;
        for (const g of rockSegments) for (let s = g.s0; s <= g.s1; s += 32) {
            if (ZAt(s) < top) free = Math.min(free, SpiralRadius(AngleIn(spiral, s - ROCK_S)) - g.width / 2 - 8);
        }
        return free;
    };
    for (const top of [...CORE.tiers, PLATEAU_Z]) {
        const base = Math.max(CORE.radius, Math.min(Free(top) - CORE.jag, CORE.radius + (PLATEAU_Z - top) * CORE.flare));
        const outline = Array.from({ length: CORE.sides }, (_, i) => {
            const a = (2 * Math.PI * i) / CORE.sides, r = base + CORE.jag * random();
            return [r * Math.cos(a), r * Math.sin(a)];
        });
        Prism(outline, SEABED, top, "rock", top === PLATEAU_Z ? "floor" : "rock");
    }
    // A rough lip round the core's top — open where the plateau comes in.
    const plateau = Segment("plateau"), open0 = AngleIn(spiral, plateau.s0 - ROCK_S) - 0.1, open1 = SPIRAL_END + 0.7;
    const Open = a => ((a - open0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) < open1 - open0;
    for (let i = 0; i < CORE.sides; i++) {
        const a0 = (2 * Math.PI * i) / CORE.sides, a1 = (2 * Math.PI * (i + 1)) / CORE.sides, mid = (a0 + a1) / 2;
        if (Open(mid)) continue;
        const r0 = CORE.radius - 40, r1 = CORE.radius, h = PLATEAU_Z + LIP.height + 24 * random();
        Prism([[r0 * Math.cos(a0), r0 * Math.sin(a0)], [r1 * Math.cos(a0), r1 * Math.sin(a0)], [r1 * Math.cos(a1), r1 * Math.sin(a1)], [r0 * Math.cos(a1), r0 * Math.sin(a1)]], PLATEAU_Z - 8, h, "rock");
    }
    // Low rocks round the foot, just out of the water — not in the harbor bay.
    for (let i = 0; i < 36; i++) {
        const a0 = (2 * Math.PI * i) / 36, a1 = (2 * Math.PI * (i + 1)) / 36, mid = (a0 + a1) / 2;
        let outer = SpiralRadius(mid) + 192 + 200 * random();
        if (Math.cos(mid) > 0 && Math.sin(mid) < 0) outer = Math.min(outer, 1150 / Math.cos(mid));
        const inner = CORE.radius;
        if (outer <= inner + 64) continue;
        Prism([[inner * Math.cos(a0), inner * Math.sin(a0)], [outer * Math.cos(a0), outer * Math.sin(a0)], [outer * Math.cos(a1), outer * Math.sin(a1)], [inner * Math.cos(a1), inner * Math.sin(a1)]], SEABED, 16 + 32 * random(), "rock");
    }
}

const SEA = { x0: -2600, x1: 2800, y0: -ROCK_S - 600, y1: 2600 }; // round the rock and the harbor (it starts ROCK_S south of the rock)
function Seabed() {
    Prism([[SEA.x0, SEA.y0], [SEA.x1, SEA.y0], [SEA.x1, SEA.y1], [SEA.x0, SEA.y1]], SEABED - 16, SEABED, "sand");
    notes.push(`func_water: ${fmt([SEA.x0, SEA.y0, SEABED])} .. ${fmt([SEA.x1, SEA.y1, 0])}`);
    notes.push(`melon_respawn trigger over the whole sea, up to just over the rocks at the foot: ${fmt([SEA.x0, SEA.y0, SEABED])} .. ${fmt([SEA.x1, SEA.y1, 64])} (the quay is at 96, the lowest deck at 128)`);
}

const SECTIONS = {
    "01_harbor": Harbor,
    "02_ships": Ships,
    "03_cliff_path": CliffPath,
    "04_cliff_climb": CliffClimb,
    "05_cliff_summit": CliffSummit,
    "06_lighthouse": Lighthouse,
    "07_rock": Rock,
    "08_seabed": Seabed,
};

const COLORS = {
    floor: [0xa8, 0x9f, 0x8e], // the rock paths' and ramp's driving surface
    rock: [0x7d, 0x78, 0x70],
    cliff: [0xc2, 0x7a, 0x3a], // ochre rock: the gorge's walls, to wall-jump off
    quay: [0x8f, 0x8b, 0x84], // quay and mole stone
    paving: [0xb9, 0xb3, 0xa6],
    brick: [0x8e, 0x4a, 0x36],
    red: [0xd8, 0x34, 0x2a], // the lighthouse's bands and roof, the cutter's hull, roofs
    white: [0xec, 0xec, 0xe8],
    edge: [0x2b, 0x30, 0x38], // graphite: bollards, the ramp's and gallery's slab, coamings
    navy: [0x22, 0x35, 0x5e], // the tug's hull
    hull: [0x26, 0x28, 0x2c], // the freighter's and barge's hull
    antifouling: [0x7a, 0x26, 0x20], // every hull under the waterline
    tire: [0x1a, 0x1a, 0x1c], // tire fenders, the tug's funnel top, bollards
    glass: [0x22, 0x30, 0x3e], // the deckhouses' window bands
    yellow: [0xf0, 0xb8, 0x24], // the freighter's gantry cranes
    wood: [0xa0, 0x76, 0x48],
    steel: [0x6e, 0x76, 0x7e],
    blue: [0x2f, 0x6f, 0xb8], // containers
    orange: [0xe8, 0x7a, 0x1f],
    green: [0x3a, 0x8a, 0x4a],
    lantern: [0xff, 0xe6, 0x80],
    sand: [0xc8, 0xb8, 0x8e],
};
const GLOW = { lantern: 2 };

const NAME = "parkour";
const MATERIAL_DIR = `materials/melon_racer/${NAME}`;
const MODEL_DIR = `models/melon_racer/${NAME}`;
const GENERATOR = "tools/models/make-parkour-model.mjs";
const only = process.argv[2];
const keys = Object.keys(SECTIONS).filter(key => !only || key === only || key.slice(3) === only);
if (keys.length === 0) throw new Error(`no section "${only}" — one of ${Object.keys(SECTIONS).join(", ")}`);
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
let triangles = 0;
for (const key of keys) {
    mesh = new Mesh(128);
    stepDegrees = 4;
    SECTIONS[key]();
    const used = Object.fromEntries(Object.keys(mesh.tris).map(part => [part, materials[part]]));
    WriteAddonFile(`${MODEL_DIR}/${NAME}_${key}.dmx`, DmxText(mesh, `${NAME}_${key}`, used));
    console.log(`  ${key}: ${mesh.triangleCount} triangles`);
    triangles += mesh.triangleCount;
}
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, glow: GLOW[part] ?? 0 }));
}
const length = section => Math.round(segments.filter(g => g.section === section).reduce((sum, g) => sum + g.length, 0));
console.log(`${NAME}: ${triangles} triangles; ${Math.round(total)} along the course (harbor + ships ${length("harbor") + length("ships")}, cliff ${length("cliff_path") + length("cliff_climb") + length("cliff_summit")}, `
    + `${(SPIRAL_END / (2 * Math.PI)).toFixed(2)} turns round the rock, ${SHRINK_PER_TURN.toFixed(0)} in per turn; ramp ${length("lighthouse")}, ${RAMP.turns} turns); quay ${First("harbor").z0} up, plateau ${PLATEAU_Z}, gallery (finish) ${GALLERY_Z}, `
    + `lantern roof ${GALLERY_Z + LANTERN.height + 16 + LANTERN.roof}`);
console.log("place in Hammer (world positions relative to where the .dmx files' shared origin lands; yaw = the course's direction there):");
for (const note of notes) console.log(`  ${note}`);
console.log(`import: Hammer, File > Import > ${MODEL_DIR}/${NAME}_<section>.dmx, every one at the same position (origin: the lighthouse's middle at sea level)`);
