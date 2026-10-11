// Generates a foam swinger on a spring — `node tools/models/make-bouncer-model.mjs`:
// a tall, flat, cushion-ribbed pink foam paddle standing straight up on a
// chrome coil spring, its top edge lime, swinging from side to side like a
// metronome — an obstacle in the air the melons have to time their way past.
// Flat and board-like on purpose (a rounded rectangle in cross-section, flat
// top): a round foam column read as something else entirely. The spring is
// skinned to a chain of bones and bends with the swing; the paddle rides
// rigidly on the top one ("head"):
//   swing   one full swing there and back (SWING_SECONDS), looping
//   idle    the rest pose, upright (one frame)
// Use it as a prop_dynamic; the script (src/melon_drive/world/bouncer/) finds
// it by model and starts its "swing" loop at a random point, so several
// don't swing in step — leave Starting/Idle Animation empty. The paddle
// swings across its broad face, along Y here — X in Hammer, ModelDoc turns
// an .smd 90 degrees (stand it across the track: the melons come at its face). Collision: the base and
// coil on the root, the paddle on "head", so it swings along. Writes
//   models/melon_racer/bouncer/bouncer.smd           render mesh + skeleton (bind pose)
//   models/melon_racer/bouncer/bouncer_{swing,idle}.smd   the animations
//   models/melon_racer/bouncer/bouncer_physics{,_paddle}.obj   collision: base + coil, paddle
//   models/melon_racer/bouncer/bouncer.vmdl
//   materials/melon_racer/bouncer/bouncer_{foam,cap,spring,base}.vmat (+ _color.png)
// The foam uses the inflatable vinyl's roughness (make-inflatable.mjs — run
// that first). Compile the .vmdl with resourcecompiler (see the end of the
// output). Origin on the floor under the spring.
import { BOUNCER_SWING_SECONDS } from "../../src/melon_drive/world/bouncer/constants.js";
import { BindFrame, Mesh, ObjText, SmdAnimationText, SmdText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units) ---
const BASE_RADIUS = 18; // the disc the spring stands on
const BASE_HEIGHT = 3;
const COIL_RADIUS = 9; // helix, to the wire's center
const WIRE_RADIUS = 1.6;
const COIL_TURNS = 6;
const COIL_BOTTOM = BASE_HEIGHT + WIRE_RADIUS;
const COIL_TOP = 30;
const COLLAR_RADIUS = 12; // the ring the paddle sits in, on top of the spring
const COLLAR_HEIGHT = 5;
const PADDLE_LENGTH = 110; // from the collar up
const PADDLE_HALF_WIDTH = 24; // across, along Y
const PADDLE_HALF_THICKNESS = 6; // along X
const PADDLE_ROUNDNESS = 4; // cross-section exponent: 2 = an oval, higher = a rectangle with rounded corners
const PADDLE_SEGMENTS = 7; // foam cushions along the paddle
const GROOVE_DEPTH = 0.18; // how far the paddle narrows between two cushions (share of its thickness)
const CAP_LENGTH = 12; // the lime top edge (part of the paddle's length, same cross-section)

// --- swing animation ---
const SPRING_BONES = 4; // segments the coil bends in
const FPS = 30;
const SWING_SECONDS = BOUNCER_SWING_SECONDS; // one full swing there and back (shared with the script, which starts each bouncer at a random point of it)
const SWING_DEGREES = 38; // how far the paddle leans out to each side
const SPRING_SHARE = 0.4; // the share of the lean the coil bends; the paddle tilts the rest on top
const HEAD_LAG = 0.06; // the paddle follows the coil's bend this share of a swing late: a soft, springy swing

// --- look ---
const FOAM_COLOR = [0xf2, 0x6c, 0xb8]; // bubblegum pink
const BASE_COLOR = [0xd0, 0x4a, 0x98]; // darker pink: base disc, collar
const CAP_COLOR = [0x9a, 0xd8, 0x3c]; // lime — off-palette on purpose (decoration, not a guide line)
const SPRING_COLOR = [0xd8, 0xdc, 0xe0]; // chrome
const SPRING_ROUGHNESS = 0.25;
const SURFACE_PROP = "rubber";
const UV_TILE = 64;
const SIDES = 14; // around the base and the collar
const PADDLE_SIDES = 24; // around the paddle: enough for its rounded corners
const RINGS_PER_SEGMENT = 5; // enough for the groove between two cushions
const WIRE_SIDES = 6; // a thin wire: reads round at play distance
const COIL_STEPS_PER_TURN = 16;

const NAME = "bouncer";
const MODEL_DIR = "models/melon_racer/bouncer";
const MATERIAL_DIR = "materials/melon_racer/bouncer";
const GENERATOR = "tools/models/make-bouncer-model.mjs";
const PARTS = ["foam", "cap", "spring", "base"];

// --- vector helpers ---
const Add = (a, b) => a.map((n, i) => n + b[i]);
const Sub = (a, b) => a.map((n, i) => n - b[i]);
const Scale = (a, s) => a.map(n => n * s);
const Dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const Cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const Normalize = a => Scale(a, 1 / Math.hypot(...a));

// --- skeleton: root, then a chain up the coil; the last one ("head") carries the collar and the paddle ---
const SEGMENT = (COIL_TOP - COIL_BOTTOM) / SPRING_BONES;
const BONES = [{ name: "root", parent: -1, bind: [0, 0, 0] }];
for (let i = 0; i <= SPRING_BONES; i++) {
    BONES.push({
        name: i === SPRING_BONES ? "head" : `spring_${i}`,
        parent: i === 0 ? 0 : i,
        bind: i === 0 ? [0, 0, COIL_BOTTOM] : [0, 0, SEGMENT], // local, relative to the parent
    });
}
const HEAD = SPRING_BONES + 1;

/** Skin weights of a point at height z on the coil: blended between the two nearest bones. */
function CoilWeights(z) {
    const p = Math.min(Math.max((z - COIL_BOTTOM) / SEGMENT, 0), SPRING_BONES);
    const i = Math.min(Math.floor(p), SPRING_BONES - 1);
    const f = p - i;
    return [[1 + i, 1 - f], [2 + i, f]].filter(([, w]) => w > 1e-4);
}

// --- render mesh: vertices with normal, uv and skin weights; triangles per part ---
const verts = [];
/** @type {Record<string, number[][]>} */
const tris = Object.fromEntries(PARTS.map(p => [p, []]));
const physics = new Mesh(UV_TILE); // on the root: base and coil
const paddlePhysics = new Mesh(UV_TILE); // on the head: swings with the paddle

function Vertex(p, n, uv, weights) {
    verts.push({ p, n, uv, weights });
    return verts.length - 1;
}

/** A triangle, turned so its winding faces the way its vertices' normals point. */
function Tri(a, b, c, part) {
    const [pa, pb, pc] = [a, b, c].map(i => verts[i].p);
    const n = Cross(Sub(pb, pa), Sub(pc, pa));
    if (Math.hypot(...n) < 1e-9) return;
    const avg = Add(Add(verts[a].n, verts[b].n), verts[c].n);
    tris[part].push(Dot(n, avg) >= 0 ? [a, b, c] : [a, c, b]);
}

/**
 * A closed tube from rings of points: rings[i] = { center, normal (any
 * direction ⟂ the tube), side (⟂ both), radius (along normal), width (its
 * radius along side as a share of `radius`, default 1), roundness (the
 * cross-section's exponent, default 2: an ellipse), slope (dradius/ds), v }.
 * Ends stay open unless `caps`.
 */
function Tube(rings, sides, part, weightsOf, caps = false) {
    const ids = rings.map(r => {
        const t = Normalize(Cross(r.normal, r.side));
        const a = r.radius, b = r.radius * (r.width ?? 1), n = r.roundness ?? 2;
        const ring = [];
        let around = 0, last = null;
        for (let k = 0; k <= sides; k++) { // k = sides repeats k = 0 with u = 1, for the UV seam
            const phi = (2 * Math.PI * k) / sides;
            const c = Math.cos(phi), s = Math.sin(phi);
            // A superellipse |x/a|^n + |y/b|^n = 1, and its normal from the gradient.
            const x = a * Math.sign(c) * Math.abs(c) ** (2 / n), y = b * Math.sign(s) * Math.abs(s) ** (2 / n);
            const p = Add(r.center, Add(Scale(r.normal, x), Scale(r.side, y)));
            const gx = Math.sign(x) * Math.abs(x / a) ** (n - 1) / a, gy = Math.sign(y) * Math.abs(y / b) ** (n - 1) / b;
            const outward = Normalize(Add(Scale(r.normal, gx), Scale(r.side, gy)));
            // A widening tube leans its surface back: tilt the normal against the tangent.
            const normal = Normalize(Sub(outward, Scale(t, r.slope ?? 0)));
            if (last) around += Math.hypot(...Sub(p, last));
            last = p;
            ring.push(Vertex(p, normal, [around / UV_TILE, r.v / UV_TILE], weightsOf(r)));
        }
        return ring;
    });
    for (let i = 0; i + 1 < ids.length; i++) {
        for (let k = 0; k < sides; k++) {
            const a = ids[i][k], b = ids[i][k + 1], c = ids[i + 1][k + 1], d = ids[i + 1][k];
            Tri(a, b, c, part);
            Tri(a, c, d, part);
        }
    }
    if (!caps) return;
    for (const [end, dir] of [[0, -1], [rings.length - 1, 1]]) {
        const r = rings[end];
        const t = Scale(Normalize(Cross(r.normal, r.side)), dir);
        const center = Vertex(r.center, t, [0, 0], weightsOf(r));
        const ring = ids[end].map(i => Vertex(verts[i].p, t, verts[i].uv, verts[i].weights));
        for (let k = 0; k < sides; k++) Tri(center, ring[k], ring[k + 1], part);
    }
}

/** An upright cylinder (with top and bottom) for render and collision, rigid on one bone. */
function Cylinder(radius, z0, z1, part, bone, collision) {
    const rings = [z0, z1].map(z => ({ center: [0, 0, z], normal: [1, 0, 0], side: [0, 1, 0], radius, v: z }));
    // Sharp edges: the side and the caps get their own vertices.
    Tube(rings, SIDES, part, () => [[bone, 1]], true);
    PhysicsPrism(collision, rings.map(r => r.center[2]), Array.from({ length: 12 }, (_, k) => {
        const phi = (2 * Math.PI * k) / 12;
        return [radius * Math.cos(phi), radius * Math.sin(phi)];
    }));
}

/**
 * A closed upright prism for collision (low poly, flat triangles in Mesh):
 * the 2D `outline` (XY, counter-clockwise) from height z0 to z1.
 */
function PhysicsPrism(mesh, [z0, z1], outline) {
    const lo = outline.map(([x, y]) => [x, y, z0]), hi = outline.map(([x, y]) => [x, y, z1]);
    const Out = (a, b, c, outward) => {
        const n = Cross(Sub(b, a), Sub(c, a));
        if (Dot(n, outward) >= 0) mesh.Tri(a, b, c, "physics");
        else mesh.Tri(a, c, b, "physics");
    };
    const count = outline.length;
    for (let k = 0; k < count; k++) {
        const k1 = (k + 1) % count;
        const outward = [...Scale(Add(outline[k], outline[k1]), 0.5), 0];
        Out(lo[k], lo[k1], hi[k1], outward);
        Out(lo[k], hi[k1], hi[k], outward);
    }
    for (let k = 1; k + 1 < count; k++) {
        Out(lo[0], lo[k], lo[k + 1], [0, 0, -1]);
        Out(hi[0], hi[k], hi[k + 1], [0, 0, 1]);
    }
}

// Base disc (on root) and the collar on top of the spring (on head, so it tilts with the paddle).
Cylinder(BASE_RADIUS, 0, BASE_HEIGHT, "base", 0, physics);
Cylinder(COLLAR_RADIUS, COIL_TOP, COIL_TOP + COLLAR_HEIGHT, "base", HEAD, paddlePhysics);

// The coil: a helix tube, each ring skinned by its centerline's height so the
// wire's cross-section stays round while the spring bends.
{
    const steps = COIL_TURNS * COIL_STEPS_PER_TURN;
    const rings = [];
    for (let i = 0; i <= steps; i++) {
        const a = (2 * Math.PI * i) / COIL_STEPS_PER_TURN;
        const z = COIL_BOTTOM + ((COIL_TOP - COIL_BOTTOM) * i) / steps;
        const radial = [Math.cos(a), Math.sin(a), 0];
        const tangent = Normalize([-Math.sin(a) * COIL_RADIUS, Math.cos(a) * COIL_RADIUS, (COIL_TOP - COIL_BOTTOM) / (COIL_TURNS * 2 * Math.PI)]);
        rings.push({ center: Scale(radial, COIL_RADIUS).map((n, k) => (k === 2 ? z : n)), normal: radial, side: Cross(tangent, radial), radius: WIRE_RADIUS, v: i * 2, z });
    }
    Tube(rings, WIRE_SIDES, "spring", r => CoilWeights(r.z), true);
    // Collision: the coil as one solid cylinder — the melon can't get between its turns anyway.
    PhysicsPrism(physics, [COIL_BOTTOM - WIRE_RADIUS, COIL_TOP], Array.from({ length: 12 }, (_, k) => {
        const phi = (2 * Math.PI * k) / 12;
        return [(COIL_RADIUS + WIRE_RADIUS) * Math.cos(phi), (COIL_RADIUS + WIRE_RADIUS) * Math.sin(phi)];
    }));
}

// The paddle: straight up out of the collar, a flat board in cross-section
// (thin along X, wide along Y), ribbed into cushions, its top edge lime.
const PADDLE_START = COIL_TOP + COLLAR_HEIGHT - 2; // a little inside the collar
const FOAM_LENGTH = PADDLE_LENGTH - CAP_LENGTH;

/** The paddle's thickness factor at s along the foam: full in each cushion, narrowing into a groove between two. */
function Cushion(s) {
    const f = (s / FOAM_LENGTH) * PADDLE_SEGMENTS;
    const frac = f - Math.floor(f);
    return 1 - GROOVE_DEPTH * (1 - Math.sin(Math.PI * frac)) ** 3;
}

{
    const PaddleRing = (s, factor, slope) => ({
        center: [0, 0, PADDLE_START + s], normal: [1, 0, 0], side: [0, 1, 0],
        radius: PADDLE_HALF_THICKNESS * factor, width: PADDLE_HALF_WIDTH / PADDLE_HALF_THICKNESS,
        roundness: PADDLE_ROUNDNESS, slope, v: s,
    });
    const count = PADDLE_SEGMENTS * RINGS_PER_SEGMENT;
    const rings = [];
    for (let i = 0; i <= count; i++) {
        const s = (FOAM_LENGTH * i) / count;
        const ds = 0.01;
        const slope = PADDLE_HALF_THICKNESS * (Cushion(Math.min(s + ds, FOAM_LENGTH)) - Cushion(Math.max(s - ds, 0))) / (2 * ds);
        rings.push(PaddleRing(s, Cushion(s), slope));
    }
    Tube(rings, PADDLE_SIDES, "foam", () => [[HEAD, 1]], true);
    // The lime top edge: the same board, flat on top.
    Tube([PaddleRing(FOAM_LENGTH - 0.5, 1, 0), PaddleRing(PADDLE_LENGTH, 1, 0)], PADDLE_SIDES, "cap", () => [[HEAD, 1]], true);

    // Collision: one box-like prism around the whole paddle.
    PhysicsPrism(paddlePhysics, [PADDLE_START, PADDLE_START + PADDLE_LENGTH], Array.from({ length: 12 }, (_, k) => {
        const c = Math.cos((2 * Math.PI * k) / 12), s = Math.sin((2 * Math.PI * k) / 12);
        const e = 2 / PADDLE_ROUNDNESS;
        return [PADDLE_HALF_THICKNESS * Math.sign(c) * Math.abs(c) ** e, PADDLE_HALF_WIDTH * Math.sign(s) * Math.abs(s) ** e];
    }));
}

// --- animations (SMD, written by model.mjs) ---
/** The swing at time t: the lean out to the side (radians, around X), a smooth sine. */
const Lean = t => (SWING_DEGREES * Math.PI / 180) * Math.sin((2 * Math.PI * t) / SWING_SECONDS);

function SwingFrame(t) {
    const frame = BindFrame(BONES);
    // The coil bends its share, spread over its bones; the paddle tilts the rest a little later.
    for (let i = 1; i <= SPRING_BONES; i++) frame[i].rot = [(SPRING_SHARE * Lean(t)) / SPRING_BONES, 0, 0];
    frame[HEAD].rot = [(1 - SPRING_SHARE) * Lean(t - HEAD_LAG * SWING_SECONDS), 0, 0];
    return frame;
}

const triangles = Object.entries(tris).flatMap(([part, list]) => list.map(tri => ({
    material: `${NAME}_${part}`,
    corners: tri.map(i => verts[i]),
})));
// The loop's last frame would repeat its first: leave it out.
const swingFrames = Array.from({ length: Math.round(SWING_SECONDS * FPS) }, (_, f) => SwingFrame(f / FPS));
const materials = Object.fromEntries(PARTS.map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const vmdl = VmdlText({
    name: NAME,
    mesh: `${MODEL_DIR}/${NAME}.smd`,
    physicsObj: [
        { file: `${MODEL_DIR}/${NAME}_physics.obj`, bone: "" },
        { file: `${MODEL_DIR}/${NAME}_physics_paddle.obj`, bone: "head" },
    ],
    materials,
    animations: [
        { name: "swing", file: `${MODEL_DIR}/${NAME}_swing.smd`, looping: true },
        { name: "idle", file: `${MODEL_DIR}/${NAME}_idle.smd`, looping: true },
    ],
    surfaceProp: SURFACE_PROP,
});

WriteAddonFile(`${MODEL_DIR}/${NAME}.smd`, SmdText(BONES, triangles));
WriteAddonFile(`${MODEL_DIR}/${NAME}_swing.smd`, SmdAnimationText(BONES, swingFrames));
WriteAddonFile(`${MODEL_DIR}/${NAME}_idle.smd`, SmdAnimationText(BONES, [BindFrame(BONES)]));
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics.obj`, ObjText(physics, NAME, GENERATOR, { smd: true }));
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics_paddle.obj`, ObjText(paddlePhysics, NAME, GENERATOR, { smd: true }));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, vmdl);

const rough = `${MATERIAL_DIR}/${NAME}_spring_rough.png`;
WriteAddonFile(rough, SolidPng(Array(3).fill(Math.round(SPRING_ROUGHNESS * 255))));
for (const [part, rgb, options] of [
    ["foam", FOAM_COLOR, { roughness: "materials/melon_racer/surfaces/inflatable_rough.png" }],
    ["base", BASE_COLOR, { roughness: "materials/melon_racer/surfaces/inflatable_rough.png" }],
    ["cap", CAP_COLOR, { roughness: "materials/melon_racer/surfaces/inflatable_rough.png" }],
    ["spring", SPRING_COLOR, { metalness: 1, roughness: rough }],
]) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...options }));
}

const triangleCount = Object.values(tris).reduce((s, t) => s + t.length, 0);
const top = PADDLE_START + PADDLE_LENGTH;
console.log(`${triangleCount} triangles (collision ${physics.triangleCount} + paddle ${paddlePhysics.triangleCount}), ${BONES.length} bones, swing ${swingFrames.length} frames; ${top.toFixed(0)} high, ${(2 * PADDLE_HALF_WIDTH).toFixed(0)} wide, sweeps ${(2 * top * Math.sin(SWING_DEGREES * Math.PI / 180)).toFixed(0)} across at the top`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
