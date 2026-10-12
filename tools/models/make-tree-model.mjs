// Builds the inflatable trees for the hub's decoration — `node tools/models/make-tree-model.mjs`,
// in the hub gates' and the pavilion's style (tools/lib/inflatable.mjs):
//   trunk   a fat vinyl tube, swaying a little, in segments with pinched
//           seams and a dark strap around each; branches out into the
//           crown; standing in a foot ring on a base plate, held by three guy
//           ropes to stakes; an inflation valve on its side
//   crown   puffy pillows — ellipsoids lathed like the foot rings, each with
//           a soft pinched seam round its middle (no band: with one they
//           looked like saucers)
// Three variants (VARIANTS): the round one, a tall slim one (a poplar) and a
// low wide one (an umbrella crown on a stout trunk, four branches).
// Two models per variant, so each can be tinted on its own (the prop's render
// color tints the white vinyl, surfaces/inflatable.vmat; never the dark
// parts), both around the same origin (the foot, on the floor): place a
// variant's trunk and crown at one spot with the same angles. Turning a tree
// by its yaw makes it look different from its neighbours.
// Writes models/melon_racer/tree/tree_{trunk,crown}<suffix>.vmdl (+ .obj; the
// trunk with _physics.obj: trunk and foot — the crown and ropes aren't solid)
// and materials/melon_racer/tree/tree_{dark,rope}.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { GuyRope, InflatableFoot, Pillow, PolylinePath, RopeLoop, SegmentedTube } from "../lib/inflatable.mjs";
import { Mesh, ObjText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- Shared by every variant ---
const TRUNK_SIDES = 14;
const TRUNK_STEP = 18;
const SEAM = { radius: 0.86, rounding: 4, rings: [0, 4] };
const STRAP_INSET = 0.9; // the strap's radius under the trunk's: over the pinched seam
const FOOT = { plateHeight: 2.5, platePart: "dark", height: 10, rings: 6, sides: TRUNK_SIDES, part: "vinyl" };
const FOOT_RING_OUT = 6; // the foot ring's radius over the trunk's
const FOOT_PLATE_OUT = 8; // the plate's
const TRUNK_BOTTOM = FOOT.plateHeight + FOOT.height - 1; // inside the foot ring
// Branches: from the trunk at `branch` (height) out to a pillow's middle.
const BRANCH_SIDES = 10;
const ROPE = { ropeRadius: 0.35, ropePart: "rope", stakeRadius: 0.7, stakeHeight: 3, stakePart: "dark" };
const VALVE = { height: 30, radius: 2.4, length: 3.5, capRadius: 3 }; // on the -X side
const PILLOW_SIDES = 14;
const PILLOW_RINGS = 10; // pole to pole
const PILLOW_SEAM_DEPTH = 0.08; // the seam round its middle pinches it this much,
const PILLOW_SEAM_WIDTH = 0.16; //   over this share of its height
const PHYSICS_SIDES = 8;
const PILLOW = { sides: PILLOW_SIDES, rings: PILLOW_RINGS, seamDepth: PILLOW_SEAM_DEPTH, seamWidth: PILLOW_SEAM_WIDTH, part: "vinyl" };

// --- The variants ---
// trunk: radius, top (its centerline ends inside the crown's middle pillow),
// sway (units [x, y] it leans out halfway up, back over the foot at the top),
// segments; ropeHeight/ropeOut: three guy ropes tied around the trunk, to
// stakes that far from the foot; branchRadius.
// pillows: center [x, y, z], radius across, height (half-axes); `branch`: a
// branch runs from the trunk at that height into it.
const VARIANTS = [
    {
        suffix: "", label: "round",
        trunkRadius: 13, trunkTop: 150, sway: [7, 0], segments: 4, ropeHeight: 62, ropeOut: 46, branchRadius: 6,
        pillows: [
            { at: [0, 0, 152], r: 44, h: 32 }, // the middle one, over the trunk's top
            { at: [40, 12, 136], r: 30, h: 23, branch: 104 },
            { at: [-30, 30, 140], r: 31, h: 24, branch: 110 },
            { at: [-14, -40, 132], r: 28, h: 22, branch: 98 },
            { at: [24, -28, 160], r: 27, h: 21 },
            { at: [-36, -6, 166], r: 26, h: 20 },
            { at: [12, 30, 172], r: 28, h: 21 },
            { at: [2, -2, 188], r: 26, h: 19 }, // the top
        ],
    },
    {
        suffix: "_2", label: "slim",
        trunkRadius: 11, trunkTop: 200, sway: [0, -6], segments: 5, ropeHeight: 74, ropeOut: 44, branchRadius: 5,
        pillows: [
            { at: [0, 0, 204], r: 32, h: 30 }, // the middle one
            { at: [22, 10, 160], r: 24, h: 22, branch: 138 },
            { at: [-20, -12, 170], r: 24, h: 22, branch: 146 },
            { at: [-8, 22, 188], r: 22, h: 20, branch: 162 },
            { at: [18, -14, 226], r: 22, h: 21 },
            { at: [-15, 8, 240], r: 22, h: 20 },
            { at: [6, 14, 252], r: 19, h: 18 },
            { at: [0, -2, 266], r: 18, h: 18 }, // the top
        ],
    },
    {
        suffix: "_3", label: "wide",
        trunkRadius: 15, trunkTop: 112, sway: [-6, 5], segments: 3, ropeHeight: 48, ropeOut: 52, branchRadius: 7,
        pillows: [
            { at: [0, 0, 118], r: 50, h: 26 }, // the middle one, flat
            { at: [52, 8, 104], r: 32, h: 20, branch: 80 },
            { at: [-22, 48, 108], r: 32, h: 20, branch: 84 },
            { at: [-42, -30, 102], r: 30, h: 19, branch: 76 },
            { at: [22, -48, 110], r: 30, h: 19, branch: 88 },
            { at: [34, 36, 128], r: 26, h: 17 },
            { at: [-46, 8, 130], r: 26, h: 17 },
            { at: [6, -14, 140], r: 30, h: 18 }, // the top
        ],
    },
];

const COLORS = {
    dark: [0x2b, 0x30, 0x38], // the hub gates' graphite: straps, plate, valve, stakes
    rope: [0x1a, 0x1c, 0x20],
};
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat"; // tools/materials/make-inflatable.mjs, tinted per prop

const NAME = "tree";
const MODEL_DIR = "models/melon_racer/tree";
const MATERIAL_DIR = "materials/melon_racer/tree";
const GENERATOR = "tools/models/make-tree-model.mjs";

/** The variant's trunk centerline at height z: leaning out along its sway and back. */
function TrunkPoint(t, z) {
    const k = Math.sin(Math.PI * Math.min(1, (z - TRUNK_BOTTOM) / (t.trunkTop - TRUNK_BOTTOM)));
    return [t.sway[0] * k, t.sway[1] * k, z];
}

function BuildTrunk(t, mesh, physics) {
    const R = t.trunkRadius;
    const points = Array.from({ length: 31 }, (_, i) => TrunkPoint(t, TRUNK_BOTTOM + ((t.trunkTop - TRUNK_BOTTOM) * i) / 30));
    const path = PolylinePath(points);
    SegmentedTube(mesh, {
        At: path.At, length: path.length, segments: t.segments,
        radius: R, sides: TRUNK_SIDES, step: TRUNK_STEP, seam: SEAM,
        strap: { radius: R - STRAP_INSET, halfWidth: 1, part: "dark" }, part: "vinyl",
    });
    physics.Tube(points.filter((_, i) => i % 5 === 0), R, PHYSICS_SIDES, "vinyl");
    const foot = { ...FOOT, radius: R + FOOT_RING_OUT, plateRadius: R + FOOT_PLATE_OUT };
    InflatableFoot(mesh, 0, 0, foot);
    physics.Tube([[0, 0, 0], [0, 0, FOOT.plateHeight + FOOT.height]], foot.plateRadius, PHYSICS_SIDES, "vinyl");
    // Branches: a gentle curve from inside the trunk out and up into their pillow.
    for (const { at, branch } of t.pillows) {
        if (!branch) continue;
        const from = TrunkPoint(t, branch);
        const out = V3.Unit([at[0] - from[0], at[1] - from[1], 0]);
        const reach = 0.55 * Math.hypot(at[0] - from[0], at[1] - from[1]);
        const mid = [from[0] + out[0] * reach, from[1] + out[1] * reach, from[2] + (at[2] - from[2]) * 0.3];
        mesh.Tube([from, mid, at], t.branchRadius, BRANCH_SIDES, "vinyl", false);
    }
    // Guy ropes, tied with one loop.
    const tie = TrunkPoint(t, t.ropeHeight);
    for (let i = 0; i < 3; i++) {
        const a = (2 * Math.PI * i) / 3 + Math.PI / 6;
        GuyRope(mesh, [tie[0] + Math.cos(a) * (R - 1), tie[1] + Math.sin(a) * (R - 1), t.ropeHeight], [Math.cos(a) * t.ropeOut, Math.sin(a) * t.ropeOut], ROPE);
    }
    RopeLoop(mesh, tie[0], tie[1], t.ropeHeight, R, TRUNK_SIDES, "rope");
    // The inflation valve: a short stub out of the trunk's -X side with a cap.
    const v = TrunkPoint(t, VALVE.height);
    const skin = v[0] - R;
    mesh.Tube([[skin + 1, v[1], v[2]], [skin - VALVE.length, v[1], v[2]]], VALVE.radius, 10, "dark");
    mesh.Tube([[skin - VALVE.length, v[1], v[2]], [skin - VALVE.length - 1.2, v[1], v[2]]], VALVE.capRadius, 10, "dark");
}

function BuildCrown(t, mesh) {
    for (const pillow of t.pillows) Pillow(mesh, pillow, PILLOW);
}

const materials = {
    vinyl: VINYL_MATERIAL,
    ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])),
};

const PIECES = [
    { piece: "trunk", solid: true, Build: BuildTrunk },
    { piece: "crown", Build: BuildCrown },
];
for (const t of VARIANTS) {
    let total = 0;
    for (const { piece, solid, Build } of PIECES) {
        const mesh = new Mesh(64);
        const physics = new Mesh();
        Build(t, mesh, physics);
        const name = `${NAME}_${piece}${t.suffix}`;
        const obj = `${MODEL_DIR}/${name}.obj`;
        const physicsObj = solid ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
        WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
        if (solid) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
        WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
        total += mesh.triangleCount;
        console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles${solid ? ` (collision ${physics.triangleCount})` : ""}`);
    }
    const top = Math.max(...t.pillows.map(p => p.at[2] + p.h));
    const spread = Math.max(...t.pillows.map(p => Math.hypot(p.at[0], p.at[1]) + p.r));
    console.log(`the ${t.label} tree: ${total} triangles, ${top.toFixed(0)} high, the crown ${(2 * spread).toFixed(0)} across at most, stakes ${t.ropeOut} out from the foot`);
}
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<piece><suffix>.vmdl"`);
