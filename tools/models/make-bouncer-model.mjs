// Generates a foam bouncer on a spring — `node tools/models/make-bouncer-model.mjs`:
// a pink, cushion-ribbed foam tube arching up and over from a chrome coil
// spring, ending in a lime cap, like a playground spring rider. The spring
// is skinned to a chain of bones, so it really compresses and bends:
//   idle    the rest pose (one frame)
//   boing   hit: the spring squashes, overshoots, and wobbles out (BOING_SECONDS)
// Use it as a prop_dynamic (Idle Animation "idle") and fire
// SetAnimationNotLooping "boing" at it, e.g. from a trigger_multiple around
// it (OnStartTouch) — no script involved. Writes
//   models/melon_racer/bouncer/bouncer.smd           render mesh + skeleton (bind pose)
//   models/melon_racer/bouncer/bouncer_{idle,boing}.smd   the animations
//   models/melon_racer/bouncer/bouncer_physics.obj   collision (static, the rest pose)
//   models/melon_racer/bouncer/bouncer.vmdl
//   materials/melon_racer/bouncer/bouncer_{foam,cap,cap_rim,spring,base}.vmat (+ _color.png)
// The foam uses the inflatable vinyl's roughness (make-inflatable.mjs — run
// that first). Compile the .vmdl with resourcecompiler (see the end of the
// output). Origin on the floor under the spring; the arch reaches out along +X.
import { BindFrame, Mesh, ObjText, SmdAnimationText, SmdText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units) ---
const BASE_RADIUS = 14; // the disc the spring stands on
const BASE_HEIGHT = 3;
const COIL_RADIUS = 9; // helix, to the wire's center
const WIRE_RADIUS = 1.6;
const COIL_TURNS = 6;
const COIL_BOTTOM = BASE_HEIGHT + WIRE_RADIUS;
const COIL_TOP = 30;
const COLLAR_RADIUS = 12; // the ring the foam tube sits in, on top of the spring
const COLLAR_HEIGHT = 5;
const TUBE_RADIUS = 11;
const TUBE_RISE = 20; // straight up out of the collar before the arch
const ARCH_RADIUS = 34; // the arch's centerline: a half circle over to +X
const TUBE_SEGMENTS = 12; // foam cushions along the tube
const GROOVE_DEPTH = 0.13; // how far the tube narrows between two cushions (share of its radius)
const CAP_LENGTH = 12; // the lime end cap, straight down at the arch's end
const CAP_RADIUS = TUBE_RADIUS * 1.04;
const RIM_RADIUS = 1.8; // the lighter lip around the cap's open end

// --- spring animation ---
const SPRING_BONES = 4; // segments the coil bends/compresses in
const FPS = 30;
const BOING_SECONDS = 1.8;
const SQUASH = 0.42; // first compression, share of the coil's length
const SQUASH_HZ = 2.6;
const SQUASH_DAMPING = 2.4; // 1/s
const WOBBLE_DEGREES = 16; // first sway along the arch (around Y), over the whole coil
const WOBBLE_HZ = 1.7;
const WOBBLE_DAMPING = 2.0;
const SIDE_WOBBLE_DEGREES = 7; // a smaller, faster sway across it (around X)
const SIDE_WOBBLE_HZ = 2.3;
const HEAD_LAG_SECONDS = 0.08; // the foam tube follows the spring's sway a little late …
const HEAD_FOLLOW = 0.45; // … with this share of it on top

// --- look ---
const FOAM_COLOR = [0xf2, 0x6c, 0xb8]; // bubblegum pink
const BASE_COLOR = [0xd0, 0x4a, 0x98]; // darker pink: base disc, collar
const CAP_COLOR = [0x9a, 0xd8, 0x3c]; // lime — off-palette on purpose (decoration, not a guide line)
const CAP_RIM_COLOR = [0xc8, 0xf0, 0x8c];
const SPRING_COLOR = [0xd8, 0xdc, 0xe0]; // chrome
const SPRING_ROUGHNESS = 0.25;
const SURFACE_PROP = "rubber";
const UV_TILE = 64;
const SIDES = 14; // around the foam tube
const RINGS_PER_SEGMENT = 5; // enough for the groove between two cushions
const WIRE_SIDES = 6; // a thin wire: reads round at play distance
const COIL_STEPS_PER_TURN = 16;

const NAME = "bouncer";
const MODEL_DIR = "models/melon_racer/bouncer";
const MATERIAL_DIR = "materials/melon_racer/bouncer";
const GENERATOR = "tools/models/make-bouncer-model.mjs";
const PARTS = ["foam", "cap", "cap_rim", "spring", "base"];

// --- vector helpers ---
const Add = (a, b) => a.map((n, i) => n + b[i]);
const Sub = (a, b) => a.map((n, i) => n - b[i]);
const Scale = (a, s) => a.map(n => n * s);
const Dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const Cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const Normalize = a => Scale(a, 1 / Math.hypot(...a));

// --- skeleton: root, then a chain up the coil; the last one ("head") carries the collar and the tube ---
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
const physics = new Mesh(UV_TILE);

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
 * direction ⟂ the tube), side (⟂ both), radius, slope (dradius/ds), v }.
 * Ends stay open unless `caps`.
 */
function Tube(rings, sides, part, weightsOf, caps = false) {
    const ids = rings.map(r => {
        const t = Normalize(Cross(r.normal, r.side));
        const ring = [];
        for (let k = 0; k <= sides; k++) { // k = sides repeats k = 0 with u = 1, for the UV seam
            const phi = (2 * Math.PI * k) / sides;
            const radial = Add(Scale(r.normal, Math.cos(phi)), Scale(r.side, Math.sin(phi)));
            const p = Add(r.center, Scale(radial, r.radius));
            // A widening tube leans its surface back: tilt the normal against the tangent.
            const n = Normalize(Sub(radial, Scale(t, r.slope ?? 0)));
            ring.push(Vertex(p, n, [(k / sides) * ((2 * Math.PI * r.radius) / UV_TILE), r.v / UV_TILE], weightsOf(r)));
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
function Cylinder(radius, z0, z1, part, bone) {
    const rings = [z0, z1].map(z => ({ center: [0, 0, z], normal: [1, 0, 0], side: [0, 1, 0], radius, v: z }));
    // Sharp edges: the side and the caps get their own vertices.
    Tube(rings, SIDES, part, () => [[bone, 1]], true);
    PhysicsTube(rings.map(r => r.center), () => radius, [0, 1, 0], 12, true);
}

/** The collision version of a tube along `centers` (low poly, flat triangles in Mesh). */
function PhysicsTube(centers, radiusAt, side, sides, caps) {
    const rings = centers.map((c, i) => {
        const t = Normalize(Sub(centers[Math.min(i + 1, centers.length - 1)], centers[Math.max(i - 1, 0)]));
        const normal = Normalize(Cross(side, t));
        const s = Normalize(Cross(t, normal));
        return Array.from({ length: sides }, (_, k) => {
            const phi = (2 * Math.PI * k) / sides;
            return Add(c, Scale(Add(Scale(normal, Math.cos(phi)), Scale(s, Math.sin(phi))), radiusAt(i)));
        });
    });
    const Out = (a, b, c, outward) => {
        const n = Cross(Sub(b, a), Sub(c, a));
        if (Dot(n, outward) >= 0) physics.Tri(a, b, c, "physics");
        else physics.Tri(a, c, b, "physics");
    };
    for (let i = 0; i + 1 < rings.length; i++) {
        for (let k = 0; k < sides; k++) {
            const k1 = (k + 1) % sides;
            const mid = Scale(Add(centers[i], centers[i + 1]), 0.5);
            const outward = Sub(rings[i][k], mid);
            Out(rings[i][k], rings[i][k1], rings[i + 1][k1], outward);
            Out(rings[i][k], rings[i + 1][k1], rings[i + 1][k], outward);
        }
    }
    if (!caps) return;
    for (const [end, other] of [[0, 1], [rings.length - 1, rings.length - 2]]) {
        const outward = Sub(centers[end], centers[other]);
        for (let k = 1; k + 1 < sides; k++) Out(rings[end][0], rings[end][k], rings[end][k + 1], outward);
    }
}

// Base disc (on root) and the collar on top of the spring (on head, so it rides along).
Cylinder(BASE_RADIUS, 0, BASE_HEIGHT, "base", 0);
Cylinder(COLLAR_RADIUS, COIL_TOP, COIL_TOP + COLLAR_HEIGHT, "base", HEAD);

// The coil: a helix tube, each ring skinned by its centerline's height so the
// wire's cross-section stays round while the spring squashes.
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
    PhysicsTube([[0, 0, COIL_BOTTOM - WIRE_RADIUS], [0, 0, COIL_TOP]], () => COIL_RADIUS + WIRE_RADIUS, [0, 1, 0], 12, true);
}

// The foam tube: up out of the collar, then a half circle over to +X, ending
// pointing straight down. Its centerline lies in the XZ plane.
const ARCH_BASE = COIL_TOP + COLLAR_HEIGHT - 2 + TUBE_RISE; // where the bend starts
const TUBE_START = COIL_TOP + COLLAR_HEIGHT - 2; // a little inside the collar
const TUBE_LENGTH = TUBE_RISE + Math.PI * ARCH_RADIUS;

/** Centerline point and tangent at distance s along the tube (0 = in the collar). */
function TubeAt(s) {
    if (s <= TUBE_RISE) return { p: [0, 0, TUBE_START + s], t: [0, 0, 1] };
    const theta = Math.PI - (s - TUBE_RISE) / ARCH_RADIUS; // π .. 0, over the top
    return {
        p: [ARCH_RADIUS + ARCH_RADIUS * Math.cos(theta), 0, ARCH_BASE + ARCH_RADIUS * Math.sin(theta)],
        t: [Math.sin(theta), 0, -Math.cos(theta)],
    };
}

/** The foam's radius at s: full in each cushion, narrowing into a groove between two. */
function FoamRadius(s) {
    const f = (s / TUBE_LENGTH) * TUBE_SEGMENTS;
    const frac = f - Math.floor(f);
    return TUBE_RADIUS * (1 - GROOVE_DEPTH * (1 - Math.sin(Math.PI * frac)) ** 3);
}

{
    const side = [0, 1, 0];
    const count = TUBE_SEGMENTS * RINGS_PER_SEGMENT;
    const rings = [];
    for (let i = 0; i <= count; i++) {
        const s = (TUBE_LENGTH * i) / count;
        const { p, t } = TubeAt(s);
        const ds = 0.01;
        const slope = (FoamRadius(Math.min(s + ds, TUBE_LENGTH)) - FoamRadius(Math.max(s - ds, 0))) / (2 * ds);
        rings.push({ center: p, normal: Cross(t, side), side, radius: FoamRadius(s), slope, v: s });
    }
    Tube(rings, SIDES, "foam", () => [[HEAD, 1]], true);
    const physicsCount = 24;
    PhysicsTube(Array.from({ length: physicsCount + 1 }, (_, i) => TubeAt((TUBE_LENGTH * i) / physicsCount).p), () => TUBE_RADIUS, side, 12, true);

    // The cap: straight down from the tube's end, slightly wider, its far end
    // rounded off; a lighter lip around its open end.
    const end = TubeAt(TUBE_LENGTH);
    const down = end.t; // [0, 0, -1]
    const capRings = [];
    const dome = CAP_RADIUS * 0.45;
    const capSteps = 6;
    for (let i = 0; i <= capSteps; i++) {
        const u = (i / capSteps) * (CAP_LENGTH + dome);
        let radius = CAP_RADIUS, slope = 0;
        if (u > CAP_LENGTH) { // an ellipse quarter closing the end
            const e = (u - CAP_LENGTH) / dome;
            radius = CAP_RADIUS * Math.sqrt(Math.max(1 - e * e, 0));
            slope = e < 1 ? (-CAP_RADIUS * e) / (dome * Math.sqrt(1 - e * e)) : 0;
        }
        capRings.push({ center: Add(end.p, Scale(down, u - 1)), normal: Cross(down, side), side, radius: Math.max(radius, 0.01), slope: Math.max(slope, -8), v: TUBE_LENGTH + u });
    }
    Tube(capRings, SIDES, "cap", () => [[HEAD, 1]], true);
    PhysicsTube([Add(end.p, Scale(down, -1)), Add(end.p, Scale(down, CAP_LENGTH + dome * 0.6))], () => CAP_RADIUS, side, 12, true);

    // The lip: a torus around the cap's open end.
    const lipCenter = Add(end.p, Scale(down, -0.5));
    const lipRings = [];
    const lipSteps = SIDES;
    for (let i = 0; i <= lipSteps; i++) {
        const a = (2 * Math.PI * i) / lipSteps;
        const radial = Add(Scale(Cross(down, side), Math.cos(a)), Scale(side, Math.sin(a)));
        const tangent = Add(Scale(Cross(down, side), -Math.sin(a)), Scale(side, Math.cos(a)));
        lipRings.push({ center: Add(lipCenter, Scale(radial, CAP_RADIUS)), normal: radial, side: Cross(tangent, radial), radius: RIM_RADIUS, v: i * 4 });
    }
    Tube(lipRings, WIRE_SIDES, "cap_rim", () => [[HEAD, 1]]);
}

// --- animations (SMD, written by model.mjs) ---
/** A damped sine starting at 0, faded to exactly 0 at the clip's end. */
function Damped(t, amplitude, hz, damping) {
    if (t < 0) return 0;
    const fade = 1 - (t / BOING_SECONDS) ** 6;
    return amplitude * Math.sin(2 * Math.PI * hz * t) * Math.exp(-damping * t) * Math.max(fade, 0);
}

function BoingFrame(t) {
    const frame = BindFrame(BONES);
    // Squash: the first swing compresses (negative), the next stretches.
    const length = 1 - Damped(t, SQUASH, SQUASH_HZ, SQUASH_DAMPING);
    const rad = Math.PI / 180;
    const sway = Damped(t, WOBBLE_DEGREES * rad, WOBBLE_HZ, WOBBLE_DAMPING);
    const sideSway = Damped(t, SIDE_WOBBLE_DEGREES * rad, SIDE_WOBBLE_HZ, WOBBLE_DAMPING);
    for (let i = 1; i <= SPRING_BONES + 1; i++) {
        const isHead = i === HEAD;
        // spring_0 (index 1) stays at the coil's bottom; every bone above sits one compressed segment up.
        if (i > 1) frame[i].pos = [0, 0, SEGMENT * length];
        // The bend is spread over the bones below the head; the head adds its lagging follow-through.
        frame[i].rot = isHead
            ? [HEAD_FOLLOW * Damped(t - HEAD_LAG_SECONDS, SIDE_WOBBLE_DEGREES * rad, SIDE_WOBBLE_HZ, WOBBLE_DAMPING),
                HEAD_FOLLOW * Damped(t - HEAD_LAG_SECONDS, WOBBLE_DEGREES * rad, WOBBLE_HZ, WOBBLE_DAMPING), 0]
            : [sideSway / SPRING_BONES, sway / SPRING_BONES, 0];
    }
    return frame;
}

const triangles = Object.entries(tris).flatMap(([part, list]) => list.map(tri => ({
    material: `${NAME}_${part}`,
    corners: tri.map(i => verts[i]),
})));
const boingFrames = Array.from({ length: Math.round(BOING_SECONDS * FPS) + 1 }, (_, f) => BoingFrame(f / FPS));
const materials = Object.fromEntries(PARTS.map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const vmdl = VmdlText({
    name: NAME,
    mesh: `${MODEL_DIR}/${NAME}.smd`,
    physicsObj: `${MODEL_DIR}/${NAME}_physics.obj`,
    materials,
    animations: [
        { name: "idle", file: `${MODEL_DIR}/${NAME}_idle.smd`, looping: true },
        { name: "boing", file: `${MODEL_DIR}/${NAME}_boing.smd`, looping: false },
    ],
    surfaceProp: SURFACE_PROP,
});

WriteAddonFile(`${MODEL_DIR}/${NAME}.smd`, SmdText(BONES, triangles));
WriteAddonFile(`${MODEL_DIR}/${NAME}_idle.smd`, SmdAnimationText(BONES, [BindFrame(BONES)]));
WriteAddonFile(`${MODEL_DIR}/${NAME}_boing.smd`, SmdAnimationText(BONES, boingFrames));
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics.obj`, ObjText(physics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, vmdl);

const rough = `${MATERIAL_DIR}/${NAME}_spring_rough.png`;
WriteAddonFile(rough, SolidPng(Array(3).fill(Math.round(SPRING_ROUGHNESS * 255))));
for (const [part, rgb, options] of [
    ["foam", FOAM_COLOR, { roughness: "materials/melon_racer/surfaces/inflatable_rough.png" }],
    ["base", BASE_COLOR, { roughness: "materials/melon_racer/surfaces/inflatable_rough.png" }],
    ["cap", CAP_COLOR, { roughness: "materials/melon_racer/surfaces/inflatable_rough.png" }],
    ["cap_rim", CAP_RIM_COLOR, { roughness: "materials/melon_racer/surfaces/inflatable_rough.png" }],
    ["spring", SPRING_COLOR, { metalness: 1, roughness: rough }],
]) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...options }));
}

const triangleCount = Object.values(tris).reduce((s, t) => s + t.length, 0);
const top = ARCH_BASE + ARCH_RADIUS + TUBE_RADIUS;
console.log(`${triangleCount} triangles (collision ${physics.triangleCount}), ${BONES.length} bones, boing ${boingFrames.length} frames; ${(2 * ARCH_RADIUS + CAP_RADIUS + COLLAR_RADIUS).toFixed(0)} long, ${top.toFixed(0)} high`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
