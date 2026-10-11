// Generates a spinning hammer (Drehhammer) — `node tools/models/make-spin-hammer-model.mjs`:
// a big sledgehammer lying flat on a low pedestal, its handle the arm that
// sweeps around the pedestal, the steel head with red rubber faces at its
// end, just above the floor — an obstacle the melons have to jump over or
// time their way past. The pedestal (base disc, stub) stands still; hub,
// handle and head sit on one bone that turns around Z:
//   spin    one full turn every SPIN_SECONDS, looping
//   idle    standing still (one frame)
// Place it as a prop_dynamic with Idle Animation "spin", Idle Animation Loop
// Mode "Loop" (its Playback Rate or the SetPlaybackRate input makes it faster
// or slower, SetAnimation "idle" stops it). Seen from above it turns
// counter-clockwise: the head's +Y face (in the bind pose, the head at +X)
// is the one that strikes. Collision: base + stub on the root, hub + handle +
// head on "arm", so it turns along. Writes
//   models/melon_racer/spin_hammer/spin_hammer.smd           render mesh + skeleton (bind pose)
//   models/melon_racer/spin_hammer/spin_hammer_{spin,idle}.smd   the animations
//   models/melon_racer/spin_hammer/spin_hammer_physics{,_arm}.obj   collision: pedestal, the turning hammer
//   models/melon_racer/spin_hammer/spin_hammer.vmdl
//   materials/melon_racer/spin_hammer/spin_hammer_{head,face,handle,grip,hub}.vmat (+ _color.png)
// Compile the .vmdl with resourcecompiler (see the end of the output). Origin
// on the floor in the pedestal's center (the axis it turns around).
import { BindFrame, Circle, Mesh, MeshSmdTriangles, ObjText, Shape, SmdAnimationText, SmdText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the melon is ~14 across, a jump clears ~85) ---
const BASE_RADIUS = 22; // the disc on the floor
const BASE_HEIGHT = 4;
const STUB_RADIUS = 7; // between the disc and the turning hub
const HUB_BOTTOM = 9;
const HUB_RADIUS = 10;
const ARM_Z = 18; // height of the handle's axis = the head's center
const HUB_TOP = 27;
const NUT_RADIUS = 6; // hex nut on top of the hub, corner radius
const NUT_HEIGHT = 3;
const ARM_LENGTH = 110; // from the axis to the head's center: the sweep's radius
const HANDLE_RADIUS = 3;
const GRIP_RADIUS = 3.8; // the rubber grip, near the hub
const GRIP_LENGTH = 32;
const HEAD_RADIUS = 14; // octagon, to its flat sides: head bottom at ARM_Z - HEAD_RADIUS
const HEAD_HALF_LENGTH = 24; // along Y, the way it strikes
const FACE_DEPTH = 4; // the red rubber faces at both ends
const FACE_INSET = 2.5; // how much smaller the faces are than the head: a bevel
const PHYSICS_ARM_RADIUS = 4; // handle collision, a bit thicker than the handle

// --- spin animation ---
const SPIN_SECONDS = 3; // one full turn: ~230 units/s at the head
const FPS = 30;

// --- tessellation: as low as still reads round ---
const BASE_SIDES = 16;
const HUB_SIDES = 12;
const STUB_SIDES = 10;
const HANDLE_SIDES = 10;
const HEAD_SIDES = 8; // an octagonal sledgehammer head
const PHYSICS_SIDES = 8;

// --- look: steel, wood, signal red faces (off-palette on purpose: a hazard) ---
const HEAD_COLOR = [0x8e, 0x94, 0x9c]; // forged steel
const FACE_COLOR = [0xe8, 0x3c, 0x2a]; // signal red, like the saw blade's ring
const HANDLE_COLOR = [0xb0, 0x78, 0x44]; // ash wood
const GRIP_COLOR = [0x2a, 0x2a, 0x2e]; // black rubber
const HUB_COLOR = [0x3a, 0x3e, 0x46]; // pedestal and hub

const NAME = "spin_hammer";
const MODEL_DIR = "models/melon_racer/spin_hammer";
const MATERIAL_DIR = "materials/melon_racer/spin_hammer";
const GENERATOR = "tools/models/make-spin-hammer-model.mjs";

// --- skeleton: a fixed root and the hammer turning on it around Z ---
const BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    { name: "arm", parent: 0, bind: [0, 0, 0] },
];
const ROOT_BONE = 0, ARM_BONE = 1;

/** The skeleton t seconds into the spin: turned around +Z, counter-clockwise from above. */
function SpinFrame(t) {
    const frame = BindFrame(BONES);
    frame[ARM_BONE].rot = [0, 0, (2 * Math.PI * t) / SPIN_SECONDS];
    return frame;
}

/** An octagon around the head's axis (in the y extrusion's (z, x) plane), flat at top and bottom. */
const HeadOctagon = radius => Shape(Circle(ARM_Z, ARM_LENGTH, radius / Math.cos(Math.PI / HEAD_SIDES), HEAD_SIDES, Math.PI / HEAD_SIDES));

/** The fixed pedestal: base disc and stub. */
function BuildPedestal(mesh, sides) {
    mesh.Extrude(Shape(Circle(0, 0, BASE_RADIUS, sides)), 0, BASE_HEIGHT, "hub", "z");
    mesh.Extrude(Shape(Circle(0, 0, STUB_RADIUS, Math.min(sides, STUB_SIDES))), BASE_HEIGHT - 0.1, HUB_BOTTOM + 0.1, "hub", "z");
}

/** The turning part: hub, handle (+ grip) and head; `physics` coarser and closed. */
function BuildHammer(mesh, physics) {
    mesh.Extrude(Shape(Circle(0, 0, HUB_RADIUS, physics ? PHYSICS_SIDES : HUB_SIDES)), HUB_BOTTOM, HUB_TOP, "hub", "z");
    const handleStart = HUB_RADIUS - 1, handleEnd = ARM_LENGTH;
    if (physics) {
        mesh.Extrude(Shape(Circle(0, ARM_Z, PHYSICS_ARM_RADIUS, PHYSICS_SIDES)), handleStart, ARM_LENGTH - HEAD_RADIUS + 1, "handle", "x");
        mesh.Extrude(HeadOctagon(HEAD_RADIUS), -HEAD_HALF_LENGTH, HEAD_HALF_LENGTH, "head", "y");
        return;
    }
    mesh.Extrude(Shape(Circle(0, 0, NUT_RADIUS, 6, Math.PI / 6)), HUB_TOP - 0.1, HUB_TOP + NUT_HEIGHT, "hub", "z");
    mesh.Tube([[handleStart, 0, ARM_Z], [handleEnd, 0, ARM_Z]], HANDLE_RADIUS, HANDLE_SIDES, "handle", false);
    mesh.Tube([[HUB_RADIUS + 2, 0, ARM_Z], [HUB_RADIUS + 2 + GRIP_LENGTH, 0, ARM_Z]], GRIP_RADIUS, HANDLE_SIDES, "grip", true);
    // The head: steel body, a bevelled red rubber face on each end.
    const body = HEAD_HALF_LENGTH - FACE_DEPTH;
    mesh.Extrude(HeadOctagon(HEAD_RADIUS), -body, body, "head", "y");
    mesh.Extrude(HeadOctagon(HEAD_RADIUS - FACE_INSET), body - 0.1, HEAD_HALF_LENGTH, "face", "y");
    mesh.Extrude(HeadOctagon(HEAD_RADIUS - FACE_INSET), -HEAD_HALF_LENGTH, -body + 0.1, "face", "y");
}

const pedestal = new Mesh(64);
BuildPedestal(pedestal, BASE_SIDES);
const hammer = new Mesh(64);
BuildHammer(hammer, false);
const pedestalPhysics = new Mesh(64);
BuildPedestal(pedestalPhysics, PHYSICS_SIDES);
const hammerPhysics = new Mesh(64);
BuildHammer(hammerPhysics, true);

const parts = ["head", "face", "handle", "grip", "hub"];
const materials = Object.fromEntries(parts.map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
// The last frame is a full turn, the same pose as the first: the loop closes seamlessly.
const spinFrames = Array.from({ length: Math.round(SPIN_SECONDS * FPS) + 1 }, (_, f) => SpinFrame(f / FPS));
const animations = [
    { name: "spin", file: `${MODEL_DIR}/${NAME}_spin.smd`, looping: true },
    { name: "idle", file: `${MODEL_DIR}/${NAME}_idle.smd`, looping: true },
];
const mesh = `${MODEL_DIR}/${NAME}.smd`;
const triangles = [...MeshSmdTriangles(pedestal, NAME, ROOT_BONE), ...MeshSmdTriangles(hammer, NAME, ARM_BONE)];
WriteAddonFile(mesh, SmdText(BONES, triangles));
WriteAddonFile(animations[0].file, SmdAnimationText(BONES, spinFrames));
WriteAddonFile(animations[1].file, SmdAnimationText(BONES, [BindFrame(BONES)]));
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics.obj`, ObjText(pedestalPhysics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics_arm.obj`, ObjText(hammerPhysics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({
    name: NAME,
    mesh,
    physicsObj: [
        { file: `${MODEL_DIR}/${NAME}_physics.obj`, bone: "" },
        { file: `${MODEL_DIR}/${NAME}_physics_arm.obj`, bone: "arm" },
    ],
    materials,
    animations,
    surfaceProp: "metal",
}));
for (const [part, rgb, options] of [
    ["head", HEAD_COLOR, { metalness: 0.8 }],
    ["face", FACE_COLOR, {}],
    ["handle", HANDLE_COLOR, {}],
    ["grip", GRIP_COLOR, {}],
    ["hub", HUB_COLOR, { metalness: 0.6 }],
]) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...options }));
}
const reach = ARM_LENGTH + HEAD_RADIUS / Math.cos(Math.PI / HEAD_SIDES);
console.log(`${triangles.length} triangles (collision ${pedestalPhysics.triangleCount} + arm ${hammerPhysics.triangleCount}), spin ${spinFrames.length} frames; sweeps ${(2 * reach).toFixed(0)} across, head ${ARM_Z - HEAD_RADIUS}..${ARM_Z + HEAD_RADIUS} high, ${(2 * Math.PI * ARM_LENGTH / SPIN_SECONDS).toFixed(0)} units/s at the head`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
