// Builds low-poly coastal plants for decoration Ã¢â‚¬â€ `node tools/models/make-coast-plant-model.mjs`,
// flat-shaded like the coast rocks (make-coast-rock-model.mjs): foliage is
// faceted blobs Ã¢â‚¬â€ convex polytopes from seeded planes (tools/lib/inflatable.mjs),
// flat underneath Ã¢â‚¬â€, grass single bent blades. Seeded, so every run gives
// the same plants. Variants (VARIANTS):
//   dune_grass   a tuft of marram grass: bent blades, green and straw (both sides drawn), no collision
//   gorse        a gorse bush: green blobs with yellow flower specks; collision its blobs
//   heather      a low heather cushion with purple specks; no collision (melons roll over it)
//   thrift       sea thrift: a green cushion, pink flower balls on it; no collision
//   pine         a wind-bent pine: a trunk leaning downwind (+X), flat needle pads swept that way; collision the trunk
//   pine_small   the same, smaller
//   pine_large   the same, big (~420 high), four pads
//   umbrella_pine a stone pine: a tall trunk forking at the top into a wide flat crown (~400 high)
//   oak          a round deciduous tree: a short trunk, three boughs, a crown of blobs (~330 high)
//   oak_large    the same, big (~500 high)
//   cypress      a tall slim cypress: stacked narrow blobs (~460 high)
//   ice_plant    a hanging carpet of ice plant (Carpobrotus): fleshy green strips over a ledge's edge
//                and down the face below, reddening at some tips, magenta flowers on it (192 wide, ~160 down)
//   ice_plant_large / ice_plant_small   the same, 256 wide ~320 down / 128 wide ~90 down
//   ivy          ivy running flat down a wall: stems wandering down, side shoots, leaves on both sides (~256 long)
//   ivy_short / ivy_long   the same, ~128 / ~420 long
//   fern         a small fern for a crevice: fronds arching out and drooping, leaflets both sides
//   fern_small   the same, smaller
//   fern_large   a big one (~100 across), longer fronds, some in a darker green
//   fern_upright a shuttlecock fern: fronds standing up in a vase (~45 high)
//   fern_hanging out of a crack in a wall: fronds fanned out towards +X, hanging down (origin in the crack)
//   fern_dry     dried fronds, rust brown, drooping further
//   fern_clump   four ferns of different kinds and colors grown together
//   moss         a low moss cushion (~40 across) for a gap between blocks
//   moss_strip   a long thin moss band (~100 along Y) for a joint between blocks
//   roots        roots hanging over a ledge's edge (under a pine standing at it), tapering, some forking (~120 down)
//   roots_long   the same, ~240 down
// Trees' collision is their trunk (and boughs): crowns are over a melon's head.
// Colors are tinted per prop (render color): a drier or greener coast without new models.
// Origin on the floor under the plant's foot Ã¢â‚¬â€ but the ledge plants (ice_plant, roots):
// on the ledge's edge, its top (z 0) behind it towards -X, the face below it facing +X;
// and ivy: on the wall face (x 0) at its top, hanging down, facing +X. Turn them so +X
// points out of the rock (like the wood scaffold). The wall plants have no collision.
// Writes models/melon_racer/coast/coast_plant_<variant>.vmdl (+ .obj, _physics.obj where solid)
// and materials/melon_racer/coast/coast_plant_<part>.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { Polytope, PolytopePlanes } from "../lib/inflatable.mjs";
import { Mesh, ObjText, SeededRandom, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

const BLOB = { minZ: -0.2, angleJitter: 0.3, depthJitter: 0.12 }; // foliage blobs: facets spread like the rocks'
const TRUNK_SIDES = 5; // round enough at play distance

/**
 * A faceted blob: a polytope over the ellipsoid `half` around `at`, its
 * bottom cut flat `flat` (share of its half height) under its middle.
 */
function Blob(mesh, physics, at, half, planes, seed, part) {
    const cut = PolytopePlanes({ half, lift: 0, seed }, { count: planes, minZ: BLOB.minZ, angleJitter: BLOB.angleJitter, depthJitter: BLOB.depthJitter, sink: half[2] * 0.6 });
    for (const { corners } of Polytope(cut)) {
        const p = corners.map(c => V3.Add(c, at));
        for (let i = 1; i + 1 < p.length; i++) {
            mesh.Tri(p[0], p[i], p[i + 1], part);
            physics?.Tri(p[0], p[i], p[i + 1], part);
        }
    }
}
/** A small four-sided speck (a flower) at p, size r, pointing along n. */
function Speck(mesh, p, n, r, part) {
    const side = V3.Unit(V3.Cross(n, Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), other = V3.Cross(n, side);
    const tip = V3.Add(p, V3.Scale(n, r * 1.2));
    const base = [0, 1, 2].map(k => V3.Add(p, V3.Add(V3.Scale(side, r * Math.cos((2 * Math.PI * k) / 3)), V3.Scale(other, r * Math.sin((2 * Math.PI * k) / 3)))));
    for (let k = 0; k < 3; k++) mesh.Tri(base[k], base[(k + 1) % 3], tip, part);
}
/** Specks scattered over the upper half of the ellipsoid `half` round `at`. */
function Specks(mesh, random, at, half, count, size, part) {
    for (let i = 0; i < count; i++) {
        const a = random() * 2 * Math.PI, z = 0.15 + 0.8 * random(), r = Math.sqrt(1 - z * z);
        const n = V3.Unit([r * Math.cos(a) / half[0], r * Math.sin(a) / half[1], z / half[2]]);
        const p = V3.Add(at, [r * Math.cos(a) * half[0], r * Math.sin(a) * half[1], z * half[2]]); // on the ellipsoid: the facets bulge past it, the speck pokes out of them
        Speck(mesh, p, n, size, part);
    }
}
/** One grass blade from its foot `p`, `height` tall, bending `lean` along `dir` Ã¢â‚¬â€ three triangles, drawn on both sides. */
function Blade(mesh, p, dir, height, lean, width, part) {
    const side = [-dir[1], dir[0], 0];
    const At = (f, w) => V3.Add(p, V3.Add(V3.Add(V3.Scale(dir, lean * f * f), [0, 0, height * f]), V3.Scale(side, w)));
    const a = At(0, -width), b = At(0, width), c = At(0.55, width * 0.6), d = At(0.55, -width * 0.6), tip = At(1, 0);
    for (const [x, y, z] of [[a, b, c], [a, c, d], [d, c, tip]]) { mesh.Tri(x, y, z, part); mesh.Tri(x, z, y, part); }
}

function DuneGrass() {
    const mesh = new Mesh(64), random = SeededRandom(31);
    for (let i = 0; i < 11; i++) {
        const a = (2 * Math.PI * i) / 11 + random() * 0.5, r = 4 + 6 * random();
        const dir = [Math.cos(a), Math.sin(a), 0];
        Blade(mesh, [dir[0] * r, dir[1] * r, -1], dir, 30 + 22 * random(), 10 + 12 * random(), 1.6, i % 3 ? "grass" : "straw");
    }
    return { mesh };
}

function Gorse() {
    const mesh = new Mesh(64), physics = new Mesh(), random = SeededRandom(41);
    const blobs = [{ at: [0, 0, 24], half: [34, 30, 26], seed: 2 }, { at: [26, 14, 16], half: [24, 22, 18], seed: 5 }, { at: [-20, 18, 14], half: [22, 20, 16], seed: 9 }];
    for (const b of blobs) {
        Blob(mesh, physics, b.at, b.half, 11, b.seed, "leaf");
        Specks(mesh, random, b.at, b.half, 7, 5, "yellow");
    }
    return { mesh, physics };
}

function Heather() {
    const mesh = new Mesh(64), random = SeededRandom(43);
    const blobs = [{ at: [0, 0, 8], half: [36, 30, 14], seed: 3 }, { at: [30, -10, 6], half: [24, 20, 10], seed: 6 }];
    for (const b of blobs) {
        Blob(mesh, null, b.at, b.half, 10, b.seed, "heath");
        Specks(mesh, random, b.at, b.half, 9, 4, "purple");
    }
    return { mesh };
}

function Thrift() {
    const mesh = new Mesh(64), random = SeededRandom(47);
    Blob(mesh, null, [0, 0, 5], [22, 20, 9], 9, 4, "grass");
    for (let i = 0; i < 6; i++) { // flower balls on short stems
        const a = (2 * Math.PI * i) / 6 + random() * 0.6, r = 6 + 9 * random(), top = 16 + 8 * random();
        const foot = [Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, 6], head = [Math.cos(a) * r, Math.sin(a) * r, top];
        Blade(mesh, foot, V3.Unit([head[0] - foot[0], head[1] - foot[1], 0.001]), top - 6, Math.hypot(head[0] - foot[0], head[1] - foot[1]), 0.6, "grass");
        Blob(mesh, null, head, [3.5, 3.5, 3.5], 6, 10 + i, "pink");
    }
    return { mesh };
}

/** A wind-bent pine: `height` tall, the trunk leaning `lean` downwind (+X), needle pads swept that way. */
function Pine({ height, lean, radius, pads, seed }) {
    const mesh = new Mesh(64), physics = new Mesh(), random = SeededRandom(seed);
    const Trunk = f => [lean * f * f, 4 * Math.sin(f * 5), height * f]; // bending further over the higher it gets
    const centers = Array.from({ length: 5 }, (_, i) => Trunk(i / 4));
    const R = i => radius * (1 - 0.55 * (i / 4));
    mesh.Tube(centers, R, TRUNK_SIDES, "bark");
    physics.Tube(centers, R, TRUNK_SIDES, "bark");
    // Branches: short stubs from the trunk downwind, each holding a pad.
    for (const [i, pad] of pads.entries()) {
        const foot = Trunk(pad.on), end = V3.Add(foot, [pad.reach, (random() - 0.5) * 30, pad.rise]);
        mesh.Tube([foot, end], radius * 0.35, 4, "bark", false);
        Blob(mesh, null, V3.Add(end, [pad.half[0] * 0.3, 0, 0]), pad.half, 10, seed + i, "needle");
    }
    return { mesh, physics };
}

/**
 * A tree with a crown of blobs: a trunk `height` tall (radius `radius`,
 * leaning `lean` along +X), boughs from its top (each [angle, reach, rise]),
 * a blob at each bough's end and `crown` blobs ({ at, half }, from the
 * trunk's top) Ã¢â‚¬â€ all in `part`.
 */
function CrownTree({ height, lean, radius, boughs, crown, seed, part = "leaf" }) {
    const mesh = new Mesh(64), physics = new Mesh();
    const Trunk = f => [lean * f * f, 0, height * f];
    const centers = Array.from({ length: 4 }, (_, i) => Trunk(i / 3));
    const R = i => radius * (1 - 0.4 * (i / 3));
    mesh.Tube(centers, R, TRUNK_SIDES, "bark");
    physics.Tube(centers, R, TRUNK_SIDES, "bark");
    const top = Trunk(1);
    boughs.forEach(([angle, reach, rise, half], i) => {
        const a = (angle * Math.PI) / 180, end = V3.Add(top, [Math.cos(a) * reach, Math.sin(a) * reach, rise]);
        const foot = Trunk(0.85);
        mesh.Tube([foot, end], radius * 0.45, 4, "bark", false);
        physics.Tube([foot, end], radius * 0.45, 4, "bark", false);
        if (half) Blob(mesh, null, end, half, 11, seed + i, part);
    });
    crown.forEach(({ at, half }, i) => Blob(mesh, null, V3.Add(top, at), half, 12, seed + 10 + i, part));
    return { mesh, physics };
}

/** One flat triangle facing `out` (turned round if it doesn't). */
function FrontTri(mesh, a, b, c, part, out) {
    const n = V3.Cross(V3.Sub(b, a), V3.Sub(c, a));
    if (V3.Dot(n, out) >= 0) mesh.Tri(a, b, c, part); else mesh.Tri(a, c, b, part);
}

/**
 * A hanging carpet over a ledge's edge (the edge along Y at the origin, the
 * top z 0 behind it towards -X, the face x 0 below it): strips `step` wide
 * side by side over `width`, `top` deep on the ledge, each hanging down the
 * face its own length (lobes: `drop` times 0.45..1), lumpy Ã¢â‚¬â€ every corner
 * `thick` (jittered) off the rock Ã¢â‚¬â€, ending in a point. The last rows of
 * some strips are `tipPart`; `flowers` specks of `flowerPart` on it.
 */
function Drape({ width, top, drop, thick, step, flowers, seed, part = "succulent", tipPart = "succulent_red", flowerPart = "magenta" }) {
    const mesh = new Mesh(64), random = SeededRandom(seed);
    const lines = Math.round(width / step), phase = random() * 6;
    const corners = new Map();
    // Along a strip s runs from -top (on the ledge) over the edge (0) and down the face; `out` off the rock.
    const Place = (s, y, out) => (s < 0 ? [s, y, out] : s === 0 ? [out * 0.7, y, out * 0.7] : [out, y, -s]);
    const Out = s => (s < 0 ? [0, 0, 1] : s === 0 ? [1, 0, 1] : [1, 0, 0]);
    const Corner = (j, i) => {
        const key = `${j},${i}`;
        if (!corners.has(key)) {
            const s0 = -top + i * step, s = s0 + (i > 0 && s0 !== 0 ? (random() - 0.5) * step * 0.3 : 0);
            const y = -width / 2 + j * (width / lines) + (j > 0 && j < lines ? (random() - 0.5) * step * 0.35 : 0);
            corners.set(key, { p: Place(s, y, thick * (0.6 + 0.8 * random())), s });
        }
        return corners.get(key);
    };
    const spots = [];
    for (let k = 0; k < lines; k++) {
        const lobe = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(k * 0.9 + phase)) * (0.8 + 0.2 * random());
        const rows = Math.max(Math.round((top + drop * lobe) / step), Math.ceil(top / step) + 1);
        const red = random() < 0.5 ? rows - 2 : rows;
        for (let i = 0; i < rows; i++) {
            const a = Corner(k, i), b = Corner(k + 1, i), c = Corner(k + 1, i + 1), d = Corner(k, i + 1);
            const out = Out(a.s), use = i >= red ? tipPart : part;
            FrontTri(mesh, a.p, c.p, b.p, use, out);
            FrontTri(mesh, a.p, d.p, c.p, use, out);
            spots.push({ at: V3.Scale(V3.Add(V3.Add(a.p, b.p), V3.Add(c.p, d.p)), 0.25), out: V3.Unit(out) });
        }
        const a = Corner(k, rows), b = Corner(k + 1, rows), sTip = -top + rows * step + step * 0.7;
        FrontTri(mesh, a.p, Place(sTip, (a.p[1] + b.p[1]) / 2, thick * 0.4), b.p, red < rows ? tipPart : part, Out(sTip));
    }
    for (let i = 0; i < flowers; i++) {
        const { at, out } = spots[Math.floor(random() * spots.length)];
        Speck(mesh, V3.Add(at, V3.Scale(out, 1.5)), out, 3.5 + 1.5 * random(), flowerPart);
    }
    return { mesh };
}

/** An ivy leaf from the stem at `base` along `dir` (in the wall's plane), `r` long: a diamond folded along its middle, its tip off the wall. */
function Leaf(mesh, base, dir, r, part) {
    const perp = [0, -dir[2], dir[1]];
    const At = (along, across, off) => [base[0] + off, base[1] + (dir[1] * along + perp[1] * across) * r, base[2] + (dir[2] * along + perp[2] * across) * r];
    const root = At(0, 0, 0.8), left = At(0.45, 0.55, 1.2), right = At(0.45, -0.55, 1.2), tip = At(1, 0, 2.6);
    FrontTri(mesh, root, left, tip, part, [1, 0, 0]);
    FrontTri(mesh, root, tip, right, part, [1, 0, 0]);
}

/**
 * Ivy on a wall (the face x 0, the origin at its top): `vines` stems from
 * the top wandering down, the middle one `length` long (the others 0.6..1 of
 * it), a side shoot or two each, leaves every LEAF_STEP on alternating sides.
 */
const LEAF_STEP = 9;
const VINE_SEGMENT = 12;
function Ivy({ length, vines, spread, seed }) {
    const mesh = new Mesh(64), random = SeededRandom(seed);
    const Vine = (start, length, heading, shoots) => {
        const points = [start];
        let angle = heading; // in the wall's plane: 0 straight down, positive towards +Y
        for (let d = VINE_SEGMENT; d <= length; d += VINE_SEGMENT) {
            angle = Math.max(-1, Math.min(1, angle * 0.8 + (random() - 0.5) * 0.7));
            points.push(V3.Add(points[points.length - 1], [0, Math.sin(angle) * VINE_SEGMENT, -Math.cos(angle) * VINE_SEGMENT]));
        }
        if (points.length < 2) return;
        for (let i = 0; i + 1 < points.length; i++) { // the stem: a flat strip on the wall
            const w = 1.2 * (1 - (0.5 * i) / points.length), a = V3.Add(points[i], [0.5, 0, 0]), b = V3.Add(points[i + 1], [0.5, 0, 0]);
            const side = V3.Scale(V3.Unit([0, -(b[2] - a[2]), b[1] - a[1]]), w);
            FrontTri(mesh, V3.Sub(a, side), V3.Add(a, side), V3.Add(b, side), "vine", [1, 0, 0]);
            FrontTri(mesh, V3.Sub(a, side), V3.Add(b, side), V3.Sub(b, side), "vine", [1, 0, 0]);
        }
        const along = (points.length - 1) * VINE_SEGMENT;
        for (let d = LEAF_STEP * 0.5, n = 0; d < along; d += LEAF_STEP * (0.8 + 0.4 * random()), n++) {
            const i = Math.min(Math.floor(d / VINE_SEGMENT), points.length - 2), f = d / VINE_SEGMENT - i;
            const at = V3.Add(points[i], V3.Scale(V3.Sub(points[i + 1], points[i]), f));
            const down = V3.Unit(V3.Sub(points[i + 1], points[i])), s = n % 2 ? 1 : -1, tilt = 0.9 + 0.5 * random();
            const dir = [0, down[1] * Math.cos(tilt) - s * down[2] * Math.sin(tilt), down[2] * Math.cos(tilt) + s * down[1] * Math.sin(tilt)];
            Leaf(mesh, at, dir, 6 + 4 * random() * (1 - (0.4 * d) / along), random() < 0.25 ? "ivy_light" : "ivy");
        }
        for (let k = 0; k < shoots; k++) {
            const from = points[Math.floor((0.2 + 0.5 * random()) * (points.length - 1))];
            Vine(from, length * (0.25 + 0.2 * random()), (random() < 0.5 ? -1 : 1) * (0.6 + 0.3 * random()), 0);
        }
    };
    for (let v = 0; v < vines; v++) {
        const y = vines > 1 ? (v / (vines - 1) - 0.5) * spread : 0;
        Vine([0, y + (random() - 0.5) * 8, 0], length * (v === Math.floor(vines / 2) ? 1 : 0.6 + 0.4 * random()), (random() - 0.5) * 0.6, 1);
    }
    return { mesh };
}

/**
 * A fern into `mesh` at `at`: `count` fronds from its foot arching out
 * `reach` and up `height` (`arc`: how far along the frond its top is,
 * `droop`: how much of the height its end gives back), then `fall` further
 * down (a fern hanging out of a wall); fanned out over `fan` radians round
 * +X (2 pi: all round). `segments` leaflets on both sides of each frond
 * (both sides drawn), each frond in one of `parts`.
 */
function FernInto(mesh, random, { count, reach, height, leaflet, segments = 5, arc = 0.8, droop = 0.35, fall = 0, fan = 2 * Math.PI, parts = ["fern"] }, at = [0, 0, 0]) {
    for (let i = 0; i < count; i++) {
        const a = fan >= 2 * Math.PI ? (2 * Math.PI * i) / count + random() * 0.5 : fan * ((i + 0.2 + 0.6 * random()) / count - 0.5);
        const dir = [Math.cos(a), Math.sin(a), 0], side = [-dir[1], dir[0], 0], part = parts.length > 1 ? parts[Math.floor(random() * parts.length)] : parts[0]; // one part: no draw, fern and fern_small stay as they were
        const r = reach * (0.7 + 0.3 * random()), h = height * (0.7 + 0.5 * random()), down = fall ? fall * (0.6 + 0.6 * random()) : 0;
        const Spine = f => V3.Add(at, V3.Add(V3.Scale(dir, r * f), [0, 0, h * Math.sin(Math.PI * f * arc) * (1 - droop * f) - down * f * f]));
        for (let k = 0; k < segments; k++) {
            const f1 = (k + 1) / segments, p0 = Spine(k / segments), p1 = Spine(f1);
            const w = leaflet * Math.sin(Math.PI * (0.15 + 0.85 * f1)) * (k === segments - 1 ? 0.5 : 1) + leaflet * 0.15;
            for (const s of [-1, 1]) {
                const tip = V3.Add(V3.Add(p1, V3.Scale(side, s * w)), [0, 0, -w * 0.35]);
                mesh.Tri(p0, p1, tip, part);
                mesh.Tri(p0, tip, p1, part);
            }
        }
    }
}
function Fern(options) {
    const mesh = new Mesh(64);
    FernInto(mesh, SeededRandom(options.seed), options);
    return { mesh };
}
/** Several ferns in one model: `ferns` ({ at, ...Fern options }), different sizes and colors. */
function FernClump(ferns, seed) {
    const mesh = new Mesh(64), random = SeededRandom(seed);
    for (const { at, ...options } of ferns) FernInto(mesh, random, options, at);
    return { mesh };
}

/** Moss: low flat blobs ({ at, half }), a few lighter specks on them. */
function Moss(blobs, seed) {
    const mesh = new Mesh(64), random = SeededRandom(seed);
    blobs.forEach(({ at, half }, i) => {
        Blob(mesh, null, at, half, 8, seed + i, "moss");
        Specks(mesh, random, at, half, 2, 1.6, "moss_light");
    });
    return { mesh };
}

/**
 * Roots over a ledge's edge (the edge along Y at the origin, the top behind
 * it towards -X, the face below): `count` roots coming out of the ground
 * behind the edge, over it and down the face (0.5..1 of `drop`), wandering a
 * little off the rock, tapering, about half of them forking.
 */
const ROOT_SIDES = 4;
function Roots({ count, drop, width, seed }) {
    const mesh = new Mesh(64), random = SeededRandom(seed);
    const Root = (points, radius) => mesh.Tube(points, i => Math.max(0.6, radius * (1 - i / points.length)), ROOT_SIDES, "root", false);
    for (let i = 0; i < count; i++) {
        const y = (count > 1 ? i / (count - 1) - 0.5 : 0) * width + (random() - 0.5) * 12, r = 3 + 3 * random();
        const length = drop * (0.5 + 0.5 * random()), off = 2 + 4 * random();
        const points = [[-26 - 18 * random(), y, -3], [-10, y + (random() - 0.5) * 8, r * 0.6], [r * 0.5, y, r * 0.5]];
        for (let k = 1; k <= 5; k++) {
            const last = points[points.length - 1];
            points.push([r * 0.6 + off * Math.sin((k / 5) * Math.PI * 0.7) * (0.8 + 0.4 * random()), last[1] + (random() - 0.5) * 7, -length * (k / 5)]);
        }
        Root(points, r);
        if (random() < 0.5) { // a fork off the hanging part
            const from = points[4], len = length * 0.4;
            const s = random() < 0.5 ? -1 : 1;
            Root([from, V3.Add(from, [1.5, s * 6, -len * 0.5]), V3.Add(from, [1 + 2 * random(), s * (8 + 8 * random()), -len])], r * 0.45);
        }
    }
    return { mesh };
}

const VARIANTS = [
    { name: "dune_grass", build: DuneGrass },
    { name: "gorse", build: Gorse },
    { name: "heather", build: Heather },
    { name: "thrift", build: Thrift },
    { name: "pine", build: () => Pine({ height: 260, lean: 90, radius: 9, seed: 51, pads: [
        { on: 1, reach: 40, rise: 8, half: [90, 64, 24] },
        { on: 0.78, reach: 56, rise: 0, half: [64, 50, 18] },
        { on: 0.6, reach: 30, rise: -4, half: [46, 40, 14] },
    ] }) },
    { name: "pine_small", build: () => Pine({ height: 150, lean: 50, radius: 6, seed: 57, pads: [
        { on: 1, reach: 24, rise: 4, half: [56, 42, 16] },
        { on: 0.7, reach: 30, rise: 0, half: [38, 32, 12] },
    ] }) },
    { name: "pine_large", build: () => Pine({ height: 420, lean: 150, radius: 15, seed: 61, pads: [
        { on: 1, reach: 60, rise: 10, half: [140, 100, 34] },
        { on: 0.84, reach: 90, rise: 4, half: [110, 84, 28] },
        { on: 0.68, reach: 70, rise: -4, half: [84, 66, 22] },
        { on: 0.52, reach: 50, rise: -6, half: [60, 50, 16] },
    ] }) },
    { name: "umbrella_pine", build: () => CrownTree({ height: 330, lean: 40, radius: 14, seed: 71, part: "needle",
        boughs: [[20, 90, 40, [110, 90, 26]], [160, 80, 30, [100, 84, 24]], [270, 70, 44, [90, 80, 22]]],
        crown: [{ at: [10, 0, 56], half: [150, 130, 34] }] }) },
    { name: "oak", build: () => CrownTree({ height: 150, lean: 20, radius: 16, seed: 81,
        boughs: [[30, 70, 60, [80, 70, 64]], [150, 64, 50, [74, 66, 58]], [270, 60, 70, [70, 64, 56]]],
        crown: [{ at: [0, 0, 120], half: [96, 90, 70] }] }) },
    { name: "oak_large", build: () => CrownTree({ height: 220, lean: 30, radius: 24, seed: 91,
        boughs: [[20, 110, 90, [120, 104, 90]], [140, 100, 70, [110, 96, 84]], [260, 96, 100, [104, 94, 82]], [330, 80, 130, [90, 84, 76]]],
        crown: [{ at: [0, 0, 180], half: [140, 130, 96] }] }) },
    { name: "cypress", build: () => CrownTree({ height: 60, lean: 0, radius: 10, seed: 101, part: "needle", boughs: [],
        crown: [{ at: [0, 0, 90], half: [56, 52, 110] }, { at: [4, 2, 230], half: [44, 42, 100] }, { at: [6, 4, 350], half: [28, 28, 70] }] }) },
    { name: "ice_plant", build: () => Drape({ width: 192, top: 32, drop: 160, thick: 4, step: 16, flowers: 30, seed: 111 }) },
    { name: "ice_plant_large", build: () => Drape({ width: 256, top: 40, drop: 320, thick: 5, step: 20, flowers: 48, seed: 113 }) },
    { name: "ice_plant_small", build: () => Drape({ width: 128, top: 24, drop: 90, thick: 3.5, step: 12, flowers: 16, seed: 117 }) },
    { name: "ivy_short", build: () => Ivy({ length: 128, vines: 2, spread: 40, seed: 121 }) },
    { name: "ivy", build: () => Ivy({ length: 256, vines: 3, spread: 64, seed: 123 }) },
    { name: "ivy_long", build: () => Ivy({ length: 420, vines: 4, spread: 96, seed: 127 }) },
    { name: "fern", build: () => Fern({ count: 7, reach: 26, height: 18, leaflet: 5, seed: 131 }) },
    { name: "fern_small", build: () => Fern({ count: 5, reach: 15, height: 10, leaflet: 3.2, seed: 133 }) },
    { name: "fern_large", build: () => Fern({ count: 9, reach: 50, height: 32, leaflet: 8, segments: 7, parts: ["fern", "fern", "fern_dark"], seed: 135 }) },
    { name: "fern_upright", build: () => Fern({ count: 8, reach: 20, height: 44, leaflet: 3.6, segments: 6, arc: 0.55, droop: 0.1, parts: ["fern", "fern_dark"], seed: 137 }) },
    { name: "fern_hanging", build: () => Fern({ count: 6, reach: 34, height: 6, leaflet: 5, segments: 6, arc: 0.5, droop: 0, fall: 28, fan: Math.PI * 0.9, seed: 139 }) },
    { name: "fern_dry", build: () => Fern({ count: 7, reach: 28, height: 14, leaflet: 5, droop: 0.6, parts: ["fern_dry", "fern_dry", "fern"], seed: 145 }) },
    { name: "fern_clump", build: () => FernClump([
        { at: [0, 0, 0], count: 7, reach: 30, height: 22, leaflet: 5.5, segments: 6, parts: ["fern"] },
        { at: [22, 16, 0], count: 5, reach: 16, height: 11, leaflet: 3.4, parts: ["fern_dark"] },
        { at: [-18, 20, 0], count: 5, reach: 18, height: 26, leaflet: 3.6, arc: 0.55, droop: 0.1, parts: ["fern", "fern_dark"] },
        { at: [8, -24, 0], count: 4, reach: 14, height: 8, leaflet: 3, parts: ["fern_dry"] },
    ], 147) },
    { name: "moss", build: () => Moss([{ at: [0, 0, 0], half: [16, 14, 5] }, { at: [12, 8, 0], half: [10, 9, 4] }, { at: [-10, 9, 0], half: [8, 7, 3] }], 141) },
    { name: "moss_strip", build: () => Moss([-40, -20, 0, 20, 40].map((y, i) => ({ at: [i % 2 ? 1.5 : -1.5, y, 0], half: [5 + (i % 3), 12, 3 + (i % 2)] })), 143) },
    { name: "roots", build: () => Roots({ count: 6, drop: 120, width: 96, seed: 151 }) },
    { name: "roots_long", build: () => Roots({ count: 8, drop: 240, width: 140, seed: 153 }) },
];

const COLORS = {
    grass: [0x8e, 0xa4, 0x52], // marram green
    straw: [0xc4, 0xb0, 0x6a], // dry blades
    leaf: [0x4f, 0x72, 0x36], // gorse
    yellow: [0xf2, 0xc4, 0x1e],
    heath: [0x5e, 0x6a, 0x3e],
    purple: [0x9b, 0x5a, 0xa8],
    pink: [0xe8, 0x8a, 0xb0],
    bark: [0x6b, 0x4a, 0x34],
    needle: [0x3e, 0x5e, 0x3a],
    succulent: [0x48, 0x6a, 0x32], // ice plant: fleshy, a yellower green than the ivy
    succulent_red: [0x7a, 0x42, 0x2e], // its tips, reddening in the sun
    magenta: [0xe0, 0x3c, 0x9a], // its flowers
    ivy: [0x2f, 0x52, 0x2c],
    ivy_light: [0x4a, 0x70, 0x38],
    vine: [0x5a, 0x4e, 0x36],
    fern: [0x6a, 0x96, 0x3e],
    fern_dark: [0x3e, 0x62, 0x2c], // in the shade
    fern_dry: [0x9a, 0x6e, 0x36], // dried, rust brown
    moss: [0x5a, 0x74, 0x30],
    moss_light: [0x9a, 0xa8, 0x4a],
    root: [0x7e, 0x6a, 0x56], // weathered, greyer than the bark
};

const NAME = "coast_plant";
const MODEL_DIR = "models/melon_racer/coast";
const MATERIAL_DIR = "materials/melon_racer/coast";
const GENERATOR = "tools/models/make-coast-plant-model.mjs";
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
let total = 0;
for (const variant of VARIANTS) {
    const { mesh, physics } = variant.build();
    const name = `${NAME}_${variant.name}`;
    const obj = `${MODEL_DIR}/${name}.obj`, physicsObj = physics ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    if (physics) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    const all = Object.values(mesh.tris).flat().flat().map(([v]) => mesh.v[v - 1]);
    const size = [0, 1, 2].map(i => Math.max(...all.map(c => c[i])) - Math.min(...all.map(c => c[i])));
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles, ${physics ? `collision ${physics.triangleCount}` : "no collision"}; ${size.map(n => n.toFixed(0)).join(" x ")}`);
    total += mesh.triangleCount;
}
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR }));
}
console.log(`${NAME}: ${VARIANTS.length} variants, ${total} triangles in all`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<variant>.vmdl"`);
