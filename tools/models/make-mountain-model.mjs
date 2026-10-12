// Builds an inflatable mountain kit for the map's backdrop — `node tools/models/make-mountain-model.mjs`,
// in the inflatable rocks' style (make-rock-model.mjs, tools/lib/inflatable.mjs's
// faceted inflatables): big faceted pieces sewn from vinyl panels, each panel
// puffed out between pinched seams, sunk into the floor, a valve at the foot.
// Scenery, not to drive on: steep, and only a coarse convex collision.
// Pieces (VARIANTS), each turned by its own yaw and overlapped to build a
// mountain — the peaks up top, shoulders and a ridge around and between
// them, foothills in front:
//   peak, peak_2      tall summits (a broad one, a slimmer crooked one)
//   shoulder          a rounded middle piece, under or beside a peak
//   ridge             a long one, to join two peaks
//   foothill          a low wide one, for the front and the ends
// The ones with a snow line get a snow cap, a separate model (<piece>_snow)
// at the same origin, so it's tinted on its own: the panels above the snow
// line sewn on again a little further out, its lower edge dripping down in
// scallops. Place the cap with its piece, same spot and angles.
// Scale freely in Hammer (uniformly — the panels stay round).
// Each model tinted per prop (render color tints the white vinyl,
// surfaces/inflatable.vmat; never the dark valve), its origin on the floor
// under its middle.
// Writes models/melon_racer/mountain/mountain_<piece>[_snow].vmdl (+ .obj, the
// piece's _physics.obj) and materials/melon_racer/mountain/mountain_dark.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { Panel, PanelPuff, Polytope, PolytopeCollision, PolytopePlanes, PuffLift, SidePoint } from "../lib/inflatable.mjs";
import { Mesh, ObjText, SeededRandom, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- Shared by every piece ---
const SHAPE = { minZ: -0.2, angleJitter: 0.3, depthJitter: 0.1, sink: 16 }; // + count per piece
const PUFF = { share: 0.2, max: 28, round: 0.5 };
const PANEL = { edgeStep: 70, rings: 3, puff: PUFF, part: "vinyl" };
const PHYSICS_GROW = 0.6; // the collision's planes moved out by this share of their panel's puff
const VALVE = { height: 30, radius: 5, length: 7, capRadius: 6.5 }; // on the -X side

// --- Snow caps ---
const SNOW_OFFSET = 2; // over the mountain's panels
const SNOW_RINGS = 3;
const SNOW_EDGE_STEP = 45;
const SNOW_DRIP_STEP = 16; // the dripping lower edge is cut finer
const SNOW_DRIP = 34; // how far a scallop reaches down at most,
const SNOW_DRIP_WAVE = 90; //   one scallop about this wide

// --- Peaks: panels on a cone instead (a polytope round an ellipsoid comes out a dome) ---
const APEX_JITTER = 0.12; // a panel's own apex up to this share lower than the peak: a jagged summit
const APEX_SHIFT = 0.12; // and this share of the base off to the side
const BASE_JITTER = 0.12; // its foot this share in or out

// --- The pieces ---
// Peaks: cone: { base (x, y radii on the floor), height, lean (the summit's
// offset [x, y]) }. The rest: half: the ellipsoid the panels spread over, its
// middle `lift` up from the origin. planes: how many panels (besides the
// floor); seed: the random it's cut with; snow: the snow line, a share of its
// height (none: no cap).
const VARIANTS = [
    { piece: "peak", cone: { base: [250, 230], height: 540, lean: [0, 0] }, planes: 13, seed: 4, snow: 0.6 },
    { piece: "peak_2", cone: { base: [210, 240], height: 440, lean: [70, -40] }, planes: 12, seed: 9, snow: 0.58 },
    { piece: "shoulder", half: [270, 250, 250], lift: 30, planes: 17, seed: 15 },
    { piece: "ridge", half: [440, 170, 230], lift: 20, planes: 18, seed: 27, snow: 0.78 },
    { piece: "foothill", half: [330, 290, 150], lift: -15, planes: 16, seed: 33 },
];

const COLORS = { dark: [0x2b, 0x30, 0x38] }; // the hub gates' graphite: the valve
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat"; // tools/materials/make-inflatable.mjs, tinted per prop

const MODEL_DIR = "models/melon_racer/mountain";
const MATERIAL_DIR = "materials/melon_racer/mountain";
const GENERATOR = "tools/models/make-mountain-model.mjs";

/**
 * A peak's planes, the floor first: `count` round a cone (its foot the
 * ellipse `base` on the floor, its summit `height` up, shifted by `lean`),
 * each through a point on the foot and its own apex near the summit — so
 * they meet in a jagged point, not a dome.
 */
function ConePlanes({ base, height, lean }, count, seed) {
    const random = SeededRandom(seed);
    const planes = [{ n: [0, 0, -1], d: SHAPE.sink, floor: true }];
    const turn = random() * 2 * Math.PI;
    for (let i = 0; i < count; i++) {
        const a = turn + (2 * Math.PI * (i + 0.6 * (random() - 0.5))) / count;
        const r = 1 + BASE_JITTER * (2 * random() - 1);
        const foot = [Math.cos(a) * base[0] * r, Math.sin(a) * base[1] * r, 0];
        const apex = [lean[0] + APEX_SHIFT * base[0] * (2 * random() - 1), lean[1] + APEX_SHIFT * base[1] * (2 * random() - 1), height * (1 - APEX_JITTER * random())];
        const tangent = [-Math.sin(a) * base[0], Math.cos(a) * base[1], 0];
        let n = V3.Unit(V3.Cross(tangent, V3.Sub(apex, foot)));
        if (V3.Dot(n, foot) < 0) n = V3.Scale(n, -1);
        planes.push({ n, d: V3.Dot(n, foot) });
    }
    return planes;
}

/** A face's plane as 2D: To2(p) and back (From2), around its middle. */
function FaceFrame({ plane, mid }) {
    const e1 = V3.Unit(V3.Cross(plane.n, Math.abs(plane.n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const e2 = V3.Cross(plane.n, e1);
    return {
        To2: p => { const d = V3.Sub(p, mid); return [V3.Dot(d, e1), V3.Dot(d, e2)]; },
        From2: ([u, v]) => V3.Add(mid, V3.Add(V3.Scale(e1, u), V3.Scale(e2, v))),
    };
}

/**
 * Where p (on the face's plane) is between the face's seam (0) and its
 * middle (1) — the t its panel is puffed by there (Panel's rings run straight
 * from the seam to the middle).
 */
function PanelT(face, frame, p) {
    const [px, py] = frame.To2(p), len = Math.hypot(px, py);
    if (len < 1e-6) return 1;
    let hit = Infinity; // along the ray from the middle through p, the distance to the seam
    face.corners.forEach((c, i) => {
        const [ax, ay] = frame.To2(c), [bx, by] = frame.To2(face.corners[(i + 1) % face.corners.length]);
        const ex = bx - ax, ey = by - ay, den = px * ey - py * ex;
        if (Math.abs(den) < 1e-9) return;
        const s = (ax * ey - ay * ex) / den, k = (ax * py - ay * px) / den;
        if (s > 0 && k >= -1e-9 && k <= 1 + 1e-9) hit = Math.min(hit, s * len);
    });
    return Math.max(0, Math.min(1, 1 - len / hit));
}

/** Is the 2D point inside the face (convex, counter-clockwise)? */
function Inside(face, frame, q) {
    return face.corners.every((c, i) => {
        const [ax, ay] = frame.To2(c), [bx, by] = frame.To2(face.corners[(i + 1) % face.corners.length]);
        return (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax) >= -1e-6;
    });
}

/** The face's polygon above z (convex clip): its points, each flagged `cut` where the edge from it runs along the snow line. */
function ClipAbove(corners, z) {
    const out = [];
    corners.forEach((a, i) => {
        const b = corners[(i + 1) % corners.length];
        const aIn = a[2] >= z, bIn = b[2] >= z;
        const Cross = () => V3.Add(a, V3.Scale(V3.Sub(b, a), (z - a[2]) / (b[2] - a[2])));
        if (aIn) out.push({ p: a });
        if (aIn && !bIn) out.push({ p: Cross(), cut: true }); // leaving: the next edge is the snow line
        if (!aIn && bIn) out.push({ p: Cross() });
    });
    return out;
}

/** The snow on one face: its part above `snowZ`, the lower edge dripping down, lying SNOW_OFFSET over the panel. */
function SnowPatch(mesh, face, snowZ, random) {
    const top = ClipAbove(face.corners, snowZ);
    if (top.length < 3) return;
    const { plane } = face, frame = FaceFrame(face);
    const puff = PanelPuff(face, PUFF);
    const down = V3.Unit(V3.Sub([0, 0, -1], V3.Scale(plane.n, -plane.n[2]))); // downhill along the face
    const boundary = [];
    top.forEach(({ p, cut }, i) => {
        const q = top[(i + 1) % top.length].p, length = Math.hypot(...V3.Sub(q, p));
        const pieces = Math.max(1, Math.round(length / (cut ? SNOW_DRIP_STEP : SNOW_EDGE_STEP)));
        const lobes = Math.max(1, Math.round(length / SNOW_DRIP_WAVE)), phase = random() * 2 * Math.PI;
        for (let k = 0; k < pieces; k++) {
            const s = k / pieces;
            let point = V3.Add(p, V3.Scale(V3.Sub(q, p), s));
            if (cut && k > 0) {
                // Scallops: none at the seams (the next face's snow meets it there), deepest between.
                let drip = SNOW_DRIP * Math.sin(Math.PI * s) ** 0.6 * (0.55 + 0.45 * Math.sin(2 * Math.PI * lobes * s + phase));
                while (drip > 0.5 && !Inside(face, frame, frame.To2(V3.Add(point, V3.Scale(down, drip))))) drip /= 2;
                point = V3.Add(point, V3.Scale(down, drip));
            }
            boundary.push(point);
        }
    });
    boundary.push(boundary[0]); // Surface's wrap
    const center = V3.Scale(top.map(c => c.p).reduce(V3.Add), 1 / top.length);
    const grid = Array.from({ length: SNOW_RINGS + 1 }, (_, r) => boundary.map(b => {
        const p = V3.Add(b, V3.Scale(V3.Sub(center, b), r / SNOW_RINGS));
        return V3.Add(p, V3.Scale(plane.n, PuffLift(puff, PanelT(face, frame, p), PUFF.round) + SNOW_OFFSET));
    }));
    const perimeter = boundary.slice(1).reduce((s, p, i) => s + Math.hypot(...V3.Sub(p, boundary[i])), 0);
    mesh.Surface(grid, "vinyl", { away: V3.Sub(center, V3.Scale(plane.n, 1000)), wrap: true, uvScale: [perimeter / mesh.uvTile, 1] });
}

const materials = { vinyl: VINYL_MATERIAL, dark: `${MATERIAL_DIR}/mountain_dark.vmat` };

function Write(name, mesh, physics) {
    const obj = `${MODEL_DIR}/${name}.obj`;
    const physicsObj = physics ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, name, GENERATOR));
    if (physics) WriteAddonFile(physicsObj, ObjText(physics, name, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
}

for (const t of VARIANTS) {
    const mesh = new Mesh(128);
    const physics = new Mesh();
    const planes = t.cone ? ConePlanes(t.cone, t.planes, t.seed) : PolytopePlanes(t, { ...SHAPE, count: t.planes });
    const faces = Polytope(planes);
    const panels = faces.filter(f => !f.plane.floor); // the floor's is in the ground
    for (const face of panels) Panel(mesh, face, PANEL);
    PolytopeCollision(physics, planes, faces, PHYSICS_GROW, PUFF, "vinyl");
    // The valve: a short stub out of the -X side with a cap.
    const valve = SidePoint(faces, [-1, 0, 0], VALVE.height);
    const out = V3.Unit([valve.n[0], valve.n[1], 0]);
    const At = s => V3.Add(valve.point, V3.Scale(out, s));
    mesh.Tube([At(-2), At(VALVE.length)], VALVE.radius, 12, "dark");
    mesh.Tube([At(VALVE.length), At(VALVE.length + 2.4)], VALVE.capRadius, 12, "dark");
    const name = `mountain_${t.piece}`;
    Write(name, mesh, physics);
    const all = faces.flatMap(f => f.corners);
    const size = [0, 1, 2].map(i => Math.max(...all.map(c => c[i])) - Math.min(...all.map(c => c[i])));
    const height = size[2] - SHAPE.sink;
    let line = `  ${name}.vmdl: ${mesh.triangleCount} triangles, ${panels.length} panels, collision ${physics.triangleCount}; ${size[0].toFixed(0)} x ${size[1].toFixed(0)}, ${height.toFixed(0)} high`;
    if (t.snow) {
        const snow = new Mesh(128);
        const random = SeededRandom(t.seed + 1000);
        for (const face of panels) SnowPatch(snow, face, t.snow * height, random);
        Write(`${name}_snow`, snow);
        line += `; ${name}_snow.vmdl: ${snow.triangleCount} triangles, from ${(t.snow * height).toFixed(0)} up`;
    }
    console.log(line);
}
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/mountain_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/mountain_<piece>[_snow].vmdl"`);
