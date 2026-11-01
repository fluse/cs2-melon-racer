// Generates rotating gates (Drehtore) — `node tools/models/make-rotating-gate-model.mjs`:
// a steel post on a base disc with one long wooden plank through it, reaching
// out on two opposite sides only (not a four-armed turnstile), red rubber
// bumpers at its tips — an obstacle the melons jump over or slip past. Three
// models, the same post and planks:
//   rotating_gate          one tier, the plank just above the floor (jump over it)
//     spin           one full turn every SPIN_SECONDS, counter-clockwise from above, looping
//     spin_reverse   the same, clockwise
//     idle           standing still (one frame)
//   rotating_gate_double   two tiers, the upper one turning the other way: the
//                          lower plank is jumped over, the upper one (high
//                          enough to roll under) catches a melon jumping too late
//     spin           lower tier counter-clockwise, upper clockwise, looping
//     idle
//   rotating_gate_triple   three tiers, each turning the other way from the one
//                          under it (the double's two + one more on top)
//     spin           lower and top tier counter-clockwise, middle clockwise, looping
//     idle
// Place it as a prop_dynamic with Idle Animation "spin" (or "spin_reverse"),
// Idle Animation Loop Mode "Loop"; its Playback Rate makes it faster or slower.
// Collision: post + base on the root, each tier's plank + collar on its own
// bone, so it turns along. Writes
//   models/melon_racer/rotating_gate/<model>.smd                 render mesh + skeleton (bind pose)
//   models/melon_racer/rotating_gate/<model>_<animation>.smd     the animations
//   models/melon_racer/rotating_gate/<model>_physics{,_<tier>}.obj   collision: post, each turning tier
//   models/melon_racer/rotating_gate/<model>.vmdl
//   materials/melon_racer/rotating_gate/rotating_gate_{plank,strap,bumper,post}.vmat (+ _color.png)
// Compile the .vmdls with resourcecompiler (see the end of the output). Origin
// on the floor in the post's center (the axis it turns around); in the bind
// pose the planks lie along X.
import { AxisBox, BindFrame, Circle, Mesh, MeshSmdTriangles, ObjText, Shape, SmdAnimationText, SmdText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the melon is ~14 across, a jump clears ~85) ---
const BASE_RADIUS = 24; // the disc on the floor
const BASE_HEIGHT = 4;
const POST_RADIUS = 6;
const CAP_RADIUS = 8; // hex cap on top of the post, corner radius
const CAP_HEIGHT = 4;
const COLLAR_RADIUS = 10; // the turning sleeve each plank goes through
const COLLAR_MARGIN = 3; // how far the collar reaches above and below the plank
const ARM_LENGTH = 144; // from the axis to a plank's tip: the sweep's radius
const PLANK_HEIGHT = 16; // two boards on edge, BOARD_GAP between them
const BOARD_GAP = 1;
const PLANK_THICKNESS = 6;
const LOW_Z = 6; // the lower plank's underside: no rolling under it
const HIGH_Z = 46; // the upper plank's underside: a melon on the floor rolls under it
const TOP_Z = 86; // the triple gate's third plank: a melon jumping off the middle one still has room under it
const STRAPS = [0.3, 0.6]; // steel straps round the plank, as shares of its free length
const STRAP_WIDTH = 3;
const STRAP_PROUD = 0.6; // how far a strap stands off the wood
const BUMPER_LENGTH = 10; // the red rubber at each tip
const BUMPER_PROUD = 1;

// --- spin animation ---
const SPIN_SECONDS = 4; // one full turn: ~226 units/s at the tips
const FPS = 30;

// --- tessellation: as low as still reads round ---
const BASE_SIDES = 16;
const POST_SIDES = 10;
const COLLAR_SIDES = 12;
const PHYSICS_SIDES = 8;

// --- look: oiled wood, steel, signal red tips (off-palette on purpose: a hazard) ---
const PLANK_COLOR = [0xa8, 0x72, 0x44]; // the park benches' oiled wood
const STRAP_COLOR = [0x8e, 0x94, 0x9c]; // steel, like the spin hammer's head
const BUMPER_COLOR = [0xe8, 0x3c, 0x2a]; // signal red, like the spin hammer's faces
const POST_COLOR = [0x3a, 0x3e, 0x46]; // graphite: post, base, collars

const KIT = "rotating_gate";
const MODEL_DIR = "models/melon_racer/rotating_gate";
const MATERIAL_DIR = "materials/melon_racer/rotating_gate";
const GENERATOR = "tools/models/make-rotating-gate-model.mjs";

const MODELS = [
    { name: "rotating_gate", tiers: [{ bone: "tier", z: LOW_Z }], animations: [["spin", [1]], ["spin_reverse", [-1]]] },
    { name: "rotating_gate_double", tiers: [{ bone: "tier_low", z: LOW_Z }, { bone: "tier_high", z: HIGH_Z }], animations: [["spin", [1, -1]]] },
    { name: "rotating_gate_triple", tiers: [{ bone: "tier_low", z: LOW_Z }, { bone: "tier_mid", z: HIGH_Z }, { bone: "tier_high", z: TOP_Z }], animations: [["spin", [1, -1, 1]]] },
];

/** A box between two corners given in any order. */
const Block = (mesh, a, b, part) => AxisBox(mesh, a.map((v, i) => Math.min(v, b[i])), a.map((v, i) => Math.max(v, b[i])), part);

/** The fixed post: base disc, post up to `top`, cap. */
function BuildPost(mesh, top, physics) {
    mesh.Extrude(Shape(Circle(0, 0, BASE_RADIUS, physics ? PHYSICS_SIDES : BASE_SIDES)), 0, BASE_HEIGHT, "post", "z");
    mesh.Extrude(Shape(Circle(0, 0, POST_RADIUS, physics ? PHYSICS_SIDES : POST_SIDES)), BASE_HEIGHT - 0.1, top, "post", "z");
    if (!physics) mesh.Extrude(Shape(Circle(0, 0, CAP_RADIUS, 6, Math.PI / 6)), top - 0.1, top + CAP_HEIGHT, "post", "z");
}

/** One turning tier, the plank's underside at z0: collar, two boards per side, straps, bumpers; `physics` one box per side. */
function BuildTier(mesh, z0, physics) {
    const z1 = z0 + PLANK_HEIGHT, t = PLANK_THICKNESS / 2;
    mesh.Extrude(Shape(Circle(0, 0, COLLAR_RADIUS, physics ? PHYSICS_SIDES : COLLAR_SIDES)), z0 - COLLAR_MARGIN, z1 + COLLAR_MARGIN, "post", "z");
    for (const side of [1, -1]) {
        const x0 = side * (COLLAR_RADIUS - 1), tip = side * ARM_LENGTH, woodEnd = side * (ARM_LENGTH - BUMPER_LENGTH);
        if (physics) {
            Block(mesh, [x0, -t - BUMPER_PROUD, z0 - BUMPER_PROUD], [tip, t + BUMPER_PROUD, z1 + BUMPER_PROUD], "plank");
            continue;
        }
        const mid = z0 + PLANK_HEIGHT / 2;
        Block(mesh, [x0, -t, z0], [woodEnd, t, mid - BOARD_GAP / 2], "plank");
        Block(mesh, [x0, -t, mid + BOARD_GAP / 2], [woodEnd, t, z1], "plank");
        for (const share of STRAPS) {
            const x = x0 + (woodEnd - x0) * share;
            Block(mesh, [x - STRAP_WIDTH / 2, -t - STRAP_PROUD, z0 - STRAP_PROUD], [x + STRAP_WIDTH / 2, t + STRAP_PROUD, z1 + STRAP_PROUD], "strap");
        }
        Block(mesh, [woodEnd, -t - BUMPER_PROUD, z0 - BUMPER_PROUD], [tip, t + BUMPER_PROUD, z1 + BUMPER_PROUD], "bumper");
    }
}

const parts = ["plank", "strap", "bumper", "post"];
const materials = Object.fromEntries(parts.map(part => [part, `${MATERIAL_DIR}/${KIT}_${part}.vmat`]));
const compile = [];
for (const { name, tiers, animations } of MODELS) {
    const bones = [{ name: "root", parent: -1, bind: [0, 0, 0] }, ...tiers.map(tier => ({ name: tier.bone, parent: 0, bind: [0, 0, 0] }))];
    /** The skeleton t seconds into a spin, each tier turned around +Z by its direction (+1 counter-clockwise from above). */
    const SpinFrame = (t, directions) => {
        const frame = BindFrame(bones);
        directions.forEach((direction, i) => { frame[i + 1].rot = [0, 0, (direction * 2 * Math.PI * t) / SPIN_SECONDS]; });
        return frame;
    };
    const top = tiers[tiers.length - 1].z + PLANK_HEIGHT + COLLAR_MARGIN + 2;
    const post = new Mesh(64), postPhysics = new Mesh(64);
    BuildPost(post, top, false);
    BuildPost(postPhysics, top, true);
    const triangles = [...MeshSmdTriangles(post, name, 0)];
    const physicsObj = [{ file: `${MODEL_DIR}/${name}_physics.obj`, bone: "" }];
    WriteAddonFile(physicsObj[0].file, ObjText(postPhysics, name, GENERATOR, { smd: true }));
    let physicsTriangles = postPhysics.triangleCount;
    tiers.forEach((tier, i) => {
        const render = new Mesh(64), physics = new Mesh(64);
        BuildTier(render, tier.z, false);
        BuildTier(physics, tier.z, true);
        triangles.push(...MeshSmdTriangles(render, name, i + 1));
        const file = `${MODEL_DIR}/${name}_physics_${tier.bone}.obj`;
        WriteAddonFile(file, ObjText(physics, name, GENERATOR, { smd: true }));
        physicsObj.push({ file, bone: tier.bone });
        physicsTriangles += physics.triangleCount;
    });
    // The last frame is a full turn, the same pose as the first: the loop closes seamlessly.
    const frameCount = Math.round(SPIN_SECONDS * FPS) + 1;
    const vmdlAnimations = [];
    for (const [animation, directions] of animations) {
        const file = `${MODEL_DIR}/${name}_${animation}.smd`;
        WriteAddonFile(file, SmdAnimationText(bones, Array.from({ length: frameCount }, (_, f) => SpinFrame(f / FPS, directions))));
        vmdlAnimations.push({ name: animation, file, looping: true });
    }
    const idle = `${MODEL_DIR}/${name}_idle.smd`;
    WriteAddonFile(idle, SmdAnimationText(bones, [BindFrame(bones)]));
    vmdlAnimations.push({ name: "idle", file: idle, looping: true });
    const mesh = `${MODEL_DIR}/${name}.smd`;
    WriteAddonFile(mesh, SmdText(bones, triangles));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name, mesh, physicsObj, materials, animations: vmdlAnimations, surfaceProp: "wood" }));
    const heights = tiers.map(tier => `${tier.z}..${tier.z + PLANK_HEIGHT}`).join(" + ");
    console.log(`${name}: ${triangles.length} triangles (collision ${physicsTriangles}), ${vmdlAnimations.map(a => a.name).join("/")}, ${frameCount} frames; planks ${heights} high, top ${top + CAP_HEIGHT}`);
    compile.push(`game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${name}.vmdl"`);
}
for (const [part, rgb, options] of [
    ["plank", PLANK_COLOR, {}],
    ["strap", STRAP_COLOR, { metalness: 0.8 }],
    ["bumper", BUMPER_COLOR, {}],
    ["post", POST_COLOR, { metalness: 0.6 }],
]) {
    const texture = `${MATERIAL_DIR}/${KIT}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...options }));
}
console.log(`sweeps ${2 * ARM_LENGTH} across, ${(2 * Math.PI * ARM_LENGTH / SPIN_SECONDS).toFixed(0)} units/s at the tips`);
for (const line of compile) console.log(`compile: ${line}`);
