// The Glasshouse race track (track 6), a 2.5D jump & run round the outside
// of a greenhouse tower: up a spiral over all four faces, each face a
// side-view zone, each corner a corner zone the camera turns round with the
// melon (docs/mapping-api/11-camera-zones.md#corner-zones). This writes the
// blockout — tower core, the course's ledges, steps and lift shafts, every
// trigger and spawn — as maps/prefabs/glasshouse_course.vmap (overwritten
// on every run: change the LAYOUT here, not in Hammer), and once, if it's
// missing, maps/prefabs/route_glasshouse.vmap with that prefab placed in it
// (the route's own file: lighting, decoration, Hammer work go there; its
// name is the route's name in the hub window). `node tools/maps/make-glasshouse-prefab.mjs`
//
// Frame: the tower stands on the prefab's origin. Each face has its own
// course frame: s along the way the melon drives (0..FACE at the two corner
// lines), t out from the facade (0..LEDGE_DEPTH), z up (absolute). The
// course goes counter-clockwise seen from above: south face driving east,
// east face north, north face west, west face south, D always forward.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Vmap, SCRIPT_ENTITY } from "../lib/vmap.mjs";

const TRACK = 6;
const COURSE_FILE = "maps/prefabs/glasshouse_course.vmap";
const ROUTE_FILE = "maps/prefabs/route_glasshouse.vmap";

// Tower: a square with rounded corners, each corner an arc round its pivot.
const HALF = 768; // facade to the tower's middle
const CORNER_RADIUS = 256; // the rounded corners — the camera turns over the arc the melon drives round them
const PIVOT = HALF - CORNER_RADIUS; // 512: the corner zones' origins at (+-PIVOT, +-PIVOT)
const FACE = 2 * PIVOT; // 1024: a face's straight part, s = 0..FACE
const CORNER_SEGMENTS = 8; // per corner arc (the core's corners and the curved ledges)
const LEDGE_DEPTH = 256; // the course from the facade out; the melon is held where it enters, about the middle
const SLAB = 16; // ledge thickness
const GROUND_Z = -288; // the plaza round the tower's foot
const ROOF_Z = 1260; // the tower's top = the last platform

// Side view: camera distance and height for every face and corner (the same
// everywhere, or the camera would jump at a corner).
const VIEW_DISTANCE = 450;
const VIEW_HEIGHT = 60;
const LIFT_SPEED = 600; // lift_zone_<speed> in the shafts (u/s up per bounce)
const SHAFT_HEADROOM = 96; // the gap under a shaft's left wall the melon drives in through

const MATERIALS = {
    core: "materials/concrete/hr_c/hr_concrete_wall_001.vmat",
    ledge: "materials/concrete/vertigo_concretefloorc.vmat",
    wall: "materials/glowgreen.vmat",
    ground: "materials/concrete/vertigo_concretefloorc.vmat",
};

// The faces in course order: where s = 0 is, the way s runs (d), out from the
// facade (n), the camera's yaw (looking at the facade).
const FACES = [
    { name: "south", p0: [-PIVOT, -HALF], d: [1, 0], n: [0, -1], yaw: 90 },
    { name: "east", p0: [HALF, -PIVOT], d: [0, 1], n: [1, 0], yaw: 180 },
    { name: "north", p0: [PIVOT, HALF], d: [-1, 0], n: [0, 1], yaw: 270 },
    { name: "west", p0: [-HALF, PIVOT], d: [0, -1], n: [-1, 0], yaw: 0 },
];

// The course, per face (s from, s to, the floor's z). Jump: 370 u/s up, ~85
// high, ~600 far at full speed (MAX_SPEED 650); steps up to 64 are taken in a
// jump, 48 easily. `shaft`: a lift shaft from `z` up to `top` between a left
// wall hanging over the way in (SHAFT_HEADROOM under it) and a block on the
// right whose top is the floor on — bounced up in the lift zone. `gate`:
// start/checkpoint/finish line at that s.
const LAYOUT = [
    {
        // south, z 0 -> 320: start, two steps, a gap, a shaft
        platforms: [[-480, 300, 0], [300, 420, 64], [420, 540, 128], [680, 800, 128]],
        shafts: [{ s0: 800, s1: 960, z: 128, top: 320 }],
        start: 80,
    },
    {
        // east, z 320 -> 640: stairs, a gap, a shaft
        platforms: [[0, 260, 320], [260, 360, 368], [360, 460, 416], [460, 560, 464], [700, 820, 464]],
        shafts: [{ s0: 820, s1: 960, z: 464, top: 640 }],
        checkpoint: 60,
    },
    {
        // north, z 640 -> 940: stepping stones over the drop
        platforms: [[0, 200, 640], [260, 340, 690], [400, 480, 740], [540, 620, 790], [680, 760, 840], [820, 900, 890], [960, FACE, 940]],
        shafts: [],
        checkpoint: 60,
    },
    {
        // west, z 940 -> roof: a gap, the long shaft up to the roof, the finish
        platforms: [[0, 300, 940], [440, 560, 940]],
        shafts: [{ s0: 560, s1: 720, z: 940, top: ROOF_Z, right: FACE }],
        checkpoint: 60,
        finish: 900,
    },
];

const map = new Vmap(COURSE_FILE);
const add = (a, b) => a.map((n, i) => n + b[i]);
const scale = (a, k) => a.map(n => n * k);

/** A face's course frame (s, t) -> world (x, y). */
function At(face, s, t) {
    return add(face.p0, add(scale(face.d, s), scale(face.n, t)));
}

/** A vertical prism: `ring` (x, y points, either winding) from z0 to z1. */
function Prism(ring, z0, z1, material) {
    const area = ring.reduce((sum, p, i) => sum + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0);
    const ccw = area > 0 ? ring : [...ring].reverse();
    const n = ccw.length;
    const positions = [...ccw.map(([x, y]) => [x, y, z0]), ...ccw.map(([x, y]) => [x, y, z1])];
    const faces = [
        { loop: ccw.map((_, i) => n + i), material }, // top
        { loop: ccw.map((_, i) => n - 1 - i), material }, // bottom
        ...ccw.map((_, i) => ({ loop: [i, (i + 1) % n, n + ((i + 1) % n), n + i], material })),
    ];
    return { positions, faces };
}

/** A world mesh, its origin in its middle (Hammer shows it there). */
function Solid(ring, z0, z1, material) {
    const c = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length, z0];
    const local = Prism(ring.map(([x, y]) => [x - c[0], y - c[1]]), 0, z1 - z0, material);
    map.Mesh(local, c, { world: true });
}

/** A box in a face's frame: s0..s1 along it, t0..t1 out, z0..z1. */
function FaceBox(face, s0, s1, t0, t1, z0, z1, material) {
    Solid([At(face, s0, t0), At(face, s1, t0), At(face, s1, t1), At(face, s0, t1)], z0, z1, material);
}

/** The world AABB of a face-frame box (for triggers: axis-aligned anyway). */
function FaceBounds(face, s0, s1, t0, t1, z0, z1) {
    const pts = [At(face, s0, t0), At(face, s1, t1)];
    return [
        [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), z0],
        [Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1]), z1],
    ];
}

const YawOf = d => (Math.atan2(d[1], d[0]) * 180) / Math.PI;
const MID = LEDGE_DEPTH / 2;
let triangles = 0;
const CountPrism = sides => (triangles += 2 * (sides - 2) + 2 * sides);

// --- the tower core and the plaza ---
const coreRing = [];
const pivots = [[PIVOT, -PIVOT], [PIVOT, PIVOT], [-PIVOT, PIVOT], [-PIVOT, -PIVOT]];
pivots.forEach(([px, py], i) => {
    const a0 = -Math.PI / 2 + (i * Math.PI) / 2;
    for (let k = 0; k <= CORNER_SEGMENTS; k++) {
        const a = a0 + ((k / CORNER_SEGMENTS) * Math.PI) / 2;
        coreRing.push([px + CORNER_RADIUS * Math.cos(a), py + CORNER_RADIUS * Math.sin(a)]);
    }
});
Solid(coreRing, GROUND_Z, ROOF_Z, MATERIALS.core);
CountPrism(coreRing.length);
const PLAZA = HALF + LEDGE_DEPTH + 900;
Solid([[-PLAZA, -PLAZA], [PLAZA, -PLAZA], [PLAZA, PLAZA], [-PLAZA, PLAZA]], GROUND_Z - 32, GROUND_Z, MATERIALS.ground);
CountPrism(4);

// Falling off anywhere: back to the last checkpoint (just over the plaza).
map.Trigger("glasshouse_respawn", [-PLAZA, -PLAZA, GROUND_Z], [PLAZA, PLAZA, GROUND_Z + 64], [
    { output: "OnStartTouch", target: SCRIPT_ENTITY, input: "RunScriptInput", param: "melon_respawn" },
]);

// --- the course ---
let checkpoint = 0;
const report = [];
FACES.forEach((face, i) => {
    const layout = LAYOUT[i];
    const drive = YawOf(face.d);
    for (const [s0, s1, z] of layout.platforms) {
        FaceBox(face, s0, s1, 0, LEDGE_DEPTH, z - SLAB, z, MATERIALS.ledge);
        CountPrism(4);
    }
    for (const shaft of layout.shafts) {
        const right = shaft.right ?? shaft.s1 + 64;
        // floor, the left wall hanging over the way in, the block on the right
        FaceBox(face, shaft.s0, shaft.s1, 0, LEDGE_DEPTH, shaft.z - SLAB, shaft.z, MATERIALS.ledge);
        FaceBox(face, shaft.s0 - 32, shaft.s0, 0, LEDGE_DEPTH, shaft.z + SHAFT_HEADROOM, shaft.top + 160, MATERIALS.wall);
        FaceBox(face, shaft.s1, right, 0, LEDGE_DEPTH, shaft.z - SLAB, shaft.top, MATERIALS.wall);
        CountPrism(4), CountPrism(4), CountPrism(4);
        const [min, max] = FaceBounds(face, shaft.s0, shaft.s1, 0, LEDGE_DEPTH, shaft.z, shaft.top + 128);
        map.ZoneTrigger(`lift_zone_${LIFT_SPEED}`, "lift_enter", "lift_leave", min, max);
    }
    // Every platform's and shaft's z, for the zones' height range.
    const zs = [...layout.platforms.map(p => p[2]), ...layout.shafts.flatMap(s => [s.z, s.top])];
    const zMin = Math.min(...zs), zMax = Math.max(...zs);
    const zoneS0 = i === 0 ? -40 : 0; // the start spawn's inside the first face's zone
    const [min, max] = FaceBounds(face, zoneS0, FACE, -16, LEDGE_DEPTH + 160, zMin - 96, zMax + 320);
    map.ZoneTrigger(`side_view_${face.yaw}_${VIEW_DISTANCE}_${VIEW_HEIGHT}`, "side_view_enter", "side_view_leave", min, max);

    if (layout.start !== undefined) {
        const s = layout.start, z = layout.platforms[0][2];
        const [a, b] = FaceBounds(face, s - 8, s + 8, 0, LEDGE_DEPTH, z, z + 160);
        map.Trigger(`start_${TRACK}`, a, b, [{ output: "OnStartTouch", target: SCRIPT_ENTITY, input: "RunScriptInput", param: "start_line" }]);
        map.Entity("info_target", { targetname: `start_spawn_${TRACK}` }, { origin: [...At(face, 20, MID), z + 24], angles: [0, drive, 0] });
        map.Entity("info_target", { targetname: "tp_dest_glasshouse" }, { origin: [...At(face, -420, MID), z + 24], angles: [0, drive, 0] });
        report.push(`start_${TRACK} at s ${s} on the ${face.name} face; the way in: tp_dest_glasshouse at ${At(face, -420, MID).join(" ")} ${z}`);
    }
    if (layout.checkpoint !== undefined) {
        checkpoint++;
        const s = layout.checkpoint, z = layout.platforms[0][2];
        const [a, b] = FaceBounds(face, s - 8, s + 8, 0, LEDGE_DEPTH, z, z + 160);
        map.Trigger(`checkpoint_${TRACK}_${checkpoint}`, a, b, [{ output: "OnStartTouch", target: SCRIPT_ENTITY, input: "RunScriptInput", param: "checkpoint" }]);
        map.Entity("info_target", { targetname: `checkpoint_spawn_${TRACK}_${checkpoint}` }, { origin: [...At(face, s + 48, MID), z + 24], angles: [0, drive, 0] });
        report.push(`checkpoint_${TRACK}_${checkpoint} at s ${s} on the ${face.name} face, z ${z}`);
    }
    if (layout.finish !== undefined) {
        const s = layout.finish, z = ROOF_Z;
        const [a, b] = FaceBounds(face, s - 8, s + 8, 0, LEDGE_DEPTH, z, z + 160);
        map.Trigger(`finish_${TRACK}`, a, b, [{ output: "OnStartTouch", target: SCRIPT_ENTITY, input: "RunScriptInput", param: "finish_line" }]);
        report.push(`finish_${TRACK} at s ${s} on the ${face.name} face, z ${z}`);
    }

    // The corner after this face (not after the last): a curved ledge at the
    // face's last height round the pivot, and the corner zone.
    if (i === FACES.length - 1) return;
    const next = FACES[i + 1];
    const pivot = add(face.p0, add(scale(face.d, FACE), scale(face.n, -CORNER_RADIUS)));
    const z = layout.shafts.length && layout.shafts.at(-1).s1 > layout.platforms.at(-1)[1] ? layout.shafts.at(-1).top : layout.platforms.at(-1)[2];
    const a0 = Math.atan2(face.n[1], face.n[0]);
    for (let k = 0; k < CORNER_SEGMENTS; k++) {
        const [b0, b1] = [k, k + 1].map(j => a0 + ((j / CORNER_SEGMENTS) * Math.PI) / 2);
        const P = (a, r) => [pivot[0] + r * Math.cos(a), pivot[1] + r * Math.sin(a)];
        const rIn = CORNER_RADIUS, rOut = CORNER_RADIUS + LEDGE_DEPTH;
        Solid([P(b0, rIn), P(b0, rOut), P(b1, rOut), P(b1, rIn)], z - SLAB, z, MATERIALS.ledge);
        CountPrism(4);
    }
    // The quadrant outside the corner, overlapping both faces' zones by 32.
    const far = CORNER_RADIUS + LEDGE_DEPTH + 160;
    const corners = [add(pivot, add(scale(face.n, -32), scale(face.d, -32))), add(pivot, add(scale(face.n, far), scale(face.d, far)))];
    const cmin = [Math.min(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1]), z - 96];
    const cmax = [Math.max(corners[0][0], corners[1][0]), Math.max(corners[0][1], corners[1][1]), z + 320];
    map.ZoneTrigger(`side_view_corner_${face.yaw}_${next.yaw % 360}_${VIEW_DISTANCE}_${VIEW_HEIGHT}`, "side_view_enter", "side_view_leave", cmin, cmax, [...pivot, z]);
    report.push(`corner ${face.name} -> ${next.name}: pivot ${pivot.join(" ")}, z ${z}`);
});

map.Write(COURSE_FILE);
if (!existsSync(fileURLToPath(new URL(`../../${ROUTE_FILE}`, import.meta.url)))) {
    const route = new Vmap(ROUTE_FILE);
    route.Prefab(COURSE_FILE, [0, 0, 0]);
    route.Write(ROUTE_FILE);
}
for (const line of report) console.log(line);
console.log(`${triangles} triangles (blockout)`);
