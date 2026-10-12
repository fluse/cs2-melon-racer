// Builds inflatable rocks for the map's borders — `node tools/models/make-rock-model.mjs`,
// in the hub gates', pavilion's and trees' style (tools/lib/inflatable.mjs's
// white vinyl, graphite details): a faceted boulder sewn from flat vinyl
// panels, each panel puffed up between its seams, so the seams run as
// creases along the rock's edges like cut stone. Its bottom sunk into the
// floor, a valve on one side and two tie-downs (a rope from a loop low on
// the rock to a stake) holding it down.
//
// The shape: a convex polytope — the intersection of a flat floor plane and
// PLANES half-spaces whose normals spread over an ellipsoid (the variant's
// `half`), jittered by a seeded random — so every variant looks the same on
// every run, and different from the others. Each of its faces is one panel.
// Its collision is that polytope, grown by part of the puff: convex, cheap.
// Four variants (VARIANTS): a boulder, a tall spire, a long low slab and a
// small one to fill gaps. Placed in a row, overlapping, each turned by its
// own yaw, they make a border that doesn't repeat. Their lower panels stand
// steep (no ramp up them), but a jump (~86 units) and wall jumps reach their
// tops: a border still needs a clip brush behind/over them.
// One model per variant, tinted per prop (render color tints the white
// vinyl, surfaces/inflatable.vmat; never the dark parts), its origin on the
// floor under its middle.
// Writes models/melon_racer/rock/rock<suffix>.vmdl (+ .obj, _physics.obj) and
// materials/melon_racer/rock/rock_{dark,rope}.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { GuyRope, Panel, Polytope, PolytopeCollision, PolytopePlanes, RopeLoop, SidePoint } from "../lib/inflatable.mjs";
import { Mesh, ObjText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- Shared by every variant ---
const PLANES = 13; // panels besides the floor (fewer: blockier, cheaper)
const MIN_PLANE_Z = -0.3; // no panel normal points further down: the floor plane closes the bottom
const ANGLE_JITTER = 0.28; // radians a panel normal is turned off its even spread
const DEPTH_JITTER = 0.1; // share a panel is moved in or out
const SINK = 6; // the floor plane this far under the origin: the rock sits in the ground
const EDGE_STEP = 36; // a seam is cut into pieces this long (at least one): the puff curves along it
const RINGS = 2; // rings from a panel's seam to its middle (the middle one a point)
const PUFF = 0.28; // a panel bulges this share of its inner radius out,
const PUFF_MAX = 12; //   at most this many units,
const PUFF_ROUND = 0.5; //   rising this fast from the seam (sin^PUFF_ROUND)
const PHYSICS_GROW = 0.6; // the collision's planes moved out by this share of their panel's puff
const VALVE = { height: 18, radius: 2.4, length: 3.5, capRadius: 3 };
const TIE_HEIGHT = 10; // the tie-downs' loops, over the floor
const TIE_OUT = 22; // their stakes, this far out from the rock
const ROPE = { ropeRadius: 0.35, ropePart: "rope", stakeRadius: 0.7, stakeHeight: 3, stakePart: "dark" };

// --- The variants ---
// half: the ellipsoid the panels spread over (x, y, z half-sizes), its middle
// `lift` up from the origin (below its half height: the floor cuts it, so it
// stands on a wide base); seed: the random it's cut with.
const VARIANTS = [
    { suffix: "", label: "boulder", half: [84, 72, 70], lift: 34, seed: 7 },
    { suffix: "_2", label: "spire", half: [56, 50, 128], lift: 60, seed: 21 },
    { suffix: "_3", label: "slab", half: [136, 70, 52], lift: 22, seed: 5 },
    { suffix: "_4", label: "small", half: [42, 38, 34], lift: 16, seed: 13 },
];

const COLORS = {
    dark: [0x2b, 0x30, 0x38], // the hub gates' graphite: valve, loops, stakes
    rope: [0x1a, 0x1c, 0x20],
};
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat"; // tools/materials/make-inflatable.mjs, tinted per prop

const NAME = "rock";
const MODEL_DIR = "models/melon_racer/rock";
const MATERIAL_DIR = "materials/melon_racer/rock";
const GENERATOR = "tools/models/make-rock-model.mjs";

const SHAPE = { count: PLANES, minZ: MIN_PLANE_Z, angleJitter: ANGLE_JITTER, depthJitter: DEPTH_JITTER, sink: SINK };
const PUFF_OPTIONS = { share: PUFF, max: PUFF_MAX, round: PUFF_ROUND };
const PANEL = { edgeStep: EDGE_STEP, rings: RINGS, puff: PUFF_OPTIONS, part: "vinyl" };

function Build(t) {
    const mesh = new Mesh(64);
    const physics = new Mesh();
    const planes = PolytopePlanes(t, SHAPE);
    const faces = Polytope(planes);
    // Panels; the floor's is in the ground and never seen.
    for (const face of faces) if (!face.plane.floor) Panel(mesh, face, PANEL);
    PolytopeCollision(physics, planes, faces, PHYSICS_GROW, PUFF_OPTIONS, "vinyl");
    // The valve: a short stub out of the -X side with a cap.
    const valve = SidePoint(faces, [-1, 0, 0], VALVE.height);
    const out = V3.Unit([valve.n[0], valve.n[1], 0]);
    const At = s => V3.Add(valve.point, V3.Scale(out, s));
    mesh.Tube([At(-1), At(VALVE.length)], VALVE.radius, 10, "dark");
    mesh.Tube([At(VALVE.length), At(VALVE.length + 1.2)], VALVE.capRadius, 10, "dark");
    // Two tie-downs, front right and back left: a loop on the panel there, a rope to a stake.
    for (const a of [Math.PI / 4, (5 * Math.PI) / 4]) {
        const dir = [Math.cos(a), Math.sin(a), 0];
        const tie = SidePoint(faces, dir, TIE_HEIGHT);
        const n = V3.Unit([tie.n[0], tie.n[1], 0]);
        const loop = V3.Add(tie.point, V3.Scale(n, 1));
        RopeLoop(mesh, loop[0], loop[1], loop[2], 1.2, 6, "dark");
        GuyRope(mesh, loop, [loop[0] + n[0] * TIE_OUT, loop[1] + n[1] * TIE_OUT], ROPE);
    }
    return { mesh, physics, faces };
}

const materials = {
    vinyl: VINYL_MATERIAL,
    ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])),
};

for (const t of VARIANTS) {
    const { mesh, physics, faces } = Build(t);
    const name = `${NAME}${t.suffix}`;
    const obj = `${MODEL_DIR}/${name}.obj`;
    const physicsObj = `${MODEL_DIR}/${name}_physics.obj`;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    const all = faces.flatMap(f => f.corners);
    const size = [0, 1, 2].map(i => Math.max(...all.map(c => c[i])) - Math.min(...all.map(c => c[i])));
    console.log(`  ${name}.vmdl (${t.label}): ${mesh.triangleCount} triangles, ${faces.length - 1} panels, collision ${physics.triangleCount}; `
        + `${size[0].toFixed(0)} x ${size[1].toFixed(0)}, ${(size[2] - SINK).toFixed(0)} high`);
}
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}<suffix>.vmdl"`);
