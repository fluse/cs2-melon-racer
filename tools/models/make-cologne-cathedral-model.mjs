// Builds Cologne Cathedral for the 3D skybox as mesh geometry for Hammer —
// `node tools/models/make-cologne-cathedral-model.mjs`: the two west towers
// (three square stages, each set back, wimpergs and corner pinnacles on every
// step, the octagon with a gable on each face, the openwork spire, the finial),
// the nave and choir under one steep lead roof ending in a hipped apse, the
// transept with its gabled ends and corner turrets, the crossing turret, the
// lower aisles and the chevet of chapels round the choir, the flying
// buttresses' pinnacles in rows along it and wimpergs on the choir's eaves.
// Kept to about TRIANGLE_BUDGET triangles: the detail is in the silhouette
// (every step, gable and spike) and in the textures (lancet windows with
// tracery, blind tracery, openwork, lead) — no bottoms, nothing hidden built.
// Writes
//   models/melon_racer/cologne_cathedral.dmx  for Hammer's File > Import: edit
//                                             it like any mesh
//   materials/melon_racer/cologne_cathedral/cologne_cathedral_<part>.vmat (+ _color.png)
// Origin: on the floor in the middle of the crossing; the choir east (+X), the
// west front at -X, north +Y — the way the real one stands to the Rhine (east),
// the same way round as bridge.dmx and harbor_dock.dmx. Dimensions below in
// metres, at the Colonius' scale (UNITS_PER_METRE).
import { DmxText, Mesh, SeededRandom, Shape, V3, VmatText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

const UNITS_PER_METRE = 11.28; // the Colonius: 266 m = 3000 units
const TRIANGLE_BUDGET = 700;

// --- Plan, metres: x from the west front east, y north ---
const CROSSING = { x0: 66, x1: 81 }; // the crossing, between the nave and the choir; the origin is its middle
const VESSEL_HALF = 7.75; // the nave's, transept's and choir's walls (the high central vessel)
const EAVE = 45, RIDGE = 61; // its walls' top, its roof's ridge
const APSE_X = 121.5; // where the choir ends in its apse: half a decagon, VESSEL_HALF round this point
const APSE_SIDES = 5;
const TRANSEPT_END = 43; // the transept's ends, both sides of the axis
const AISLES = { half: 22.5, height: 22, transeptX0: 58.5, transeptX1: 88.5, chevetSides: 7 }; // the low block round it all: aisles, transept aisles, chapels
const TOWER = { x: 11.5, y: VESSEL_HALF + 11.5 }; // the west towers' middles (one each side)
// Each stage [z bottom, half width bottom, z top, half width top]; each starts set back from the one under it.
const TOWER_STAGES = [
    [0, 11.5, 42, 11.5],
    [42, 10.2, 72, 10.0],
    [72, 9.0, 98, 8.8],
];
const OCTAGON = { z0: 98, z1: 112, apothem0: 7.4, apothem1: 7.2 }; // the octagonal belfry over the square stages
const SPIRE_TOP = 151;
const FINIAL = { bottom: 149.5, z: 152.5, radius: 2.2, top: 157 }; // the Kreuzblume
// The wimpergs on each stage's top, per face [count, width, below the top, above it]; stage 1 skips the face against the nave.
const TOWER_GABLES = [[1, 12, 5, 9], [2, 8, 4, 8]];
// Pinnacles at each stage's four corners: [half base, height above the stage's top].
const TOWER_PINNACLES = [[1.4, 11], [1.3, 12], [1.7, 20]];
const OCTAGON_GABLE = { width: 5, below: 4, above: 6 };
const CROSSING_TURRET = { radius: 3, z0: 57, z1: 72, top: 104 };
const TRANSEPT_TURRET = { half: 1.8, top: 60, spike: 76 }; // at each transept end's two corners
const CHOIR_BAYS = 5; // wimpergs on the choir's eaves, one per bay and apse side
const EAVE_GABLE = { width: 6, below: 4, above: 5 };
const NAVE_BUTTRESSES = 4, CHOIR_BUTTRESSES = 5; // pinnacles along each side (plus one per chapel between them round the chevet)
const BUTTRESS = { half: 1.4, z0: 18, top: 48, inset: 1.6 };
const PORTAL_GABLE = { width: 11, z0: 16, apex: 34, out: 1.2 }; // over the west portal and both transept portals

// --- Textures: [units per repeat across, up] ---
const TILES = { wall: [128, 256], stone: [128, 128], spire: [128, 128], roof: [128, 128], terrace: [256, 256] };

const NAME = "cologne_cathedral";
const MATERIAL_DIR = "materials/melon_racer/cologne_cathedral";
const GENERATOR = "tools/models/make-cologne-cathedral-model.mjs";

const ORIGIN_X = (CROSSING.x0 + CROSSING.x1) / 2;
const mesh = new Mesh(TILES.terrace[0]);
/** Metres from the west front to units from the origin. */
const U = ([x, y, z]) => [(x - ORIGIN_X) * UNITS_PER_METRE, y * UNITS_PER_METRE, z * UNITS_PER_METRE];
const Mean = pts => V3.Scale(pts.reduce((s, p) => V3.Add(s, p), [0, 0, 0]), 1 / pts.length);

/**
 * A flat convex polygon (metres), turned to face away from `inside`; textured
 * in its own plane: across along the horizontal, up the slope, image top up
 * (texcoord v runs down the image).
 */
function Poly(points, part, inside) {
    let pts = points.map(U);
    let n = pts.reduce((s, p, i) => V3.Add(s, V3.Cross(p, pts[(i + 1) % pts.length])), [0, 0, 0]);
    if (V3.Dot(n, V3.Sub(Mean(pts), U(inside))) < 0) { pts = pts.reverse(); n = V3.Scale(n, -1); }
    n = V3.Unit(n);
    const across = Math.abs(n[2]) > 0.99 ? [1, 0, 0] : V3.Unit(V3.Cross([0, 0, 1], n));
    const up = V3.Cross(n, across);
    const [tu, tv] = TILES[part];
    mesh.Face(pts, pts.map(p => [V3.Dot(p, across) / tu, -V3.Dot(p, up) / tv]), part);
}
/** The quads between two rings of the same count (closed), facing away from `inside`; `skip(k)` leaves side k out. */
function Band(lower, upper, part, inside, skip = () => false) {
    lower.forEach((p, k) => {
        const k1 = (k + 1) % lower.length;
        if (!skip(k)) Poly([p, lower[k1], upper[k1], upper[k]], part, inside);
    });
}
/** A ring round (cx, cy) at height z: `sides` corners on radius r, the first at angle `start` (degrees). */
const Ring = (cx, cy, r, z, sides, start) => Array.from({ length: sides }, (_, k) => {
    const a = ((start + (360 * k) / sides) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), z];
});
const Square = (cx, cy, half, z) => Ring(cx, cy, half * Math.SQRT2, z, 4, 45); // corners (+,+), (-,+), (-,-), (+,-)
const Octagon = (cx, cy, apothem, z) => Ring(cx, cy, apothem / Math.cos(Math.PI / 8), z, 8, 22.5); // flat sides facing the axes
/** A four-sided spike (a pinnacle, a spirelet) from a square base to its tip, no base face. */
function Spike(cx, cy, z0, z1, half, part = "stone") {
    mesh.NewShell();
    const base = Square(cx, cy, half, z0), tip = [cx, cy, z1];
    base.forEach((p, k) => Poly([p, base[(k + 1) % 4], tip], part, [cx, cy, z0 + (z1 - z0) / 4]));
}
/**
 * A wimperg standing out of a wall: a steep triangle in front of it, `width`
 * wide at z0, its tip at z1, with two roof slopes running back `depth` into
 * the wall (or the roof, or the stage set back above) — `at` is its middle on
 * the wall, `out` the wall's outward horizontal direction, `forward` how far in
 * front of the wall it stands; with `bottom` its underside closed too.
 */
function Gable(at, out, width, z0, z1, { depth = 3, forward = 0.15, bottom = false } = {}) {
    mesh.NewShell();
    const o = V3.Unit([out[0], out[1], 0]), side = [-o[1], o[0], 0];
    const front = V3.Add([at[0], at[1], 0], V3.Scale(o, forward));
    const a = V3.Add(V3.Add(front, V3.Scale(side, -width / 2)), [0, 0, z0]);
    const b = V3.Add(V3.Add(front, V3.Scale(side, width / 2)), [0, 0, z0]);
    const tip = V3.Add(front, [0, 0, z1]);
    const back = V3.Add(tip, V3.Scale(o, -(forward + depth)));
    const inside = Mean([a, b, tip, back]);
    Poly([a, b, tip], "stone", inside);
    Poly([a, tip, back], "stone", inside);
    Poly([tip, b, back], "stone", inside);
    if (bottom) Poly([a, back, b], "stone", inside);
}

// --- The west towers: one shell from the ground to the spire's tip ---
for (const sy of [-1, 1]) {
    const cx = TOWER.x, cy = sy * TOWER.y, center = z => [cx, cy, z];
    mesh.NewShell();
    TOWER_STAGES.forEach(([z0, h0, z1, h1], i) => {
        // Stage 1's face against the nave is inside it.
        const againstNave = sy > 0 ? 2 : 0;
        Band(Square(cx, cy, h0, z0), Square(cx, cy, h1, z1), "wall", center((z0 + z1) / 2), k => i === 0 && k === againstNave);
        const next = TOWER_STAGES[i + 1];
        if (next) Band(Square(cx, cy, h1, z1), Square(cx, cy, next[1], z1), "stone", center(z1 - 1)); // the ledge up to the next stage
    });
    // The step from the last square stage onto the octagon: a trapezoid along each side, a triangle in each corner.
    const [, , zTop, hTop] = TOWER_STAGES[TOWER_STAGES.length - 1];
    const sq = Square(cx, cy, hTop, zTop), oct = Octagon(cx, cy, OCTAGON.apothem0, OCTAGON.z0);
    for (let k = 0; k < 4; k++) {
        Poly([oct[2 * k], sq[k], oct[2 * k + 1]], "stone", center(zTop - 1));
        Poly([sq[k], sq[(k + 1) % 4], oct[(2 * k + 2) % 8], oct[2 * k + 1]], "stone", center(zTop - 1));
    }
    const octTop = Octagon(cx, cy, OCTAGON.apothem1, OCTAGON.z1);
    Band(oct, octTop, "wall", center((OCTAGON.z0 + OCTAGON.z1) / 2));
    octTop.forEach((p, k) => Poly([p, octTop[(k + 1) % 8], center(SPIRE_TOP)], "spire", center(OCTAGON.z1 + 5)));
    // The finial: a double pyramid on the spire's tip.
    mesh.NewShell();
    const ring = Ring(cx, cy, FINIAL.radius, FINIAL.z, 4, 0);
    ring.forEach((p, k) => {
        Poly([p, ring[(k + 1) % 4], center(FINIAL.top)], "stone", center(FINIAL.z));
        Poly([p, ring[(k + 1) % 4], center(FINIAL.bottom)], "stone", center(FINIAL.z));
    });
    // Wimpergs and pinnacles on each stage's top.
    TOWER_STAGES.forEach(([, , z1, h1], i) => {
        const [pinHalf, pinHeight] = TOWER_PINNACLES[i];
        for (const [px, py] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) Spike(cx + px * (h1 - pinHalf), cy + py * (h1 - pinHalf), z1 - 2, z1 + pinHeight, pinHalf);
        if (!TOWER_GABLES[i]) return;
        const [count, width, below, above] = TOWER_GABLES[i];
        for (const out of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
            if (i === 0 && out[1] === -sy) continue; // against the nave
            for (let g = 0; g < count; g++) {
                const along = (g - (count - 1) / 2) * (2 * h1 / count);
                const at = [cx + out[0] * h1 - out[1] * along, cy + out[1] * h1 + out[0] * along];
                Gable(at, out, width, z1 - below, z1 + above);
            }
        }
    });
    // A wimperg on each face of the octagon, leaning against the spire.
    for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4, out = [Math.cos(a), Math.sin(a)];
        Gable([cx + out[0] * OCTAGON.apothem1, cy + out[1] * OCTAGON.apothem1], out, OCTAGON_GABLE.width, OCTAGON.z1 - OCTAGON_GABLE.below, OCTAGON.z1 + OCTAGON_GABLE.above);
    }
}

// --- The central vessel: nave and choir in one, the apse half a decagon; its roof hipped over the apse ---
const apse = Array.from({ length: APSE_SIDES + 1 }, (_, k) => {
    const a = -Math.PI / 2 + (Math.PI * k) / APSE_SIDES;
    return [APSE_X + VESSEL_HALF * Math.cos(a), VESSEL_HALF * Math.sin(a)];
});
const vessel = [[0, VESSEL_HALF], [0, -VESSEL_HALF], ...apse]; // counter-clockwise from above
mesh.NewShell();
const vesselInside = [APSE_X / 2, 0, EAVE / 2];
vessel.forEach(([x, y], k) => {
    const [x1, y1] = vessel[(k + 1) % vessel.length];
    Poly([[x, y, 0], [x1, y1, 0], [x1, y1, EAVE], [x, y, EAVE]], "wall", vesselInside);
});
const ridgeWest = [0, 0, RIDGE], ridgeEast = [APSE_X, 0, RIDGE];
const roofInside = [APSE_X / 2, 0, EAVE];
Poly([[0, -VESSEL_HALF, EAVE], [APSE_X, -VESSEL_HALF, EAVE], ridgeEast, ridgeWest], "roof", roofInside);
Poly([[0, VESSEL_HALF, EAVE], [APSE_X, VESSEL_HALF, EAVE], ridgeEast, ridgeWest], "roof", roofInside);
Poly([[0, -VESSEL_HALF, EAVE], [0, VESSEL_HALF, EAVE], ridgeWest], "wall", roofInside); // the west front's gable, between the towers
apse.slice(0, -1).forEach(([x, y], k) => Poly([[x, y, EAVE], [...apse[k + 1], EAVE], ridgeEast], "roof", [APSE_X - 1, 0, EAVE]));

// --- The transept arms: walls out of the vessel, a roof running into the nave's, a gable at the end ---
const transeptMid = ORIGIN_X;
for (const sy of [-1, 1]) {
    mesh.NewShell();
    const end = sy * TRANSEPT_END, wall = sy * VESSEL_HALF, inside = [transeptMid, (end + wall) / 2, EAVE / 2];
    const corners = [[CROSSING.x0, wall], [CROSSING.x0, end], [CROSSING.x1, end], [CROSSING.x1, wall]];
    for (let k = 0; k < 3; k++) {
        const [x, y] = corners[k], [x1, y1] = corners[k + 1];
        Poly([[x, y, 0], [x1, y1, 0], [x1, y1, EAVE], [x, y, EAVE]], "wall", inside);
    }
    const ridgeIn = [transeptMid, 0, RIDGE], ridgeOut = [transeptMid, end, RIDGE];
    const roofIn = [transeptMid, end / 2, EAVE];
    Poly([[CROSSING.x0, 0, EAVE], [CROSSING.x0, end, EAVE], ridgeOut, ridgeIn], "roof", roofIn);
    Poly([[CROSSING.x1, 0, EAVE], [CROSSING.x1, end, EAVE], ridgeOut, ridgeIn], "roof", roofIn);
    Poly([[CROSSING.x0, end, EAVE], [CROSSING.x1, end, EAVE], ridgeOut], "wall", roofIn);
    // The portal's wimperg and the two corner turrets.
    Gable([transeptMid, end], [0, sy], PORTAL_GABLE.width, PORTAL_GABLE.z0, PORTAL_GABLE.apex, { forward: PORTAL_GABLE.out, bottom: true });
    for (const x of [CROSSING.x0, CROSSING.x1]) {
        mesh.NewShell();
        const h = TRANSEPT_TURRET.half;
        Band(Square(x, end, h, 0), Square(x, end, h, TRANSEPT_TURRET.top), "stone", [x, end, TRANSEPT_TURRET.top / 2]);
        Spike(x, end, TRANSEPT_TURRET.top, TRANSEPT_TURRET.spike, h);
    }
}
Gable([0, 0], [-1, 0], PORTAL_GABLE.width, PORTAL_GABLE.z0, PORTAL_GABLE.apex, { forward: PORTAL_GABLE.out, bottom: true }); // the west portal's

// --- The crossing turret: an octagonal lantern on the ridge, a slim spire ---
mesh.NewShell();
{
    const t = CROSSING_TURRET, c = z => [transeptMid, 0, z];
    const lower = Ring(transeptMid, 0, t.radius, t.z0, 8, 22.5), upper = Ring(transeptMid, 0, t.radius, t.z1, 8, 22.5);
    Band(lower, upper, "wall", c((t.z0 + t.z1) / 2));
    upper.forEach((p, k) => Poly([p, upper[(k + 1) % 8], c(t.top)], "spire", c(t.z1 + 2)));
}

// --- The low block: aisles behind the towers, transept aisles, the chevet of chapels round the choir ---
const A = AISLES;
const chevet = Array.from({ length: A.chevetSides + 1 }, (_, k) => {
    const a = -Math.PI / 2 + (Math.PI * k) / A.chevetSides;
    return [APSE_X + A.half * Math.cos(a), A.half * Math.sin(a)];
});
const aisleOutline = [ // counter-clockwise from above, from the north-west corner behind the north tower
    [TOWER.x * 2, A.half], [TOWER.x * 2, -A.half],
    [A.transeptX0, -A.half], [A.transeptX0, -TRANSEPT_END], [A.transeptX1, -TRANSEPT_END], [A.transeptX1, -A.half],
    ...chevet,
    [A.transeptX1, A.half], [A.transeptX1, TRANSEPT_END], [A.transeptX0, TRANSEPT_END], [A.transeptX0, A.half],
];
mesh.NewShell();
aisleOutline.forEach(([x, y], k) => {
    if (k === 0) return; // its west side, against the towers
    const [x0, y0] = aisleOutline[k - 1];
    Poly([[x0, y0, 0], [x, y, 0], [x, y, A.height], [x0, y0, A.height]], "wall", [APSE_X / 2, 0, A.height / 2]);
});
mesh.Cap(Shape(aisleOutline.map(p => U([...p, 0]).slice(0, 2))), A.height * UNITS_PER_METRE, "terrace", "z");

// --- The flying buttresses' pinnacles: rows along the aisles' outer walls, one between each two chapels ---
const buttresses = [];
const naveBay = (A.transeptX0 - TOWER.x * 2) / (NAVE_BUTTRESSES + 1), choirBay = (APSE_X - A.transeptX1) / CHOIR_BUTTRESSES;
for (let k = 1; k <= NAVE_BUTTRESSES; k++) buttresses.push([TOWER.x * 2 + k * naveBay, A.half - BUTTRESS.inset], [TOWER.x * 2 + k * naveBay, -(A.half - BUTTRESS.inset)]);
for (let k = 1; k <= CHOIR_BUTTRESSES; k++) buttresses.push([A.transeptX1 + k * choirBay, A.half - BUTTRESS.inset], [A.transeptX1 + k * choirBay, -(A.half - BUTTRESS.inset)]);
for (let k = 1; k < A.chevetSides; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / A.chevetSides, r = A.half - BUTTRESS.inset;
    buttresses.push([APSE_X + r * Math.cos(a), r * Math.sin(a)]);
}
for (const [x, y] of buttresses) Spike(x, y, BUTTRESS.z0, BUTTRESS.top, BUTTRESS.half);

// --- Wimpergs on the choir's eaves: one per bay each side, one per apse side ---
const eaveGables = [];
for (let k = 0; k < CHOIR_BAYS; k++) {
    const x = CROSSING.x1 + ((k + 0.5) * (APSE_X - CROSSING.x1)) / CHOIR_BAYS;
    eaveGables.push([[x, VESSEL_HALF], [0, 1]], [[x, -VESSEL_HALF], [0, -1]]);
}
apse.slice(0, -1).forEach(([x, y], k) => {
    const m = [(x + apse[k + 1][0]) / 2, (y + apse[k + 1][1]) / 2];
    eaveGables.push([m, [m[0] - APSE_X, m[1]]]);
});
const roofSlope = (RIDGE - EAVE) / VESSEL_HALF;
for (const [at, out] of eaveGables) Gable(at, out, EAVE_GABLE.width, EAVE - EAVE_GABLE.below, EAVE + EAVE_GABLE.above, { depth: EAVE_GABLE.above / roofSlope + 1.5 });

// --- Textures, 1 px per unit; image y runs down ---
const random = SeededRandom(0xd0e1);
const Clamp = c => Math.max(0, Math.min(255, Math.round(c)));
const Shade = (rgb, d) => rgb.map(c => c + d);
const STONE = [0x5e, 0x59, 0x52]; // the cathedral's weathered, sooty sandstone
const GLASS = [0x1e, 0x23, 0x2c];
const blockShades = Array.from({ length: 512 }, () => (random() - 0.5) * 16);
const streaks = Array.from({ length: 128 }, () => (random() - 0.5) * 14); // soot running down
/** Ashlar: courses `course` px high, blocks `block` long, every other course shifted half a block, faint joints. */
function Ashlar(px, py, course = 12, block = 24) {
    const row = Math.floor(py / course), bx = px + (row % 2) * (block / 2);
    const joint = py % course === 0 || bx % block === 0 ? -14 : 0;
    const s = streaks[px % 128] + streaks[(px * 5 + 3) % 128] * 0.5;
    return Shade(STONE, joint + s + blockShades[(row * 37 + Math.floor(bx / block)) % 512] + ((px * 7 + py * 13) % 5) - 2);
}
/** Inside a pointed (equilateral) arch from x0 to x1, its tip at y `apex`, open downwards to `sill`. */
function InArch(x, y, x0, x1, apex, sill) {
    const w = x1 - x0, spring = apex + w * Math.sin(Math.PI / 3);
    if (y < apex || y > sill || x < x0 || x > x1) return false;
    return y >= spring || (Math.hypot(x - x0, y - spring) <= w && Math.hypot(x - x1, y - spring) <= w);
}
const panes = Array.from({ length: 256 }, () => random());
/** Stained glass: dark, small panes in a few dim colors. */
function Glass(px, py) {
    const p = panes[(Math.floor(px / 4) * 17 + Math.floor(py / 5) * 31) % 256];
    const tint = p < 0.15 ? [18, 0, -4] : p < 0.3 ? [-6, 0, 16] : p < 0.38 ? [10, 8, -6] : [0, 0, 0];
    return Shade(GLASS, (px % 4 === 0 || py % 5 === 0 ? -6 : 0)).map((c, i) => c + tint[i]);
}
// Walls (128 x 256): a tall lancet window with tracery between two buttresses, a wimperg line over it, a string course.
const WALL_W = 128, WALL_H = 256, WIN = { x0: 30, x1: 98, apex: 30, sill: 226 };
const wallColor = EncodePng(WALL_W, WALL_H, (px, py) => {
    let c;
    const buttress = px < 12 || px >= 116;
    if (InArch(px, py, WIN.x0, WIN.x1, WIN.apex, WIN.sill)) {
        const mid = (WIN.x0 + WIN.x1) / 2, spring = WIN.apex + (WIN.x1 - WIN.x0) * Math.sin(Math.PI / 3);
        const mullion = py > spring - 4 && (Math.abs(px - (WIN.x0 + 23)) < 2 || Math.abs(px - (WIN.x1 - 23)) < 2);
        const rose = Math.abs(Math.hypot(px - mid, py - (spring - 22)) - 13) < 2; // the rosette in the arch's head
        const heads = py > spring - 6 && py < spring + 2 && Math.abs(((px - WIN.x0) % 23) - 11.5) > 8; // the three lights' heads
        const transom = Math.abs(py - (spring + 72)) < 1.5;
        c = mullion || rose || heads || transom ? Shade(STONE, 22) : Glass(px, py);
    } else if (InArch(px, py, WIN.x0 - 5, WIN.x1 + 5, WIN.apex - 8, WIN.sill + 4)) {
        c = Shade(Ashlar(px, py), -26 + (px < (WIN.x0 + WIN.x1) / 2 ? 8 : 0)); // the splay, lit from one side
    } else {
        c = Ashlar(px, py);
        // The wimperg's steep edges over the window.
        const edge = 36 - Math.abs(px - 64) * 0.9 - (py - 2);
        if (Math.abs(px - 64) < 40 && Math.abs(edge) < 1.6) c = Shade(c, 26);
        else if (Math.abs(px - 64) < 40 && edge > -4 && edge < -1.6) c = Shade(c, -18);
        if (buttress) c = Shade(c, 16 + (py % 64 < 2 ? 20 : py % 64 < 5 ? -20 : 0));
        if (px >= 12 && px < 15 || px > 112 && px < 116) c = Shade(c, -30); // the buttresses' shadow
    }
    if (py >= 238 && py < 243) c = Shade(STONE, 18); // string course
    else if (py >= 243 && py < 247) c = Shade(STONE, -24);
    return [...c.map(Clamp), 255];
});
// Stone (128 x 128): ashlar under blind tracery, narrow pointed panels.
const stoneColor = EncodePng(128, 128, (px, py) => {
    let c = Ashlar(px, py, 8, 16);
    const cell = px % 32, rowY = py % 64;
    if (cell < 2) c = Shade(c, 18);
    else if (cell < 4) c = Shade(c, -22);
    else if (!InArch(cell, rowY, 5, 30, 4, 63)) c = Shade(c, 10);
    return [...c.map(Clamp), 255];
});
// Spire (128 x 128): openwork — ribs and bands of stone round dark pointed openings.
const spireColor = EncodePng(128, 128, (px, py) => {
    let c = Ashlar(px, py, 8, 16);
    const cell = px % 32, rowY = py % 32;
    if (InArch(cell, rowY, 7, 25, 5, 27)) c = Shade(GLASS, -6 + (cell < 12 ? 6 : 0));
    else if (rowY < 3 || cell < 3) c = Shade(c, 20); // ribs and bands
    if (rowY < 3 && px % 8 < 3) c = Shade(c, 18); // crockets on the bands
    return [...c.map(Clamp), 255];
});
// Roof (128 x 128): lead, standing seams down the slope, faint laps.
const LEAD = [0x86, 0x8d, 0x92];
const patina = Array.from({ length: 64 }, () => (random() - 0.5) * 10);
const roofColor = EncodePng(128, 128, (px, py) => {
    const seam = px % 16 === 0 ? 18 : px % 16 === 1 ? -20 : 0, lap = py % 48 === 0 ? -8 : 0;
    return [...Shade(LEAD, seam + lap + patina[(Math.floor(px / 16) * 7 + Math.floor(py / 48)) % 64] + ((px * 3 + py * 7) % 3)).map(Clamp), 255];
});
// Terrace (128 x 128 over 256 units): the aisles' low roofs seen from above, dark lead with the flyers' shadows.
const terraceColor = EncodePng(128, 128, (px, py) => {
    const seam = px % 8 === 0 ? -10 : 0, flyer = py % 32 < 3 ? -26 : py % 32 < 5 ? 12 : 0;
    return [...Shade([0x5a, 0x5d, 0x60], seam + flyer + ((px * 5 + py * 3) % 4)).map(Clamp), 255];
});
const textures = { wall: wallColor, stone: stoneColor, spire: spireColor, roof: roofColor, terrace: terraceColor };

const materials = Object.fromEntries(Object.keys(textures).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(mesh, NAME, materials));
for (const [part, png] of Object.entries(textures)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, png);
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, metalness: part === "roof" ? 0.3 : 0 }));
}
const perPart = Object.entries(mesh.tris).map(([part, tris]) => `${part} ${tris.length}`).join(", ");
const xs = mesh.v.map(p => p[0]), ys = mesh.v.map(p => p[1]), zs = mesh.v.map(p => p[2]);
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles (budget ${TRIANGLE_BUDGET}; ${perPart}); `
    + `x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}, y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}, ${Math.max(...zs).toFixed(0)} high; `
    + `${buttresses.length} buttress pinnacles, ${eaveGables.length} eave wimpergs`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the floor in the crossing, the choir +X, the west towers -X)`);
