// Builds hard park furniture for the hub — not inflatable — `node tools/models/make-park-model.mjs`:
//   wall          a stone wall segment, 128 long: blocks of varying length in
//                 a running bond (each course offset), chamfered edges, each
//                 block set a little in or out, mortar in the joints, chamfered
//                 cap stones overhanging on top; wall_64 the same, 64 long;
//                 wall_tall / wall_tall_64 the same with more courses
//   wall_pillar   a square stone pillar in the same blocks, a cap slab and a
//                 stone ball on top — for the ends and corners of a wall;
//                 wall_pillar_tall the one for the tall wall
//   fence         a painted picket fence segment, 128 long: a post with a cap
//                 and a pointed top at its start, two chamfered rails, pointed
//                 pickets; fence_post a lone post for a fence's far end
//   bench         a park bench: wooden slats (seat and a leaning backrest) on
//                 two cast-iron side frames, curved back legs, armrests ending
//                 in a curl, feet pads
// Wall and fence segments run along +X from their origin (on the floor, in
// the middle of their thickness), so they chain by putting the next one at
// x = 128 (or 64) — a wall's pillar, or the fence's own post, covers the
// joint; turn them by yaw to go round corners. The pillar and the bench sit
// around their origin on the floor; the bench faces +Y.
// Flat-shaded where they're cut (chamfers), the iron round and smooth.
// Stone and paint are light and tinted per prop (render color); mortar, wood
// and iron aren't.
// Writes models/melon_racer/park/park_<piece>.vmdl (+ .obj, _physics.obj: a
// box or two each) and materials/melon_racer/park/park_{stone,mortar,paint,wood,iron}.vmat
// (+ _color.png). Compile the .vmdl files with resourcecompiler (see the output).
import { ChamferedRect, Mesh, ObjText, SeededRandom, Shape, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- Wall ---
const WALL_THICKNESS = 12;
const COURSE_HEIGHT = 8.5;
const BLOCK_LENGTH = 30; // on average,
const BLOCK_LENGTH_JITTER = 6; //   give or take this
const BLOCK_MIN = 7; // no shorter block at a segment's end: the cut moves
const JOINT = 0.8;
const BLOCK_CHAMFER = 1;
const BLOCK_DEPTH_JITTER = 0.35; // a block's face set in or out up to this
const CAP_HEIGHT = 5;
const CAP_OVERHANG = 1.5; // each side
const CAP_CHAMFER = 1.4;
const CAP_STONE = 32; // length
// courses: rows of blocks under the cap (the wall is courses x COURSE_HEIGHT + CAP_HEIGHT high).
const WALLS = [
    { piece: "wall", length: 128, courses: 4, seed: 3 },
    { piece: "wall_64", length: 64, courses: 4, seed: 11 },
    { piece: "wall_tall", length: 128, courses: 9, seed: 17 },
    { piece: "wall_tall_64", length: 64, courses: 9, seed: 23 },
];

// --- Pillar ---
const PILLAR_SIZE = 20;
const PILLAR_COURSE = 8.8;
// courses: a little higher than its wall, so its cap stands over the wall's.
const PILLARS = [
    { piece: "wall_pillar", courses: 5 },
    { piece: "wall_pillar_tall", courses: 10 },
];
const PILLAR_CAP = { size: 24, height: 3, chamfer: 1.5, top: 18, topHeight: 1.5 };
const BALL = { radius: 5, neck: 2.6, neckHeight: 1.5, sides: 12, rings: 8 };

// --- Fence ---
const FENCE_LENGTH = 128;
const POST = { size: 5, height: 38, chamfer: 0.5, cap: 6.6, capHeight: 1.6, top: 2.8 };
const RAILS = [10, 28]; // heights of their middles
const RAIL = { thickness: 1.6, height: 3.4, chamfer: 0.4 };
const PICKET = { width: 3.2, thickness: 1.2, bottom: 3, top: 35, point: 2.2, spacing: 6.4 };

// --- Bench (length along X, facing +Y) ---
const BENCH_LENGTH = 72;
const FRAME_X = 29; // the side frames, either side of the middle
const SEAT_HEIGHT = 17; // the slats' middle
const SEAT_SLATS = [-7.5, -2.5, 2.5, 7.5]; // y of their middles
const SLAT = { width: 4.4, thickness: 1.6, chamfer: 0.4 };
const BACK_SLATS = [22.5, 27, 31.5]; // z of their middles
const BACK_SLAT = { width: 4, thickness: 1.4, chamfer: 0.35 };
const IRON = { radius: 1.1, sides: 6 };
// The side frame in (y, z): the back leg rising into the backrest support, the
// front leg up to the armrest, the armrest ending in a curl, a seat bearer.
const BACK_LEG = [[-8, 0], [-9, 8], [-10, 16], [-11.2, 22], [-12.8, 28], [-14.6, 34]];
const FRONT_LEG = [[9, 0], [9.4, 8], [9.6, 16], [9.6, 24.6]];
const ARMREST = [[-11.8, 24.5], [-6, 25.3], [0, 25.6], [6, 25.4], [10, 24.8], [12.2, 23.6], [12.6, 22], [11.6, 21], [10.8, 21.8]];
const SEAT_BEARER = [[-10.6, 15.1], [10.4, 15.1]];
const FOOT = { width: 3.2, depth: 4.2, height: 1, chamfer: 0.6 };
const CURVE_STEPS = 2; // points per frame polyline piece (Catmull-Rom)

const COLORS = {
    stone: { rgb: [0xd6, 0xd1, 0xc6], tint: 1 }, // the tree beds' sandstone, tinted per prop
    mortar: { rgb: [0x8a, 0x86, 0x7e], tint: 0 },
    paint: { rgb: [0xf2, 0xf0, 0xea], tint: 1 }, // white painted wood, tinted per prop
    wood: { rgb: [0xa8, 0x72, 0x44], tint: 0 }, // oiled bench slats
    iron: { rgb: [0x2b, 0x30, 0x38], tint: 0 }, // the hub's graphite
};

const MODEL_DIR = "models/melon_racer/park";
const MATERIAL_DIR = "materials/melon_racer/park";
const GENERATOR = "tools/models/make-park-model.mjs";

// Extrude's axes: "x" takes 2D points as (y, z), "y" as (z, x), "z" as (x, y).
const AlongX = (mesh, outline, x0, x1, part) => mesh.Extrude(Shape(outline), x0, x1, part, "x");
const AlongY = (mesh, outline, y0, y1, part) => mesh.Extrude(Shape(outline), y0, y1, part, "y");
const AlongZ = (mesh, outline, z0, z1, part) => mesh.Extrude(Shape(outline), z0, z1, part, "z");

/** A pyramid from a flat convex ring of corners (3D) up to `tip`, its faces flat; no base. */
function Pyramid(mesh, corners, tip, part) {
    const mid = V3.Scale(corners.reduce(V3.Add), 1 / corners.length);
    corners.forEach((p, i) => {
        const q = corners[(i + 1) % corners.length];
        const n = V3.Cross(V3.Sub(q, p), V3.Sub(tip, p));
        if (V3.Dot(n, V3.Sub(p, mid)) >= 0) mesh.Tri(p, q, tip, part);
        else mesh.Tri(q, p, tip, part);
    });
}

/** A smooth curve through 2D points (Catmull-Rom), `steps` points per piece. */
function Curve(points, steps) {
    const P = i => points[Math.max(0, Math.min(points.length - 1, i))];
    const out = [];
    for (let i = 0; i + 1 < points.length; i++)
        for (let s = 0; s < steps; s++) {
            const t = s / steps, t2 = t * t, t3 = t2 * t;
            const [a, b, c, d] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
            out.push([0, 1].map(k => 0.5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t3)));
        }
    out.push(points.at(-1));
    return out;
}

/** Where to cut a course of blocks along [0, length]: random lengths from `start`, none shorter than BLOCK_MIN at the ends. */
function BlockCuts(length, start, random) {
    const cuts = [];
    for (let x = start; x < length; x += BLOCK_LENGTH + BLOCK_LENGTH_JITTER * (2 * random() - 1))
        if (x > BLOCK_MIN && x < length - BLOCK_MIN) cuts.push(x);
    return [0, ...cuts, length];
}

function BuildWall({ length, courses, seed }) {
    return (mesh, physics) => {
        const random = SeededRandom(seed);
        const body = courses * COURSE_HEIGHT; // under the cap
        const t = WALL_THICKNESS / 2;
        // The mortar behind the joints.
        AlongX(mesh, ChamferedRect(0, body / 2, WALL_THICKNESS - 2 * JOINT, body, 0), 0.2, length - 0.2, "mortar");
        for (let c = 0; c < courses; c++) {
            const z0 = c * COURSE_HEIGHT;
            const cuts = BlockCuts(length, c % 2 ? -BLOCK_LENGTH * (0.35 + 0.3 * random()) : 0, random);
            for (let i = 0; i + 1 < cuts.length; i++) {
                const x0 = cuts[i] + JOINT / 2, x1 = cuts[i + 1] - JOINT / 2;
                const front = t + BLOCK_DEPTH_JITTER * (2 * random() - 1), back = -t - BLOCK_DEPTH_JITTER * (2 * random() - 1);
                const bottom = c === 0 ? -1 : z0 + JOINT / 2; // the lowest course goes into the floor
                const top = z0 + COURSE_HEIGHT - JOINT / 2;
                AlongY(mesh, ChamferedRect((bottom + top) / 2, (x0 + x1) / 2, top - bottom, x1 - x0, BLOCK_CHAMFER), back, front, "stone");
            }
        }
        // Cap stones, overhanging both sides.
        const w = WALL_THICKNESS / 2 + CAP_OVERHANG, z0 = body, z1 = body + CAP_HEIGHT;
        const profile = [[-w, z0], [w, z0], [w, z1 - CAP_CHAMFER], [w - CAP_CHAMFER, z1], [-w + CAP_CHAMFER, z1], [-w, z1 - CAP_CHAMFER]];
        const stones = Math.max(1, Math.round(length / CAP_STONE));
        for (let i = 0; i < stones; i++) AlongX(mesh, profile, (length * i) / stones + 0.3, (length * (i + 1)) / stones - 0.3, "stone");
        AlongX(physics, ChamferedRect(0, z1 / 2, WALL_THICKNESS, z1, 0), 0, length, "stone");
    };
}

function BuildPillar({ courses }) {
    return (mesh, physics) => {
        const s = PILLAR_SIZE, body = courses * PILLAR_COURSE;
        AlongZ(mesh, ChamferedRect(0, 0, s - 2 * JOINT, s - 2 * JOINT, 0), 0, body, "mortar");
        // Two blocks per course, split across X and Y in turn.
        for (let c = 0; c < courses; c++) {
            const bottom = c === 0 ? -1 : c * PILLAR_COURSE + JOINT / 2, top = (c + 1) * PILLAR_COURSE - JOINT / 2;
            for (const side of [-1, 1]) {
                const half = s / 4 - JOINT / 4;
                const [cx, cy, w, h] = c % 2 ? [side * (s / 4), 0, 2 * half, s] : [0, side * (s / 4), s, 2 * half];
                AlongZ(mesh, ChamferedRect(cx, cy, w, h, BLOCK_CHAMFER), bottom, top, "stone");
            }
        }
        const { size, height, chamfer, top, topHeight } = PILLAR_CAP;
        AlongZ(mesh, ChamferedRect(0, 0, size, size, chamfer), body, body + height, "stone");
        AlongZ(mesh, ChamferedRect(0, 0, top, top, chamfer), body + height, body + height + topHeight, "stone");
        // The ball on a short neck.
        const z = body + height + topHeight;
        mesh.Tube([[0, 0, z - 0.5], [0, 0, z + BALL.neckHeight + 0.5]], BALL.neck, BALL.sides, "stone", false);
        const angles = Array.from({ length: BALL.rings + 1 }, (_, i) => (Math.PI * i) / BALL.rings);
        const center = z + BALL.neckHeight + BALL.radius * 0.9;
        mesh.Tube(angles.map(a => [0, 0, center - BALL.radius * Math.cos(a)]), i => BALL.radius * Math.sin(angles[i]), BALL.sides, "stone", false, { slopedNormals: true });
        AlongZ(physics, ChamferedRect(0, 0, size, size, 0), 0, body + height + topHeight, "stone");
    };
}

function Post(mesh, x) {
    const { size, height, chamfer, cap, capHeight, top } = POST;
    AlongZ(mesh, ChamferedRect(x, 0, size, size, chamfer), -1, height, "paint");
    AlongZ(mesh, ChamferedRect(x, 0, cap, cap, chamfer), height, height + capHeight, "paint");
    const z = height + capHeight, r = cap / 2 - chamfer;
    Pyramid(mesh, [[x - r, -r, z], [x + r, -r, z], [x + r, r, z], [x - r, r, z]], [x, 0, z + top], "paint");
}

function BuildFence(mesh, physics) {
    Post(mesh, 0);
    const x0 = POST.size / 2, x1 = FENCE_LENGTH - POST.size / 2; // up to the next segment's post
    // Rails behind the pickets (on -Y), pickets in front.
    const railY = -RAIL.thickness / 2 + 0.2;
    for (const z of RAILS) AlongX(mesh, ChamferedRect(railY, z, RAIL.thickness, RAIL.height, RAIL.chamfer), x0, x1, "paint");
    const { width, thickness, bottom, top, point, spacing } = PICKET;
    const count = Math.round((x1 - x0) / spacing), step = (x1 - x0) / count;
    const y0 = railY + RAIL.thickness / 2;
    for (let i = 0; i < count; i++) {
        const x = x0 + step * (i + 0.5), w = width / 2;
        AlongY(mesh, [[bottom, x - w], [bottom, x + w], [top - point, x + w], [top, x], [top - point, x - w]], y0, y0 + thickness, "paint");
    }
    AlongX(physics, ChamferedRect(0, POST.height / 2, POST.size, POST.height, 0), -POST.size / 2, FENCE_LENGTH - POST.size / 2, "paint");
}

function BuildFencePost(mesh, physics) {
    Post(mesh, 0);
    AlongZ(physics, ChamferedRect(0, 0, POST.size, POST.size, 0), 0, POST.height + POST.capHeight, "paint");
}

function BuildBench(mesh, physics) {
    const L = BENCH_LENGTH / 2;
    for (const y of SEAT_SLATS) AlongX(mesh, ChamferedRect(y, SEAT_HEIGHT, SLAT.width, SLAT.thickness, SLAT.chamfer), -L, L, "wood");
    // Back slats along the support's top piece, just in front of it.
    const a = BACK_LEG[3], b = BACK_LEG.at(-1); // the support's straight top piece, (y, z)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], normal = [along[1], -along[0]]; // normal points to +Y (the front)
    const SupportY = z => a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]);
    for (const z of BACK_SLATS) {
        const c = [SupportY(z) + IRON.radius + BACK_SLAT.thickness / 2 + 0.2, z];
        const outline = ChamferedRect(0, 0, BACK_SLAT.width, BACK_SLAT.thickness, BACK_SLAT.chamfer)
            .map(([u, v]) => [c[0] + along[0] * u + normal[0] * v, c[1] + along[1] * u + normal[1] * v]);
        AlongX(mesh, outline, -L, L, "wood");
    }
    // The side frames.
    for (const x of [-FRAME_X, FRAME_X]) {
        const At = pts => pts.map(([y, z]) => [x, y, z]);
        mesh.Tube(At(Curve(BACK_LEG, CURVE_STEPS)), IRON.radius, IRON.sides, "iron");
        mesh.Tube(At(Curve(FRONT_LEG, CURVE_STEPS)), IRON.radius, IRON.sides, "iron");
        mesh.Tube(At(Curve(ARMREST, CURVE_STEPS)), IRON.radius, IRON.sides, "iron");
        mesh.Tube(At(SEAT_BEARER), IRON.radius * 0.9, IRON.sides, "iron");
        for (const [y] of [BACK_LEG[0], FRONT_LEG[0]]) AlongZ(mesh, ChamferedRect(x, y, FOOT.width, FOOT.depth, FOOT.chamfer), 0, FOOT.height, "iron");
    }
    // Collision: a block under the seat and the backrest's slab.
    const front = SEAT_SLATS.at(-1) + SLAT.width / 2, back = SEAT_SLATS[0] - SLAT.width / 2 - 1, seat = SEAT_HEIGHT + SLAT.thickness / 2;
    AlongX(physics, [[back, 0], [front, 0], [front, seat], [back, seat]], -L, L, "wood");
    const topY = SupportY(b[1]);
    AlongX(physics, [[back, seat], [back + 3, seat], [topY + 3, b[1]], [topY, b[1]]], -L, L, "wood");
}

const PIECES = [
    ...WALLS.map(w => ({ piece: w.piece, Build: BuildWall(w) })),
    ...PILLARS.map(p => ({ piece: p.piece, Build: BuildPillar(p) })),
    { piece: "fence", Build: BuildFence },
    { piece: "fence_post", Build: BuildFencePost },
    { piece: "bench", Build: BuildBench },
];
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/park_${part}.vmat`]));
for (const { piece, Build } of PIECES) {
    const mesh = new Mesh(64);
    const physics = new Mesh();
    Build(mesh, physics);
    const name = `park_${piece}`;
    const obj = `${MODEL_DIR}/${name}.obj`;
    const physicsObj = `${MODEL_DIR}/${name}_physics.obj`;
    WriteAddonFile(obj, ObjText(mesh, name, GENERATOR));
    WriteAddonFile(physicsObj, ObjText(physics, name, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    const xs = mesh.v.map(p => p[0]), ys = mesh.v.map(p => p[1]), zs = mesh.v.map(p => p[2]);
    const size = [xs, ys, zs].map(a => (Math.max(...a) - Math.min(...a)).toFixed(0));
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles (collision ${physics.triangleCount}); ${size[0]} x ${size[1]}, ${Math.max(...zs).toFixed(0)} high`);
}
for (const [part, { rgb, tint }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/park_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint }));
}
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/park_<piece>.vmdl"`);
