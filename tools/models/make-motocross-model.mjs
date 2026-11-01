// Builds the motocross stadium race track as mesh geometry for Hammer —
// `node tools/models/make-motocross-model.mjs [section]`: a small stadium
// with a dirt floor, the track a figure eight round two grass islands. It
// crosses itself in the middle: one way over a kicker ramp, flying over the
// other lane, the other way through the gap between kicker and landing —
// open on purpose, a melon can land on another one there. Sprung hills on
// the straights (a tabletop, a double, a step-up) are timed for a jump at
// the lip at MAX_SPEED; whoops (small waves) are hard at full speed.
//
// One .dmx per section, so a change re-imports only that part — every file
// has the same origin (the crossing, at floor level z 0): import each at the
// same spot.
//   models/melon_racer/motocross/motocross_01_floor.dmx    dirt floor, grass islands, the tunnel's floor
//   models/melon_racer/motocross/motocross_02_banden.dmx   the low boards along both track edges (walls melons bounce off), open at the crossing
//   models/melon_racer/motocross/motocross_03_hills.dmx    tabletop, double, step-up
//   models/melon_racer/motocross/motocross_04_whoops.dmx   the two whoops sections
//   models/melon_racer/motocross/motocross_05_crossing.dmx the kicker and its landing over the other lane
//   models/melon_racer/motocross/motocross_06_berms.dmx    banked outsides of the four tight corners
//   models/melon_racer/motocross/motocross_07_stadium.dmx  perimeter wall, stands, the tunnel out, floodlight masts
//   materials/melon_racer/motocross/motocross_<part>.vmat (+ _color.png)
// `node … hills` writes only that section (and the materials). Every
// section reads the one course laid out below, so moving a corner or a hill
// means re-importing the sections it touches (the banden and berms follow
// the corners, the hills the straights).
//
// Laid out along the course: s along it from the crossing (heading to the
// first corner), t across it (positive to the left of the direction of
// travel), z up, in world units.
import ClipperLib from "clipper-lib";
import earcut from "earcut";
import { Area, AxisBox, Box, DmxText, Mesh, SolidPng, V3, VmatText, WriteAddonFile } from "../lib/model.mjs";

// --- Jump physics (src/melon_drive): MAX_SPEED 650, JUMP_SPEED 370 (a jump
// sets the upward speed), GRAVITY 800; impact damage above 450 u/s into the
// ground, twice on a flat landing. Off a 20 degree lip at MAX_SPEED a melon
// flies ~400 rolling and ~630 jumping: the hills' gaps and landings below
// are measured for that ---

// --- The course: corners of a figure eight, rounded; the two diagonals cross at the origin at right angles ---
const TRACK_WIDTH = 288;
const CORNERS = [ // in driving order after the crossing: the right loop clockwise, then the left one counter-clockwise
    { name: "A", at: [800, 800] },
    { name: "B", at: [1800, 1000] },
    { name: "C", at: [1800, -1000] },
    { name: "D", at: [800, -800] },
    { name: "E", at: [-800, 800] },
    { name: "F", at: [-1800, 1000] },
    { name: "G", at: [-1800, -1000] },
    { name: "H", at: [-800, -800] },
];
const RADIUS = { wide: 400, tight: 360 }; // fillet radius: tight for the turns over 60 degrees (B, C, F, G)
const ARC_STEP = 6; // degrees per piece along a curve (banden, berms)
const BANDE_ARC_TOLERANCE = 4; // how far the banden's rounded ends may stray from a true circle: coarser = fewer triangles

// --- Hills: profiles [u along, z up], each piece starting and ending on the floor ---
const TABLETOP = [[[0, 0], [128, 48], [384, 48], [768, 0]]]; // forgiving: rolled or jumped, the landing is the long down slope
const DOUBLE = [[[0, 0], [160, 64], [192, 64], [288, 0]], [[448, 0], [608, 64], [640, 64], [928, 0]]]; // rolled: into the second hump's face; jumped at the lip: onto its back
const STEP_UP = [[[0, 0], [128, 48], [160, 48], [224, 0]], [[352, 0], [352, 96], [576, 96], [768, 0]]]; // the plateau's face is a wall: only a jump reaches its top
const KICKER = [[[0, 0], [256, 112], [256, 0]], [[608, 0], [608, 112], [1056, 0]]]; // the gap (352) over the other lane: rolled at full speed just about, jumped safely
const KICKER_GAP_MIDDLE = 432; // from the kicker's foot to the gap's middle (the crossing)
const WHOOP = { height: 20, length: 96, samples: 8 }; // at full speed a wave throws the melon into the face of a later one

// --- Berms, banden, stadium ---
const BERM = { height: 40, inner: 16, rampIn: 160 }; // the outer side of a tight corner rises to `height` at the track edge, from `inner` off the middle
const BANDE = { height: 40, thickness: 24 }; // the boards along both edges (a wall: bounces, wall jumps)
const ISLAND_HEIGHT = 2; // the grass inside the loops
const FLOOR = { halfX: 2150, halfY: 1300, radius: 500, depth: 16 }; // the stadium floor, a rounded rectangle
const STAND = { wall: 24, wallHeight: 72, tiers: 6, depth: 96, rise: 48, back: 24, backAbove: 96 };
const TUNNEL = { width: 320, height: 192, roof: 24 }; // through the stands at the bottom (-Y) middle: the way to the hub
const MAST = { size: 32, height: 960, head: [16, 128, 64] };
const CORNER_SEGMENTS = 6; // round the stadium's rounded corners, per quarter

// --- The course's middle line: straights and arcs ---
const Sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const Unit2 = a => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
const Left2 = d => [-d[1], d[0]];
const pieces = []; // { kind: "line", a, d, length } | { kind: "arc", c, r, a0, turn, length }; s0/s1 added below
const corners = CORNERS.map((corner, i) => {
    const prev = CORNERS[(i + CORNERS.length - 1) % CORNERS.length].at, next = CORNERS[(i + 1) % CORNERS.length].at, p = corner.at;
    const u = Unit2(Sub2(p, prev)), w = Unit2(Sub2(next, p));
    const turn = Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1]); // > 0 left
    const r = Math.abs(turn) > Math.PI / 3 ? RADIUS.tight : RADIUS.wide;
    const tangent = r * Math.tan(Math.abs(turn) / 2);
    const start = [p[0] - u[0] * tangent, p[1] - u[1] * tangent], end = [p[0] + w[0] * tangent, p[1] + w[1] * tangent];
    const side = Math.sign(turn), n = Left2(u);
    const c = [start[0] + n[0] * r * side, start[1] + n[1] * r * side];
    return { ...corner, turn, r, start, end, c };
});
const AddLine = (a, b) => pieces.push({ kind: "line", a, d: Unit2(Sub2(b, a)), length: Math.hypot(b[0] - a[0], b[1] - a[1]) });
let from = [0, 0];
for (const k of corners) {
    AddLine(from, k.start);
    pieces.push({ kind: "arc", c: k.c, r: k.r, a0: Math.atan2(k.start[1] - k.c[1], k.start[0] - k.c[0]), turn: k.turn, length: k.r * Math.abs(k.turn), corner: k });
    from = k.end;
}
AddLine(from, [0, 0]);
let LAP = 0;
for (const piece of pieces) { piece.s0 = LAP; LAP += piece.length; piece.s1 = LAP; }
for (const k of corners) { const arc = pieces.find(p => p.corner === k); k.s0 = arc.s0; k.s1 = arc.s1; }
const Corner = name => corners.find(k => k.name === name);
const Wrap = s => ((s % LAP) + LAP) % LAP;
const PieceAt = s => pieces.find(p => s >= p.s0 && s <= p.s1) ?? pieces.at(-1);
/** The middle line at s: point and direction of travel. */
function At(s) {
    s = Wrap(s);
    const piece = PieceAt(s), f = s - piece.s0;
    if (piece.kind === "line") return { p: [piece.a[0] + piece.d[0] * f, piece.a[1] + piece.d[1] * f], d: piece.d };
    const side = Math.sign(piece.turn), a = piece.a0 + side * (f / piece.r);
    return { p: [piece.c[0] + piece.r * Math.cos(a), piece.c[1] + piece.r * Math.sin(a)], d: [-Math.sin(a) * side, Math.cos(a) * side] };
}
/** A world point s along, t across (left positive), z up. */
function P(s, t, z) {
    const { p, d } = At(s), n = Left2(d);
    return [p[0] + n[0] * t, p[1] + n[1] * t, z];
}
const Heading = s => { const { d } = At(s); return Math.atan2(d[1], d[0]); };
// The second pass through the crossing: on the diagonal D -> E.
const CROSSING_UNDER = (() => { const line = pieces.find(p => p.s0 === Corner("D").s1); return line.s0 + Math.hypot(line.a[0], line.a[1]); })();

// --- Where everything goes, in s ---
const HALF = TRACK_WIDTH / 2;
const START = Corner("B").s1 + 128; // the start/finish line, on the right loop's long side, before the tabletop: a heat starts slow, the tabletop forgives that
const START_SPAWN = Corner("B").s1 + 24;
const HILLS = [ // [name, s of its foot, pieces]
    ["tabletop", Corner("B").s1 + 224, TABLETOP],
    ["step_up", CROSSING_UNDER + HALF + BANDE.thickness + 40, STEP_UP],
    ["double", Corner("F").s1 + 96, DOUBLE],
];
const WHOOPS = [ // [name, s of the first wave, waves]
    ["whoops_diagonal", Corner("D").s1 + 100, 7], // straight into the crossing
    ["whoops_top", Corner("A").s1 + 40, 4], // the last before the finish
];
const KICKER_FOOT = LAP - KICKER_GAP_MIDDLE; // on the diagonal H -> A, the gap's middle on the crossing
const CHECKPOINTS = [ // the middles of the short straights between the corners, one per stretch that could be cut through the crossing
    (Corner("C").s1 + Corner("D").s0) / 2,
    (Corner("E").s1 + Corner("F").s0) / 2,
    (Corner("G").s1 + Corner("H").s0) / 2,
];

/** Throws unless s0..s1 lies on one straight: a jump on a curve throws a melon off the track. */
function OnStraight(what, s0, s1) {
    const a = PieceAt(Wrap(s0)), b = PieceAt(Wrap(s1));
    const line = a.kind === "line" && a === b;
    const across = a.kind === "line" && b.kind === "line" && Wrap(s0) > Wrap(s1) && a === pieces.at(-1) && b === pieces[0]; // over the lap's start: the two halves of one diagonal
    if (!line && !across) throw new Error(`${what} (s ${Math.round(s0)}..${Math.round(s1)}) doesn't fit on one straight: move it or the corners`);
}

// --- Geometry helpers ---
let mesh;
/** A flat-shaded triangle facing `out`. */
function TriOut(a, b, c, out, part) {
    if (V3.Dot(V3.Cross(V3.Sub(b, a), V3.Sub(c, a)), out) < 0) [b, c] = [c, b];
    mesh.Tri(a, b, c, part);
}
const QuadOut = ([a, b, c, d], out, part) => { TriOut(a, b, c, out, part); TriOut(a, c, d, out, part); };
/**
 * A hill piece on a straight, a closed solid of its own: the profile
 * ([u, z], starting and ending at z 0) from s0 on, the track's whole width.
 */
function ProfileSolid(s0, profile, topPart, part) {
    const { p, d } = At(s0), n = Left2(d);
    const W = (u, t, z) => [p[0] + d[0] * u + n[0] * t, p[1] + d[1] * u + n[1] * t, z];
    mesh.NewShell();
    for (let i = 0; i + 1 < profile.length; i++) {
        const [u0, z0] = profile[i], [u1, z1] = profile[i + 1];
        if (Math.hypot(u1 - u0, z1 - z0) < 1e-6) continue;
        const out = V3.Add(V3.Scale([d[0], d[1], 0], -(z1 - z0)), [0, 0, u1 - u0]);
        QuadOut([W(u0, -HALF, z0), W(u1, -HALF, z1), W(u1, HALF, z1), W(u0, HALF, z0)], out, u1 > u0 ? topPart : part);
    }
    const [uEnd] = profile.at(-1), [uStart] = profile[0];
    QuadOut([W(uStart, -HALF, 0), W(uEnd, -HALF, 0), W(uEnd, HALF, 0), W(uStart, HALF, 0)], [0, 0, -1], part);
    const tris = earcut(profile.flat(), null, 2);
    for (const side of [-1, 1]) {
        const out = [n[0] * side, n[1] * side, 0];
        for (let i = 0; i < tris.length; i += 3) TriOut(...[tris[i], tris[i + 1], tris[i + 2]].map(k => W(profile[k][0], side * HALF, profile[k][1])), out, part);
    }
}
const S = 10; // Clipper works on integers
const ToClipper = c => c.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
/** A PolyTree as shapes { outer CCW, holes CW }. */
function Shapes(tree) {
    const out = [];
    const Pts = node => node.Contour().map(p => [p.X / S, p.Y / S]);
    const Walk = node => {
        for (const outer of node.Childs()) {
            const c = Pts(outer);
            const shape = { outer: Area(c) > 0 ? c : [...c].reverse(), holes: [] };
            for (const hole of outer.Childs()) {
                const h = Pts(hole);
                shape.holes.push(Area(h) < 0 ? h : [...h].reverse());
                Walk(hole);
            }
            out.push(shape);
        }
    };
    Walk(tree);
    return out;
}
/** The middle line as one closed polyline. */
function MiddleLine() {
    const pts = [];
    for (const piece of pieces) {
        const n = piece.kind === "line" ? 1 : Math.max(2, Math.ceil(Math.abs(piece.turn) * 180 / Math.PI / ARC_STEP));
        for (let i = 0; i < n; i++) pts.push(At(piece.s0 + (piece.length * i) / n).p);
    }
    return pts;
}
/** The band `half` to each side of the middle line (the crossing one region), as a PolyTree. */
function Band(half) {
    const offset = new ClipperLib.ClipperOffset(2, BANDE_ARC_TOLERANCE * S);
    offset.AddPath(ToClipper(MiddleLine()), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedLine);
    const tree = new ClipperLib.PolyTree();
    offset.Execute(tree, half * S);
    return tree;
}
function Difference(a, b) {
    const clipper = new ClipperLib.Clipper();
    const Paths = tree => ClipperLib.Clipper.PolyTreeToPaths(tree);
    clipper.AddPaths(Paths(a), ClipperLib.PolyType.ptSubject, true);
    clipper.AddPaths(Paths(b), ClipperLib.PolyType.ptClip, true);
    const tree = new ClipperLib.PolyTree();
    clipper.Execute(ClipperLib.ClipType.ctDifference, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    return tree;
}
function Extrude(shapes, z0, z1, part, topPart = part) {
    for (const shape of shapes) { mesh.NewShell(); mesh.Extrude([shape], z0, z1, part, "z", topPart); }
}
/**
 * The stadium's rounded rectangle grown by `grow`, counter-clockwise from the
 * bottom edge at x = gap / 2 round to x = -gap / 2 (gap 0: closed all round).
 */
function StadiumOutline(grow, gap = 0) {
    const hx = FLOOR.halfX + grow, hy = FLOOR.halfY + grow, r = FLOOR.radius + grow;
    const pts = [[gap / 2, -hy]];
    for (const [cx, cy, a0] of [[hx - r, -hy + r, -90], [hx - r, hy - r, 0], [-hx + r, hy - r, 90], [-hx + r, -hy + r, 180]]) {
        for (let i = 0; i <= CORNER_SEGMENTS; i++) {
            const a = ((a0 + (90 * i) / CORNER_SEGMENTS) * Math.PI) / 180;
            pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
    }
    if (gap) pts.push([-gap / 2, -hy]);
    return pts;
}
/** A ring of the stadium between grow0 and grow1, open at the tunnel: a C-shaped outline. */
const StadiumRing = (grow0, grow1) => [...StadiumOutline(grow1, TUNNEL.width), ...StadiumOutline(grow0, TUNNEL.width).reverse()];

// --- What to place in Hammer, printed at the end ---
const notes = [];
const fmt = p => p.map(n => Math.round(n)).join(" ");
const Yaw = s => Math.round((Heading(s) * 180) / Math.PI);
const NoteAt = (what, s) => notes.push(`${what}: at ${fmt(P(s, 0, 0))}, yaw ${Yaw(s)}`);

// --- Sections ---
function Floor() {
    Extrude([{ outer: StadiumOutline(0), holes: [] }], -FLOOR.depth, 0, "dirt");
    const bandOuter = Shapes(Band(HALF + BANDE.thickness));
    const islands = bandOuter.flatMap(s => s.holes).map(h => ({ outer: [...h].reverse(), holes: [] }));
    Extrude(islands, 0, ISLAND_HEIGHT, "grass");
    const standsDepth = STAND.wall + STAND.tiers * STAND.depth + STAND.back;
    mesh.NewShell();
    AxisBox(mesh, [-TUNNEL.width / 2, -FLOOR.halfY - standsDepth, -FLOOR.depth], [TUNNEL.width / 2, -FLOOR.halfY, 0], "dirt");
    notes.push(`tunnel to the hub: its open end ${TUNNEL.width} wide at ${fmt([0, -FLOOR.halfY - standsDepth, 0])}, facing -Y`);
}
function Banden() {
    const walls = Shapes(Difference(Band(HALF + BANDE.thickness), Band(HALF)));
    Extrude(walls, 0, BANDE.height, "bande", "bande_top");
}
function Hills() {
    for (const [name, s0, profile] of HILLS) {
        const length = Math.max(...profile.flat().map(([u]) => u));
        OnStraight(name, s0, s0 + length);
        for (const piece of profile) ProfileSolid(s0, piece, "hill", "hill_side");
        notes.push(`${name}: foot at ${fmt(P(s0, 0, 0))}, ${length} long, yaw ${Yaw(s0)}`);
    }
}
function Whoops() {
    for (const [name, s0, waves] of WHOOPS) {
        OnStraight(name, s0, s0 + waves * WHOOP.length);
        for (let w = 0; w < waves; w++) {
            const profile = Array.from({ length: WHOOP.samples + 1 }, (_, i) => {
                const u = (WHOOP.length * i) / WHOOP.samples;
                return [w * WHOOP.length + u, (WHOOP.height / 2) * (1 - Math.cos((2 * Math.PI * i) / WHOOP.samples))];
            });
            ProfileSolid(s0, profile, w % 2 ? "hill" : "whoop", "hill_side");
        }
        notes.push(`${name}: ${waves} waves from ${fmt(P(s0, 0, 0))}, yaw ${Yaw(s0)}`);
    }
}
function Crossing() {
    const length = Math.max(...KICKER.flat().map(([u]) => u));
    OnStraight("kicker", KICKER_FOOT, KICKER_FOOT + length);
    for (const piece of KICKER) ProfileSolid(KICKER_FOOT, piece, "kicker", "hill_side");
    notes.push(`kicker: foot at ${fmt(P(KICKER_FOOT, 0, 0))}, yaw ${Yaw(KICKER_FOOT)}; the other lane passes the gap (${KICKER[1][0][0] - KICKER[0].at(-1)[0]} long) at the origin`);
}
function Berms() {
    for (const k of corners.filter(k => k.r === RADIUS.tight)) {
        const side = k.turn < 0 ? 1 : -1; // the outside: left on a right turn
        const s0 = k.s0, s1 = k.s1, n = Math.ceil(Math.abs(k.turn) * 180 / Math.PI / ARC_STEP);
        const Height = s => { const e = Math.min(1, (s - s0) / BERM.rampIn, (s1 - s) / BERM.rampIn); const f = Math.max(0, e); return Math.max(1, BERM.height * f * f * (3 - 2 * f)); };
        const rows = Array.from({ length: n + 1 }, (_, i) => {
            const s = s0 + ((s1 - s0) * i) / n, h = Height(s);
            return { s, inner: P(s, side * BERM.inner, 0), outer: P(s, side * HALF, 0), top: P(s, side * HALF, h) };
        });
        mesh.NewShell();
        for (let i = 0; i < n; i++) {
            const a = rows[i], b = rows[i + 1], out = (s, t) => V3.Sub(P(s, t, 0), P(s, 0, 0));
            const mid = (a.s + b.s) / 2;
            QuadOut([a.inner, b.inner, b.top, a.top], V3.Add(out(mid, -side), [0, 0, 1]), "hill");
            QuadOut([a.outer, b.outer, b.top, a.top], out(mid, side), "hill_side");
            QuadOut([a.inner, b.inner, b.outer, a.outer], [0, 0, -1], "hill_side");
        }
        const [first, last] = [rows[0], rows.at(-1)];
        const dir = s => { const { d } = At(s); return [d[0], d[1], 0]; };
        TriOut(first.inner, first.outer, first.top, V3.Scale(dir(s0), -1), "hill_side");
        TriOut(last.inner, last.outer, last.top, dir(s1), "hill_side");
        notes.push(`berm in corner ${k.name}: ${BERM.height} high at the outer edge`);
    }
}
function Stadium() {
    const ring = (g0, g1, z1, top) => Extrude([{ outer: StadiumRing(g0, g1), holes: [] }], 0, z1, "concrete", top);
    ring(0, STAND.wall, STAND.wallHeight, "bande_top");
    for (let i = 0; i < STAND.tiers; i++) {
        const g0 = STAND.wall + i * STAND.depth;
        ring(g0, g0 + STAND.depth, STAND.wallHeight + STAND.rise * (i + 1), i % 2 ? "seat_white" : "seat_red");
    }
    const back = STAND.wall + STAND.tiers * STAND.depth;
    const top = STAND.wallHeight + STAND.rise * STAND.tiers + STAND.backAbove;
    ring(back, back + STAND.back, top, "concrete");
    // The tunnel through the stands: its side walls and roof (its floor is in the floor section).
    const y0 = -FLOOR.halfY - back - STAND.back, y1 = -FLOOR.halfY;
    for (const sign of [-1, 1]) {
        mesh.NewShell();
        const x = sign * TUNNEL.width / 2;
        AxisBox(mesh, [Math.min(x, x + sign * STAND.wall), y0, 0], [Math.max(x, x + sign * STAND.wall), y1, TUNNEL.height + TUNNEL.roof], "concrete");
    }
    mesh.NewShell();
    AxisBox(mesh, [-TUNNEL.width / 2, y0, TUNNEL.height], [TUNNEL.width / 2, y1, TUNNEL.height + TUNNEL.roof], "concrete");
    // Floodlight masts behind the stands' corners, their heads facing the middle.
    const reach = FLOOR.radius + back + STAND.back + 120;
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const base = [sx * (FLOOR.halfX - FLOOR.radius + reach * Math.SQRT1_2), sy * (FLOOR.halfY - FLOOR.radius + reach * Math.SQRT1_2)];
        mesh.NewShell();
        AxisBox(mesh, [base[0] - MAST.size / 2, base[1] - MAST.size / 2, 0], [base[0] + MAST.size / 2, base[1] + MAST.size / 2, MAST.height], "steel");
        const ax = V3.Unit([-base[0], -base[1], 0]), az = [0, 0, 1], ay = V3.Cross(az, ax);
        const head = [base[0] + ax[0] * MAST.head[0] * 2, base[1] + ax[1] * MAST.head[0] * 2, MAST.height];
        mesh.NewShell();
        Box(mesh, head, [ax, ay, az], MAST.head, "steel");
        mesh.NewShell();
        Box(mesh, V3.Add(head, V3.Scale(ax, MAST.head[0] + 1)), [ax, ay, az], [1, MAST.head[1] - 8, MAST.head[2] - 8], "lamp");
        notes.push(`floodlight: light_spot at ${fmt(V3.Add(head, V3.Scale(ax, MAST.head[0] + 8)))}, aimed at the middle`);
    }
}

const SECTIONS = {
    "01_floor": Floor,
    "02_banden": Banden,
    "03_hills": Hills,
    "04_whoops": Whoops,
    "05_crossing": Crossing,
    "06_berms": Berms,
    "07_stadium": Stadium,
};

const COLORS = {
    dirt: [0x7a, 0x52, 0x32], // the track and the floor round it
    hill: [0x9c, 0x6c, 0x40], // packed dirt on the hills' tops: lighter, so a hill reads from afar
    whoop: [0x8a, 0x5e, 0x36], // every other wave darker: the rhythm shows
    hill_side: [0x5e, 0x3e, 0x26],
    kicker: [0xb8, 0x84, 0x52],
    grass: [0x4a, 0x7a, 0x30],
    bande: [0xf0, 0xf0, 0xec], // the boards' faces
    bande_top: [0x1f, 0x5f, 0xc8],
    concrete: [0x8c, 0x8a, 0x86],
    seat_red: [0xc8, 0x2a, 0x2a],
    seat_white: [0xe6, 0xe6, 0xe2],
    steel: [0x5a, 0x60, 0x68],
    lamp: [0xff, 0xf6, 0xd8],
};
const GLOW = { lamp: 3 };

const NAME = "motocross";
const MATERIAL_DIR = `materials/melon_racer/${NAME}`;
const MODEL_DIR = `models/melon_racer/${NAME}`;
const GENERATOR = "tools/models/make-motocross-model.mjs";
const only = process.argv[2];
const keys = Object.keys(SECTIONS).filter(key => !only || key === only || key.slice(3) === only);
if (keys.length === 0) throw new Error(`no section "${only}" - one of ${Object.keys(SECTIONS).join(", ")}`);
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
// Materials first: Hammer compiles a new .dmx's materials on import and caches an ERROR one for a missing .vmat.
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, glow: GLOW[part] ?? 0 }));
}
let triangles = 0;
for (const key of keys) {
    mesh = new Mesh(128);
    SECTIONS[key]();
    const used = Object.fromEntries(Object.keys(mesh.tris).map(part => [part, materials[part]]));
    WriteAddonFile(`${MODEL_DIR}/${NAME}_${key}.dmx`, DmxText(mesh, `${NAME}_${key}`, used));
    console.log(`  ${key}: ${mesh.triangleCount} triangles`);
    triangles += mesh.triangleCount;
}
NoteAt("start_gate (override start_5_laps3) + finish_gate (finish_5) on the same line", START);
NoteAt("start_spawn_5 (the start gate's own start_spawn: move it here, behind the line)", START_SPAWN);
CHECKPOINTS.forEach((s, i) => NoteAt(`checkpoint_gate ${i + 1} (override checkpoint_5_${i + 1})`, s));
console.log(`${NAME}: ${triangles} triangles; lap ${Math.round(LAP)} long, track ${TRACK_WIDTH} wide; stadium floor ${2 * FLOOR.halfX} x ${2 * FLOOR.halfY}`);
console.log("place in Hammer (world positions relative to where the .dmx files' shared origin lands; yaw = the direction of travel there):");
for (const note of notes) console.log(`  ${note}`);
console.log(`import: Hammer, File > Import > ${MODEL_DIR}/${NAME}_<section>.dmx, every one at the same position (origin: the crossing, at floor level)`);
