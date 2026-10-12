// Builds a half-pipe slide as mesh geometry for Hammer —
// `node tools/models/make-half-pipe-model.mjs`: a U-shaped shell (a half
// circle across, ARC_HALF_ANGLE up each side) running down along +X, like a
// playground slide that ends in a drop and a kicker:
//   1. the slide: LENGTH along X, DROP down, level at both ends (smootherstep),
//   2. a curve (ENTRY_RADIUS) over the edge into
//   3. the drop: STEEP_ANGLE steep, the curves at both its ends included
//      STEEP_DROP down to the lowest point,
//   4. a wide curve (BOTTOM_RADIUS) at the bottom, out of the drop through
//      level and on up to KICK_ANGLE,
//   5. the kicker: KICK_LENGTH straight on at KICK_ANGLE up, open at its end.
// A rounded white lip along both edges, graphite legs under the slide and
// the bottom curve, down to the floor under the lowest point.
// Writes
//   models/melon_racer/half_pipe.dmx  for Hammer's File → Import: edit it like any
//                                     mesh, collision from the mesh itself
//   materials/melon_racer/half_pipe/half_pipe_<part>.vmat (+ _color.png)
// Origin: under the top end, the middle of the channel, at the height of the
// floor under the lowest point (the bottom curve's underside); the slide runs
// down along +X. Its inner surface counts as a wall (melons bounce off it)
// where it's steeper than 60 degrees from level (WALL_NORMAL_MAX_Z 0.5): the
// top (ARC_HALF_ANGLE - 60) degrees of each side, and the whole drop's
// bottom once STEEP_ANGLE is over 60.
import earcut from "earcut";
import { DmxText, Mesh, SolidPng, V3, VmatText, WriteAddonFile } from "../lib/model.mjs";

// --- The path ---
const LENGTH = 1024; // 1. the slide, along X
const DROP = 256; // its drop
const ENTRY_RADIUS = 320; // 2. the curve over the edge: a melon coming off the slide at speed flies a little before it lands in the drop
const STEEP_ANGLE = 58; // 3. the drop, degrees down from level: up to 60 it still counts as a floor (WALL_NORMAL_MAX_Z), steeper melons bounce off it as off a wall
const STEEP_DROP = 1000; // from the drop's top edge down to the lowest point
const BOTTOM_RADIUS = 512; // 4. wide: at the bottom a melon is fast (~1400 u/s), a tight curve would read as an impact
const KICK_ANGLE = 15; // 5. the kicker, degrees up
const KICK_LENGTH = 96;
const PATH_STEP = 40; // along the curves between rings (straight pieces need none in between)
const SLIDE_STEP = 64; // along X on the slide: its slope changes slowly

// --- The channel ---
const RADIUS = 64; // the channel's inside: a melon is ~14 across
const ARC_HALF_ANGLE = 90; // degrees up each side from the bottom: 90 = a full half pipe
const THICKNESS = 6; // the shell
const ARC_SEGMENTS = 16; // across the channel, inside: the lowest that still looks round at play distance
const OUTSIDE_SEGMENTS = 8; // the outside, seen from below and far off
const LIP_SEGMENTS = 4; // round the lip, half a circle
const LEG = { every: 192, size: 8, minHeight: 12, maxSlope: 25 }; // a leg every `every` units along X where the shell is at most maxSlope degrees steep

const COLORS = {
    slide: [0x3a, 0x8d, 0xff], // sky blue playground plastic: off-palette on purpose (not heal cyan)
    lip: [0xf2, 0xf4, 0xf5],
    leg: [0x2b, 0x30, 0x38], // graphite
};

const NAME = "half_pipe";
const MATERIAL_DIR = "materials/melon_racer/half_pipe";
const GENERATOR = "tools/models/make-half-pipe-model.mjs";
const Rad = d => (d * Math.PI) / 180;

// --- The path as stations: { x, z, h } — the channel's inside bottom and its heading (radians, up positive) ---
/** 1. The slide's height at x (from its own end), level at both ends. */
const SlideZ = x => {
    const s = Math.min(1, Math.max(0, x / LENGTH));
    return DROP * (1 - s * s * s * (s * (6 * s - 15) + 10));
};
const stations = [];
const slideSteps = Math.round(LENGTH / SLIDE_STEP);
for (let i = 0; i <= slideSteps; i++) {
    const x = (LENGTH * i) / slideSteps, d = 0.5;
    stations.push({ x, z: SlideZ(x), h: Math.atan2(SlideZ(x + d) - SlideZ(x - d), 2 * d) });
}
/** An arc from the last station turning from heading h0 to h1 (radians) with radius r: down-turning (h1 < h0) or up-turning. */
function AddArc(h1, r) {
    const start = stations.at(-1), h0 = start.h, sign = h1 < h0 ? -1 : 1;
    // The center sits off the path, to the left of the heading for an up-turn, right for a down-turn.
    const cx = start.x - sign * r * Math.sin(h0), cz = start.z + sign * r * Math.cos(h0);
    const n = Math.max(2, Math.ceil((Math.abs(h1 - h0) * r) / PATH_STEP));
    for (let i = 1; i <= n; i++) {
        const h = h0 + ((h1 - h0) * i) / n;
        stations.push({ x: cx + sign * r * Math.sin(h), z: cz - sign * r * Math.cos(h), h });
    }
}
/** A straight piece on from the last station along its heading: one ring at its end. */
function AddStraight(length) {
    const start = stations.at(-1);
    stations.push({ x: start.x + length * Math.cos(start.h), z: start.z + length * Math.sin(start.h), h: start.h });
}
const steep = Rad(STEEP_ANGLE), kick = Rad(KICK_ANGLE);
// The drop's straight part: what's left of STEEP_DROP after the two curves' share of it.
const curvesDrop = ENTRY_RADIUS * (1 - Math.cos(steep)) + BOTTOM_RADIUS * (1 - Math.cos(steep));
const steepLength = (STEEP_DROP - curvesDrop) / Math.sin(steep);
if (steepLength < 0) throw new Error(`STEEP_DROP ${STEEP_DROP} is less than the curves alone drop (${curvesDrop.toFixed(0)}): lower the radii`);
AddArc(-steep, ENTRY_RADIUS);
AddStraight(steepLength);
AddArc(kick, BOTTOM_RADIUS);
AddStraight(KICK_LENGTH);
// Origin: the floor under the lowest point, the shell's underside there resting on it.
const lowest = Math.min(...stations.map(s => s.z));
for (const s of stations) s.z += THICKNESS - lowest;

/** A station's point and frame: t along the path, up across it (y is always sideways). */
const Frame = ({ x, z, h }) => ({ p: [x, 0, z], t: [Math.cos(h), 0, Math.sin(h)], up: [-Math.sin(h), 0, Math.cos(h)] });

// --- The cross-section in (y, z) around the channel's bottom, z up ---
const a0 = Rad(ARC_HALF_ANGLE);
const Arc = (r, from, to, n) => Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return [r * Math.sin(a), RADIUS - r * Math.cos(a)];
});
const inside = Arc(RADIUS, -a0, a0, ARC_SEGMENTS);
const outside = Arc(RADIUS + THICKNESS, a0, -a0, OUTSIDE_SEGMENTS);
/** The lip at one end of the arc (side +1 right, -1 left): half a circle over the top from the inside's edge to the outside's, without those two. */
function Lip(side) {
    const r = THICKNESS / 2, mid = RADIUS + r;
    const c = [side * mid * Math.sin(a0), RADIUS - mid * Math.cos(a0)];
    const out = [side * Math.sin(a0), -Math.cos(a0)]; // away from the arc's center, at the edge
    const up = [side * Math.cos(a0), Math.sin(a0)]; // on along the arc, out of the channel
    return Array.from({ length: LIP_SEGMENTS - 1 }, (_, i) => {
        const b = (Math.PI * (i + 1)) / LIP_SEGMENTS;
        return [0, 1].map(k => c[k] - out[k] * r * Math.cos(b) + up[k] * r * Math.sin(b));
    });
}

/** The section's points at a station, placed in the path's frame. */
const Place = (station, section) => {
    const { p, up } = Frame(station);
    return section.map(([y, z]) => V3.Add(V3.Add(p, [0, y, 0]), V3.Scale(up, z)));
};

const mesh = new Mesh(128);
// Every surface's columns run round the section in one direction (inside left
// to right, right lip, outside right to left, left lip), its rows down the
// path: so they all face out of the shell with `flip`.
const ring = [...inside, ...Lip(1), ...outside, ...Lip(-1).reverse()]; // each Lip runs from the inside edge out
const pathLength = stations.reduce((sum, s, i) => sum + (i ? Math.hypot(s.x - stations[i - 1].x, s.z - stations[i - 1].z) : 0), 0);
const Sweep = (section, part) => mesh.Surface(stations.map(s => Place(s, section)), part, { flip: true, uvScale: [1, pathLength / 128] });
Sweep(inside, "slide");
Sweep(outside, "slide");
Sweep([inside.at(-1), ...Lip(1), outside[0]], "lip");
Sweep([outside.at(-1), ...Lip(-1).reverse(), inside[0]], "lip");
// The two ends: flat caps across the shell, facing back up the path at the top and on along it at the kicker.
for (const [station, facing] of [[stations[0], -1], [stations.at(-1), 1]]) {
    const points = Place(station, ring), out = V3.Scale(Frame(station).t, facing);
    const tris = earcut(ring.flat(), null, 2);
    for (let i = 0; i < tris.length; i += 3) {
        let [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]].map(k => points[k]);
        if (V3.Dot(V3.Cross(V3.Sub(b, a), V3.Sub(c, a)), out) < 0) [b, c] = [c, b];
        mesh.Tri(a, b, c, "slide");
    }
}
// Legs: from the floor up into the shell's underside, where it isn't too steep.
let legs = 0;
for (let x = LEG.every / 2; x < stations.at(-1).x; x += LEG.every) {
    // The last station at or before x on the way down: the shell above the floor there (the drop overhangs nothing: maxSlope).
    const s = stations.findLast((st, i) => st.x <= x && (i + 1 === stations.length || stations[i + 1].x > x));
    if (!s || Math.abs(s.h) > Rad(LEG.maxSlope)) continue;
    const underside = s.z - THICKNESS / Math.cos(s.h);
    if (underside < LEG.minHeight) continue;
    const half = LEG.size / 2;
    mesh.Extrude([{ outer: [[x - half, -half], [x + half, -half], [x + half, half], [x - half, half]], holes: [] }], 0, underside + 1, "leg", "z");
    legs++;
}

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(mesh, NAME, materials));
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
const end = stations.at(-1);
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles; ${pathLength.toFixed(0)} along the path, ${end.x.toFixed(0)} along X, `
    + `top end ${stations[0].z.toFixed(0)} up, the kicker's lip ${end.z.toFixed(0)} up (at ${KICK_ANGLE} degrees); `
    + `drop ${STEEP_ANGLE} degrees, ${steepLength.toFixed(0)} straight; channel ${2 * RADIUS} across; ${legs} legs`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin under the top end, at the floor under the lowest point)`);
