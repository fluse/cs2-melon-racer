// Builds a wooden catapult a melon rides in — `node tools/models/make-catapult-model.mjs`.
// Two models, placed at one spot with the same angles (world/catapult/ pairs
// them and keeps the arm on its base):
//   catapult_base  a prop_physics: a timber frame on four wooden wheels with
//                  iron tyres, an A-frame each side holding the pivot axle and
//                  its twisted rope skeins, a padded crossbar up front the arm
//                  stops against, a rest beam behind it lies on, a rope winch at
//                  the back. Rolls and turns when bumped (the script); MASS_KG.
//                  Collision: convex hulls (chassis, wheels, side frames,
//                  crossbar, rest beam, winch) — clear of the bucket's swing.
//   catapult_arm   a prop_dynamic, animated: the throwing arm (a timber beam
//                  with iron bands, an iron hub on the axle) with a wooden box
//                  bucket at its end; "idle" (cocked, lying on the rest beam),
//                  "fire" (swinging up, ever faster, against the crossbar),
//                  "fired" (held up there), "reload" (winding slowly back
//                  down). Collision on its bone, moving with it: the bucket
//                  (floor, walls) and the beam's outer part — not near the
//                  pivot, and checked over the whole swing (ArmClearance) to
//                  never touch the base's: a kinematic arm inside the base's
//                  hulls would fling the base away.
// The arm's pivot, length, angles and timing come from
// src/melon_drive/world/catapult/constants.js (its swing from logic.js's
// ArmAngle), so the animation and the script's throw match.
// Origin on the floor under the frame's middle; it throws along +X.
// ModelDoc turns an .smd 90 degrees on import, so the arm is written turned
// back (Unturn): in Hammer both models line up, throwing along +X.
// Writes models/melon_racer/catapult/catapult_{base,arm}.vmdl (+ .obj, .smd,
// _hull_<piece>.obj, catapult_arm_<animation>.smd, catapult_arm_physics.obj) and
// materials/melon_racer/catapult/catapult_{wood,darkwood,iron,rope}.vmat.
// Compile both .vmdl with resourcecompiler (see the output).
import { BindFrame, ChamferedRect, Mesh, MeshSmdTriangles, ObjText, Shape, SmdAnimationText, SmdText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";
import {
    CATAPULT_PIVOT, CATAPULT_ARM_LENGTH, CATAPULT_REST_ANGLE, CATAPULT_FIRE_ANGLE, CATAPULT_FIRE_SECONDS, CATAPULT_RELOAD_SECONDS,
} from "../../src/melon_drive/world/catapult/constants.js";
import { ArmAngle, SeatOffset } from "../../src/melon_drive/world/catapult/logic.js";

// --- Measures (units; a melon is about 15 across) ---
const WHEEL = { radius: 7, width: 3, xs: [-22, 16], y: 16, sides: 12, tyre: 0.5 };
const AXLE = { radius: 1.2, sides: 8 };
const FRAME = { x0: -30, x1: 24, y: 12, z: 10, size: 4 }; // side beams: from..to, at y, center height, cross-section
const POST = 3.5; // the A-frame's posts
const INSET = 0.3; // how far a post reaches into the beam it stands on
const SKEIN = { radius: 3.2, from: 4.5, to: 10.5, sides: 10 }; // the twisted rope bundles round the axle, y from..to
const CROSSBAR = { radius: 2, pad: 2.6, padY: 5, reach: 17 }; // the stop: where the arm hits it, from the pivot
const REST_BEAM = { radius: 2, at: 24 }; // under the arm at rest, this far out from the pivot
const WINCH = { x: -27, z: 16, radius: 2.5, y: 9 };
const ARM = { width: 4.4, height: 5, back: 7, bands: [10, 22], hub: 3 }; // the beam: across, thick, stub behind the pivot
const BUCKET = { inner: 18, wall: 2, depth: 8 }; // the box: inside size, wall thickness, inside depth
const ARM_CLEARANCE = 0.5; // the arm's collision keeps at least this far from the base's, all the swing
const MASS_KG = 2; // a melon's: one bump moves and turns it
const LINEAR_DAMPING = 0; // rolling is the script's job (world/catapult/)
const ANGULAR_DAMPING = 2;
const FPS = 30;

const COLORS = {
    wood: { rgb: [0xa8, 0x72, 0x44], metalness: 0 }, // the park benches' oiled wood
    darkwood: { rgb: [0x6e, 0x48, 0x2c], metalness: 0 },
    iron: { rgb: [0x3a, 0x3e, 0x46], metalness: 0.6 },
    rope: { rgb: [0xc8, 0xb0, 0x84], metalness: 0 },
};

const NAME = "catapult";
const MODEL_DIR = "models/melon_racer/catapult";
const MATERIAL_DIR = "materials/melon_racer/catapult";
const GENERATOR = "tools/models/make-catapult-model.mjs";

const PIVOT = [CATAPULT_PIVOT.x, 0, CATAPULT_PIVOT.z];
const Rad = a => (a * Math.PI) / 180;
/** The arm's direction (out from the pivot) and its bucket's open side at `angle`. */
const ArmAxes = angle => ({ along: [-Math.cos(Rad(angle)), 0, Math.sin(Rad(angle))], up: [Math.sin(Rad(angle)), 0, Math.cos(Rad(angle))] });

/**
 * A box around `center` along the axes ex, ey, ez (unit) with half sizes
 * `half`, flat-shaded, its faces outwards — a left-handed set of axes is
 * turned right-handed first (the arm's along/side/up was, and the whole arm
 * came out inside out: invisible from outside in-game).
 */
function Box(mesh, center, [ex, ey, ez], half, part) {
    if (V3.Dot(V3.Cross(ex, ey), ez) < 0) ey = V3.Scale(ey, -1);
    const P = (sx, sy, sz) => V3.Add(center, V3.Add(V3.Add(V3.Scale(ex, sx * half[0]), V3.Scale(ey, sy * half[1])), V3.Scale(ez, sz * half[2])));
    const [a, b, c, d] = [P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1)];
    const [e, f, g, h] = [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)];
    for (const [p, q, r, s] of [[a, d, c, b], [e, f, g, h], [a, b, f, e], [b, c, g, f], [c, d, h, g], [d, a, e, h]]) {
        mesh.Tri(p, q, r, part);
        mesh.Tri(p, r, s, part);
    }
}
/** A square beam from `from` to `to`, `size` across, its sides upright where it can. */
function Beam(mesh, from, to, size, part) {
    const ex = V3.Unit(V3.Sub(to, from));
    const ey = V3.Unit(Math.abs(ex[2]) > 0.99 ? [0, 1, 0] : V3.Cross([0, 0, 1], ex));
    const ez = V3.Cross(ex, ey);
    Box(mesh, V3.Scale(V3.Add(from, to), 0.5), [ex, ey, ez], [Math.hypot(...V3.Sub(to, from)) / 2, size / 2, size / 2], part);
}
/** A round piece along Y at (x, z) from y0 to y1. */
const AcrossY = (mesh, x, z, y0, y1, radius, sides, part, caps = true) => mesh.Tube([[x, y0, z], [x, y1, z]], radius, sides, part, caps);

// --- Base ---

/** Where the arm meets the crossbar: on its front (bucket) side, at CROSSBAR.reach from the pivot, with the arm up. */
function CrossbarAt() {
    const { along, up } = ArmAxes(CATAPULT_FIRE_ANGLE);
    return V3.Add(V3.Add(PIVOT, V3.Scale(along, CROSSBAR.reach)), V3.Scale(up, ARM.height / 2 - 0.9 + CROSSBAR.radius)); // against the beam's thin part
}
function RestBeamAt() {
    const { along, up } = ArmAxes(CATAPULT_REST_ANGLE);
    return V3.Sub(V3.Add(PIVOT, V3.Scale(along, REST_BEAM.at)), V3.Scale(up, ARM.height / 2 + REST_BEAM.radius));
}

function BuildBase(mesh) {
    // Wheels: wood with an iron tyre and hub; axles across.
    for (const x of WHEEL.xs) {
        AcrossY(mesh, x, WHEEL.radius, -WHEEL.y - WHEEL.width, WHEEL.y + WHEEL.width, AXLE.radius, AXLE.sides, "iron");
        for (const s of [-1, 1]) {
            const y0 = s * (WHEEL.y - WHEEL.width / 2), y1 = s * (WHEEL.y + WHEEL.width / 2);
            AcrossY(mesh, x, WHEEL.radius, y0, y1, WHEEL.radius - WHEEL.tyre, WHEEL.sides, "wood");
            AcrossY(mesh, x, WHEEL.radius, y0 + s * 0.3, y1 - s * 0.3, WHEEL.radius, WHEEL.sides, "iron", false);
            AcrossY(mesh, x, WHEEL.radius, y1 - s * 0.2, y1 + s * 0.8, 1.8, 8, "iron");
        }
    }
    // No z-fighting: where a part goes into another, their parallel faces are
    // clearly apart (INSET, or a thickness well off the other's) — faces a
    // few tenths behind another's flicker through it from a distance.
    // The frame: side beams, cross beams between them (ending at their inner faces, not through them).
    for (const s of [-1, 1]) Beam(mesh, [FRAME.x0, s * FRAME.y, FRAME.z], [FRAME.x1, s * FRAME.y, FRAME.z], FRAME.size, "wood");
    const inner = FRAME.y - FRAME.size / 2;
    for (const x of [FRAME.x0 + 2, -4, FRAME.x1 - 2]) Beam(mesh, [x, -inner, FRAME.z], [x, inner, FRAME.z], FRAME.size - 1.2, "darkwood");
    const top = FRAME.z + FRAME.size / 2;
    const foot = top - INSET; // the posts reach only this far into the side beams
    const crossbar = CrossbarAt(), rest = RestBeamAt();
    for (const s of [-1, 1]) {
        const y = s * FRAME.y;
        // The A-frame up to the axle (its two posts of clearly different thickness where they meet), the tall front post up to the crossbar.
        Beam(mesh, [-9, y, foot], [PIVOT[0] - 1, y, PIVOT[2] + 2], POST - 0.5, "wood");
        Beam(mesh, [17, y, foot], [PIVOT[0] + 1, y, PIVOT[2] + 2], POST - 1.1, "wood");
        Beam(mesh, [21, y, foot], [crossbar[0], y, crossbar[2] + 1.5], POST - 0.7, "wood");
        // The rest beam's posts and the winch's.
        Beam(mesh, [rest[0], y, foot], [rest[0], y, rest[2]], POST - 0.9, "wood");
        Beam(mesh, [WINCH.x, y, foot], [WINCH.x, y, WINCH.z + 2.2], POST - 1.3, "darkwood");
        // Iron plates where the A-frame holds the axle, well over the posts.
        Box(mesh, [PIVOT[0], y, PIVOT[2]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [4, POST / 2 + 1, 4], "iron");
    }
    // The axle and its twisted rope skeins.
    AcrossY(mesh, PIVOT[0], PIVOT[2], -FRAME.y - 4.5, FRAME.y + 4.5, 1.4, AXLE.sides, "iron"); // well out of the iron plates
    for (const s of [-1, 1]) {
        AcrossY(mesh, PIVOT[0], PIVOT[2], s * SKEIN.from, s * SKEIN.to, SKEIN.radius, SKEIN.sides, "rope");
        for (let k = 0; k < 3; k++) {
            const y = s * (SKEIN.from + ((SKEIN.to - 1.5 - SKEIN.from) * (k + 0.5)) / 3); // clear of the iron plates
            AcrossY(mesh, PIVOT[0], PIVOT[2], y - 0.4, y + 0.4, SKEIN.radius + 0.6, SKEIN.sides, "darkwood", false);
        }
    }
    // The crossbar with its rope pad, the rest beam with its own.
    AcrossY(mesh, crossbar[0], crossbar[2], -FRAME.y - 3.5, FRAME.y + 3.5, CROSSBAR.radius, 10, "wood"); // 10 sides: with 8 a facet lay along the front post's face
    AcrossY(mesh, crossbar[0], crossbar[2], -CROSSBAR.padY, CROSSBAR.padY, CROSSBAR.pad, 10, "rope");
    AcrossY(mesh, rest[0], rest[2], -FRAME.y - 3.5, FRAME.y + 3.5, REST_BEAM.radius, 10, "wood");
    AcrossY(mesh, rest[0], rest[2], -CROSSBAR.padY, CROSSBAR.padY, CROSSBAR.pad, 10, "rope");
    // The winch: a drum wound with rope, iron discs, a crank.
    AcrossY(mesh, WINCH.x, WINCH.z, -WINCH.y, WINCH.y, WINCH.radius, 10, "rope");
    for (const s of [-1, 1]) AcrossY(mesh, WINCH.x, WINCH.z, s * (WINCH.y - 0.3), s * (WINCH.y + 0.8), WINCH.radius + 1.2, 10, "iron"); // over the drum's end, not flush with it
    AcrossY(mesh, WINCH.x, WINCH.z, -FRAME.y - 2.5, FRAME.y + 4, 0.8, 6, "iron");
    Beam(mesh, [WINCH.x, FRAME.y + 4, WINCH.z], [WINCH.x - 4, FRAME.y + 4, WINCH.z + 3], 1.2, "iron");
}

/** The base's collision: convex pieces, clear of the bucket's swing. Each { corners | box, surfaceProp }. */
function BaseHulls() {
    const box = (x0, x1, y0, y1, z0, z1) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const crossbar = CrossbarAt(), rest = RestBeamAt();
    const top = FRAME.z + FRAME.size / 2;
    const hulls = {
        chassis: { corners: box(FRAME.x0 - 1, FRAME.x1 + 1, -FRAME.y - 2, FRAME.y + 2, FRAME.z - 2, top) },
        crossbar: { corners: box(crossbar[0] - 2.5, crossbar[0] + 2.5, -FRAME.y - 2, FRAME.y + 2, crossbar[2] - 2.5, crossbar[2] + 2.5) },
        rest: { corners: box(rest[0] - 2.5, rest[0] + 2.5, -FRAME.y - 2, FRAME.y + 2, top, rest[2]) }, // up to its middle: the arm's collision lies on it
        winch: { corners: box(WINCH.x - 3.5, WINCH.x + 3.5, -FRAME.y - 1, FRAME.y + 1, top, WINCH.z + 3.5) },
    };
    for (const s of [-1, 1]) {
        const y0 = s * FRAME.y - POST / 2, y1 = s * FRAME.y + POST / 2;
        const side = [[-10, top], [22, top], [crossbar[0] + 2, crossbar[2] + 2], [PIVOT[0] - 3, PIVOT[2] + 4]];
        hulls[`side_${s < 0 ? "r" : "l"}`] = { corners: [...side.map(([x, z]) => [x, y0, z]), ...side.map(([x, z]) => [x, y1, z])] };
        for (const [i, x] of WHEEL.xs.entries()) {
            const wy = s * WHEEL.y;
            hulls[`wheel_${i}${s < 0 ? "r" : "l"}`] = { corners: box(x - WHEEL.radius * 0.8, x + WHEEL.radius * 0.8, wy - WHEEL.width / 2, wy + WHEEL.width / 2, 0, WHEEL.radius * 1.6), surfaceProp: "wood" };
        }
    }
    return hulls;
}

// --- Arm (built at rest, CATAPULT_REST_ANGLE) ---

function BuildArm(mesh) {
    const { along, up } = ArmAxes(CATAPULT_REST_ANGLE);
    const side = [0, 1, 0];
    const axes = [along, side, up];
    const end = V3.Add(PIVOT, V3.Scale(along, CATAPULT_ARM_LENGTH)); // the bucket floor's middle (its top face)
    const half = BUCKET.inner / 2 + BUCKET.wall;
    // The beam: from a stub behind the pivot to under the bucket, thinner
    // towards it (a heavy root at the axle, two pieces), an iron cap on the stub.
    const At = d => V3.Add(PIVOT, V3.Scale(along, d));
    // The tip ends at the bucket's outer wall (under it, faces a few tenths apart z-fought); the braces carry the bucket.
    const mid = CATAPULT_ARM_LENGTH * 0.45, tip = CATAPULT_ARM_LENGTH - half;
    Box(mesh, At((mid - ARM.back) / 2), axes, [(mid + ARM.back) / 2, ARM.width / 2, ARM.height / 2], "wood");
    Box(mesh, At((mid - 0.5 + tip) / 2), axes, [(tip - mid + 0.5) / 2, ARM.width / 2 - 0.8, ARM.height / 2 - 0.9], "wood");
    Box(mesh, At(-ARM.back - 0.4), axes, [0.6, ARM.width / 2 + 0.6, ARM.height / 2 + 0.6], "iron");
    // Bands at least 0.5 proud of the wood (thinner: z-fought): on the root, on the thin part.
    for (const at of ARM.bands) {
        const thin = at > mid ? 0.8 : 0;
        Box(mesh, At(at), axes, [0.7, ARM.width / 2 - thin + 0.6, ARM.height / 2 - (thin ? 0.9 : 0) + 0.6], "iron");
    }
    // Two braces from the beam out under the bucket's corners, so it doesn't sit on a stick.
    for (const s of [-1, 1]) {
        const from = V3.Sub(At(tip - 9), V3.Scale(up, ARM.height / 2 - 1));
        const to = V3.Add(V3.Sub(At(CATAPULT_ARM_LENGTH), V3.Scale(up, BUCKET.wall)), V3.Scale(side, s * (half - 2)));
        Beam(mesh, from, to, 1.6, "darkwood");
    }
    AcrossY(mesh, PIVOT[0], PIVOT[2], -SKEIN.from + 0.3, SKEIN.from - 0.3, ARM.hub, 10, "iron");
    // The bucket: a floor and four walls, the melon's seat in it.
    // The floor inside the walls (reaching into them), its underside a little above theirs: no face flush with another's.
    Box(mesh, V3.Sub(end, V3.Scale(up, (BUCKET.wall - 0.8) / 2)), axes, [half - BUCKET.wall + 0.6, half - BUCKET.wall + 0.6, (BUCKET.wall - 0.8) / 2], "darkwood");
    const wallMid = V3.Add(end, V3.Scale(up, BUCKET.depth / 2 - BUCKET.wall / 2));
    const wallHalfZ = (BUCKET.depth + BUCKET.wall) / 2;
    for (const s of [-1, 1]) {
        Box(mesh, V3.Add(wallMid, V3.Scale(along, s * (half - BUCKET.wall / 2))), axes, [BUCKET.wall / 2, half, wallHalfZ], "wood");
        Box(mesh, V3.Add(wallMid, V3.Scale(side, s * (half - BUCKET.wall / 2))), axes, [half - BUCKET.wall, BUCKET.wall / 2, wallHalfZ], "wood");
    }
    // Iron straps round the bucket's top corners.
    for (const sa of [-1, 1]) for (const ss of [-1, 1]) {
        const corner = V3.Add(V3.Add(end, V3.Scale(along, sa * (half - 0.4))), V3.Add(V3.Scale(side, ss * (half - 0.4)), V3.Scale(up, BUCKET.depth - 1)));
        Box(mesh, corner, axes, [1.1, 1.1, 1.6], "iron"); // 0.5 proud of the walls' faces and top
    }
}

/** The arm's collision at rest, as oriented boxes { center, axes, half }: the bucket and the beam's outer part. */
function ArmCollisionBoxes() {
    const { along, up } = ArmAxes(CATAPULT_REST_ANGLE);
    const side = [0, 1, 0];
    const axes = [along, side, up];
    const end = V3.Add(PIVOT, V3.Scale(along, CATAPULT_ARM_LENGTH));
    const half = BUCKET.inner / 2 + BUCKET.wall;
    const At = d => V3.Add(PIVOT, V3.Scale(along, d));
    const wallMid = V3.Add(end, V3.Scale(up, BUCKET.depth / 2 - BUCKET.wall / 2));
    const wallHalfZ = (BUCKET.depth + BUCKET.wall) / 2;
    const from = CROSSBAR.reach + 4, to = CATAPULT_ARM_LENGTH - half; // past the crossbar
    const boxes = [
        { center: V3.Sub(end, V3.Scale(up, BUCKET.wall / 2)), axes, half: [half, half, BUCKET.wall / 2] }, // the floor
        { center: At((from + to) / 2), axes, half: [(to - from) / 2, ARM.width / 2 - 0.8, ARM.height / 2 - 0.9] }, // the beam's outer part
    ];
    for (const s of [-1, 1]) {
        boxes.push({ center: V3.Add(wallMid, V3.Scale(along, s * (half - BUCKET.wall / 2))), axes, half: [BUCKET.wall / 2, half, wallHalfZ] });
        boxes.push({ center: V3.Add(wallMid, V3.Scale(side, s * (half - BUCKET.wall / 2))), axes, half: [half - BUCKET.wall, BUCKET.wall / 2, wallHalfZ] });
    }
    return boxes;
}

/** A box turned with the arm from rest to `angle` (around the pivot, Hammer's Y). */
function SwungBox({ center, axes, half }, angle) {
    const rest = ArmAxes(CATAPULT_REST_ANGLE), now = ArmAxes(angle);
    const Turn = v => V3.Add(V3.Scale(now.along, V3.Dot(v, rest.along)), V3.Add(V3.Scale(now.up, V3.Dot(v, rest.up)), [0, v[1], 0]));
    return { center: V3.Add(PIVOT, Turn(V3.Sub(center, PIVOT))), axes: axes.map(Turn), half };
}

/** Points over a box's faces, at most `step` apart. */
function BoxSurfacePoints({ center, axes, half }, step = 1) {
    const points = [];
    for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
        const [b, c] = [0, 1, 2].filter(k => k !== a);
        const nb = Math.max(1, Math.ceil((2 * half[b]) / step)), nc = Math.max(1, Math.ceil((2 * half[c]) / step));
        for (let i = 0; i <= nb; i++) for (let j = 0; j <= nc; j++) {
            const local = [0, 0, 0];
            local[a] = s * half[a];
            local[b] = -half[b] + (2 * half[b] * i) / nb;
            local[c] = -half[c] + (2 * half[c] * j) / nc;
            points.push(V3.Add(center, V3.Add(V3.Scale(axes[0], local[0]), V3.Add(V3.Scale(axes[1], local[1]), V3.Scale(axes[2], local[2])))));
        }
    }
    return points;
}

/** A convex hull's faces (planes { n, d }, outwards) from its corners. */
function HullPlanes(corners) {
    const planes = [];
    for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) for (let k = j + 1; k < corners.length; k++) {
        const n0 = V3.Cross(V3.Sub(corners[j], corners[i]), V3.Sub(corners[k], corners[i]));
        if (Math.hypot(...n0) < 1e-6) continue;
        let n = V3.Unit(n0), d = V3.Dot(n, corners[i]);
        const sides = corners.map(c => V3.Dot(n, c) - d);
        if (sides.every(x => x <= 1e-4)) planes.push({ n, d });
        else if (sides.every(x => x >= -1e-4)) planes.push({ n: V3.Scale(n, -1), d: -d });
    }
    return planes;
}

/**
 * Over the whole swing (rest to the crossbar, every degree): does the arm's
 * collision come within ARM_CLEARANCE of the base's? Points over each arm
 * box tested inside each base hull (grown), and the base hulls' corners and
 * points between them inside each arm box (grown). Returns the hits.
 */
function ArmClearance(armBoxes, baseHulls) {
    const hulls = Object.entries(baseHulls).map(([piece, { corners }]) => {
        const points = [];
        for (const a of corners) for (const b of corners) for (let k = 0; k <= 8; k++) points.push(V3.Add(a, V3.Scale(V3.Sub(b, a), k / 8)));
        return { piece, planes: HullPlanes(corners), points };
    });
    const hits = new Set();
    for (let angle = CATAPULT_REST_ANGLE; angle <= CATAPULT_FIRE_ANGLE; angle++) {
        for (const [i, box] of armBoxes.entries()) {
            const swung = SwungBox(box, angle);
            const points = BoxSurfacePoints(swung);
            for (const hull of hulls) {
                const armIn = points.some(p => hull.planes.every(({ n, d }) => V3.Dot(n, p) <= d + ARM_CLEARANCE));
                const baseIn = hull.points.some(p => swung.axes.every((ax, k) => Math.abs(V3.Dot(V3.Sub(p, swung.center), ax)) <= swung.half[k] + ARM_CLEARANCE));
                if (armIn || baseIn) hits.add(`arm box ${i} / base ${hull.piece} at ${angle} degrees`);
            }
        }
    }
    return [...hits];
}

// --- Skeleton and animations ---

// ModelDoc turns an .smd 90 degrees around Z ((x, y, z) -> (-y, x, z)): written turned back.
const Unturn = ([x, y, z]) => [y, -x, z];
const BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    { name: "arm", parent: 0, bind: Unturn(PIVOT) },
];
const ARM_BONE = 1;
/** The skeleton with the arm at `angle`: turned around Hammer's Y (the file's X), up from rest. */
function ArmFrame(angle) {
    const frame = BindFrame(BONES);
    frame[ARM_BONE].rot = [Rad(angle - CATAPULT_REST_ANGLE), 0, 0];
    return frame;
}
const Frames = (phase, seconds) => Array.from({ length: Math.max(1, Math.round(seconds * FPS)) + 1 }, (_, f) => ArmFrame(ArmAngle(phase, Math.min(seconds, f / FPS))));

// --- Write ---

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const UsedMaterials = mesh => Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]]));

const base = new Mesh(32);
BuildBase(base);
const hulls = Object.entries(BaseHulls()).map(([piece, { corners, surfaceProp = "wood" }]) => {
    const hull = new Mesh();
    for (let i = 1; i + 1 < corners.length; i++) hull.Tri(corners[0], corners[i], corners[i + 1], "wood"); // ModelDoc hulls the points
    const file = `${MODEL_DIR}/${NAME}_base_hull_${piece}.obj`;
    WriteAddonFile(file, ObjText(hull, NAME, GENERATOR));
    return { file, surfaceProp };
});
WriteAddonFile(`${MODEL_DIR}/${NAME}_base.obj`, ObjText(base, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}_base.vmdl`, VmdlText({
    name: NAME, mesh: `${MODEL_DIR}/${NAME}_base.obj`, materials: UsedMaterials(base),
    hulls, body: { mass: MASS_KG, linearDamping: LINEAR_DAMPING, angularDamping: ANGULAR_DAMPING },
}));

const arm = new Mesh(32);
BuildArm(arm);
const triangles = MeshSmdTriangles(arm, NAME, ARM_BONE)
    .map(tri => ({ ...tri, corners: tri.corners.map(c => ({ ...c, p: Unturn(c.p), n: Unturn(c.n) })) }));
const animations = [
    { name: "idle", frames: [ArmFrame(CATAPULT_REST_ANGLE)], looping: true },
    { name: "fire", frames: Frames("firing", CATAPULT_FIRE_SECONDS), looping: false },
    { name: "fired", frames: [ArmFrame(CATAPULT_FIRE_ANGLE)], looping: true },
    { name: "reload", frames: Frames("reloading", CATAPULT_RELOAD_SECONDS), looping: false },
].map(a => ({ ...a, file: `${MODEL_DIR}/${NAME}_arm_${a.name}.smd` }));
WriteAddonFile(`${MODEL_DIR}/${NAME}_arm.smd`, SmdText(BONES, triangles));
for (const a of animations) WriteAddonFile(a.file, SmdAnimationText(BONES, a.frames));
const armBoxes = ArmCollisionBoxes();
const clashes = ArmClearance(armBoxes, BaseHulls());
if (clashes.length) {
    throw new Error(`the arm's collision comes within ${ARM_CLEARANCE} of the base's:\n  ${clashes.slice(0, 12).join("\n  ")}`);
}
const armPhysics = new Mesh();
for (const box of armBoxes) Box(armPhysics, box.center, box.axes, box.half, "wood");
// In Hammer's frame like the arm (written turned back), so no { smd: true } turn here; model space, on the arm's bone.
const armPhysicsObj = `${MODEL_DIR}/${NAME}_arm_physics.obj`;
WriteAddonFile(armPhysicsObj, ObjText(armPhysics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}_arm.vmdl`, VmdlText({
    name: NAME, mesh: `${MODEL_DIR}/${NAME}_arm.smd`, materials: UsedMaterials(arm),
    animations: animations.map(({ name, file, looping }) => ({ name, file, looping })),
    physicsObj: [{ file: armPhysicsObj, bone: "arm" }], surfaceProp: "wood",
}));

for (const [part, { rgb, metalness }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, metalness, tint: 0 }));
}
const seat = SeatOffset(CATAPULT_REST_ANGLE);
console.log(`${NAME}_base.vmdl: ${base.triangleCount} triangles, ${hulls.length} collision hulls, ${MASS_KG} kg`);
console.log(`${NAME}_arm.vmdl: ${arm.triangleCount} triangles (collision ${armPhysics.triangleCount}: bucket + outer beam, clear of the base by ${ARM_CLEARANCE} all the swing), animations ${animations.map(a => `${a.name} (${a.frames.length})`).join(", ")}`);
console.log(`the seat at rest: ${seat.x.toFixed(1)} ${seat.z.toFixed(1)} (x, z); crossbar at ${CrossbarAt().map(n => n.toFixed(1)).join(" ")}`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_{base,arm}.vmdl"`);
