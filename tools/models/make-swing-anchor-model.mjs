// Builds a ship's anchor swinging on a chain from a wooden gallows on a wall —
// `node tools/models/make-swing-anchor-model.mjs`: an obstacle for the
// lighthouse ramp, hung from the tower over a gap, swinging along the course
// so a melon has to time its jump past it. Flat-shaded like the wooden
// scaffold (same wood): the mount is a post against the wall, a beam out
// along +X held by a strut from below and an iron tie rod from above, iron
// bands, an iron bracket with a pin under the beam's end. The chain and the
// anchor (an admiralty anchor: ring, stock across, shank, two curved arms with
// flukes, spanning across the course, along X) hang off that pin on their own
// bone ("pendulum"), which swings round the pin — pick the way per prop:
//   swing         along the course (round X: along Y), SWING_DEGREES, one full swing there and back in SWING_SECONDS, looping
//   swing_across  across it, towards the wall and away (round Y: along X), ACROSS_DEGREES — less, so it stays
//                 WALL_CLEARANCE off the wall (checked: the generator fails if it would hit it)
//   swing_round   round in a circle (an ellipse: SWING_DEGREES along, ACROSS_DEGREES across), looping
//   idle          hanging straight down (one frame)
// Place it as a prop_dynamic with Idle Animation "swing" (or one of the others), Idle Animation Loop
// Mode "Loop" (Playback Rate for faster/slower; turn the prop so +X points
// away from the wall, the course then runs along its Y). Several in a row:
// shift each one's start with the "Start Cycle"/random start keyvalue, or they
// swing in step. A hit is an impact like any other.
// Origin on the wall face at the beam's underside; the post reaches WALL_SINK
// behind it (push it into a curved wall). The output prints how far down the
// anchor reaches: place the origin that far plus a melon's clearance above the course.
// Collision: the mount on the root, chain and anchor on "pendulum".
// ModelDoc turns an .smd 90 degrees round Z; it's written turned back (Unturn,
// like the catapult arm), so in Hammer every axis is as written here.
// Writes models/melon_racer/swing_anchor/swing_anchor.{smd,vmdl} (+ _swing/_idle.smd,
// _physics.obj, _physics_pendulum.obj) and materials/melon_racer/swing_anchor/swing_anchor_<part>.vmat.
// Compile the .vmdl with resourcecompiler (see the output).
import { AxisBox, BindFrame, Beam, Mesh, MeshSmdTriangles, ObjText, Shape, SmdAnimationText, SmdText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the melon is ~14 across, a jump clears ~85) ---
const WALL_SINK = 8;
const POST = { width: 12, depth: 12, below: 106, above: 70 }; // against the wall: from `below` under the beam to `above` over it
const ARM = { reach: 160, width: 11, height: 14 }; // the beam out of the wall, the pin under its end (the ramp is 224 wide)
const STRUT = { size: 9, drop: 96, reach: Math.round(ARM.reach * 0.55) }; // from the post under the beam up to it
const TIE = { size: 2.5, rise: 64, at: ARM.reach - 8 }; // the iron rod from the wall over the beam down to it
const BRACKET = { drop: 10, plate: 2, gap: 5 }; // the iron cheeks under the beam's end round the pin (along X)
const PIVOT = [ARM.reach, 0, -BRACKET.drop + 3];
const LINK = { half: 8, width: 4.5, wire: 1.4, pitch: 12.4 }; // chain links: half length, half width, wire radius, center to center
const CHAIN_LINKS = 17;
const ANCHOR = { ring: 6, shank: 84, shankSize: 7, stock: 72, stockSize: 5, stockAt: 18, armRadius: 34, armSize: 6, armDegrees: 70, fluke: 14 };

// --- swing ---
const FPS = 30;
const SWING_SECONDS = 4; // a pendulum this long in the game's gravity (800) swings about this slowly
const SWING_DEGREES = 34; // to each side, along the course
const ACROSS_DEGREES = 20; // to each side, towards the wall and away: as far as WALL_CLEARANCE allows
const WALL_CLEARANCE = 8; // the closest the swinging anchor comes to the wall face

// --- tessellation: as low as still reads ---
const LINK_STEPS = 6;
const LINK_SIDES = 3;
const RING_STEPS = 8;
const RING_SIDES = 4;
const ARM_STEPS = 4;

// --- look: the scaffold's weathered wood, blackened iron, a rusty anchor ---
const COLORS = {
    wood: { rgb: [0x7a, 0x56, 0x3a] },
    iron: { rgb: [0x2e, 0x30, 0x34], metalness: 0.5 },
    anchor: { rgb: [0x5a, 0x3e, 0x30], metalness: 0.3 },
};

const NAME = "swing_anchor";
const MODEL_DIR = "models/melon_racer/swing_anchor";
const MATERIAL_DIR = "materials/melon_racer/swing_anchor";
const GENERATOR = "tools/models/make-swing-anchor-model.mjs";
const Rad = d => (d * Math.PI) / 180;

/** The wooden gallows on the wall (render and collision alike, but for the iron bits). */
function BuildMount(mesh, physics) {
    const w = ARM.width / 2;
    for (const target of [mesh, physics]) {
        AxisBox(target, [-WALL_SINK, -POST.width / 2, -POST.below], [POST.depth - WALL_SINK, POST.width / 2, ARM.height + POST.above], "wood");
        AxisBox(target, [-WALL_SINK, -w, 0], [ARM.reach + 8, w, ARM.height], "wood");
        Beam(target, [POST.depth - WALL_SINK - 2, 0, -STRUT.drop], [STRUT.reach, 0, 1], STRUT.size, STRUT.size, "wood", [0, 1, 0]);
    }
    // Iron: bands round the beam, the tie rod with a plate on the wall, the bracket's cheeks and pin.
    for (const x of [POST.depth - WALL_SINK + 3, STRUT.reach - 2, ARM.reach - 2]) AxisBox(mesh, [x, -w - 0.6, -0.6], [x + 3, w + 0.6, ARM.height + 0.6], "iron");
    AxisBox(mesh, [POST.depth - WALL_SINK, -7, ARM.height + TIE.rise - 8], [POST.depth - WALL_SINK + 1.5, 7, ARM.height + TIE.rise + 8], "iron");
    Beam(mesh, [POST.depth - WALL_SINK + 1, 0, ARM.height + TIE.rise], [TIE.at, 0, ARM.height + 0.5], TIE.size, TIE.size, "iron", [0, 1, 0]);
    for (const s of [-1, 1]) {
        const x = ARM.reach + s * (BRACKET.gap + BRACKET.plate / 2);
        AxisBox(mesh, [x - BRACKET.plate / 2, -4, -BRACKET.drop], [x + BRACKET.plate / 2, 4, 0.5], "iron");
    }
    Beam(mesh, V3.Add(PIVOT, [-BRACKET.gap - BRACKET.plate - 1.5, 0, 0]), V3.Add(PIVOT, [BRACKET.gap + BRACKET.plate + 1.5, 0, 0]), 2.4, 2.4, "iron");
}

/** A loop of wire round `c`: `half` along `down`, `width` along `side`, as a closed tube. */
function Loop(mesh, c, down, side, half, width, wire, steps, sides, part) {
    const points = Array.from({ length: steps + 1 }, (_, i) => {
        const a = (2 * Math.PI * i) / steps;
        return V3.Add(c, V3.Add(V3.Scale(down, half * Math.cos(a)), V3.Scale(side, width * Math.sin(a))));
    });
    mesh.Tube(points, wire, sides, part, false);
}

/** The chain and the anchor hanging straight down from PIVOT; returns their lowest point's z. */
function BuildPendulum(mesh, physics) {
    // The chain: the first link round the pin (across it: in the YZ plane), then turning 90 degrees each link.
    let z = PIVOT[2];
    for (let i = 0; i < CHAIN_LINKS; i++) {
        const c = [PIVOT[0], 0, z - LINK.half + LINK.wire];
        Loop(mesh, c, [0, 0, 1], i % 2 ? [1, 0, 0] : [0, 1, 0], LINK.half, LINK.width, LINK.wire, LINK_STEPS, LINK_SIDES, "iron");
        z -= LINK.pitch;
    }
    const chainEnd = z - (LINK.half * 2 - LINK.pitch) - LINK.wire;
    AxisBox(physics, [PIVOT[0] - 2.5, -2.5, chainEnd], [PIVOT[0] + 2.5, 2.5, PIVOT[2]], "iron");
    // The anchor: its ring hooked into the last link (in the XZ plane, across the link before),
    // the stock across (along Y), the shank down, the arms curving out along X and up to the flukes.
    const x = PIVOT[0], ringTop = chainEnd + LINK.wire * 2;
    Loop(mesh, [x, 0, ringTop - ANCHOR.ring], [0, 0, 1], [1, 0, 0], ANCHOR.ring, ANCHOR.ring, 1.6, RING_STEPS, RING_SIDES, "anchor");
    const top = ringTop - 2 * ANCHOR.ring + 1, bottom = top - ANCHOR.shank;
    for (const target of [mesh, physics]) {
        AxisBox(target, [x - ANCHOR.shankSize / 2, -ANCHOR.shankSize / 2, bottom], [x + ANCHOR.shankSize / 2, ANCHOR.shankSize / 2, top], "anchor");
        AxisBox(target, [x - ANCHOR.stockSize / 2, -ANCHOR.stock / 2, top - ANCHOR.stockAt - ANCHOR.stockSize / 2], [x + ANCHOR.stockSize / 2, ANCHOR.stock / 2, top - ANCHOR.stockAt + ANCHOR.stockSize / 2], "anchor");
    }
    for (const y of [-1, 1]) AxisBox(mesh, [x - 4, y * ANCHOR.stock / 2 - 4, top - ANCHOR.stockAt - 4], [x + 4, y * ANCHOR.stock / 2 + 4, top - ANCHOR.stockAt + 4], "anchor"); // knobs on the stock's ends
    // Arms: an arc round a center ARM.radius over the shank's foot, out to each side.
    const center = [x, 0, bottom + ANCHOR.armRadius];
    const At = (s, deg) => V3.Add(center, [s * ANCHOR.armRadius * Math.sin(Rad(deg)), 0, -ANCHOR.armRadius * Math.cos(Rad(deg))]);
    AxisBox(mesh, [x - ANCHOR.armSize, -ANCHOR.armSize / 2 - 0.5, bottom - ANCHOR.armSize / 2], [x + ANCHOR.armSize, ANCHOR.armSize / 2 + 0.5, bottom + ANCHOR.armSize], "anchor"); // the crown
    for (const s of [-1, 1]) {
        for (let i = 0; i < ARM_STEPS; i++) {
            const a = At(s, (ANCHOR.armDegrees * i) / ARM_STEPS), b = At(s, (ANCHOR.armDegrees * (i + 1)) / ARM_STEPS);
            Beam(mesh, a, V3.Add(b, V3.Scale(V3.Unit(V3.Sub(b, a)), 2)), ANCHOR.armSize, ANCHOR.armSize, "anchor", [0, 1, 0]);
        }
        Beam(physics, At(s, 0), At(s, ANCHOR.armDegrees), ANCHOR.armSize, ANCHOR.armSize, "anchor", [0, 1, 0]);
        // The fluke: a flat spade on the arm's end, pointing on along the arm (in the XZ plane, 3 thick along Y).
        const tip = At(s, ANCHOR.armDegrees), dir = V3.Unit(V3.Sub(tip, At(s, ANCHOR.armDegrees - 12))), out = [dir[2] * -s, 0, dir[0] * s];
        const point = V3.Add(tip, V3.Scale(dir, ANCHOR.fluke * 0.7)), back = V3.Sub(tip, V3.Scale(dir, ANCHOR.fluke));
        const spade = [point, V3.Add(tip, V3.Scale(out, ANCHOR.fluke * 0.55)), back, V3.Sub(tip, V3.Scale(out, ANCHOR.fluke * 0.55))];
        mesh.Extrude(Shape(spade.map(([px, , pz]) => [pz, px])), -1.5, 1.5, "anchor", "y");
        physics.Extrude(Shape(spade.map(([px, , pz]) => [pz, px])), -1.5, 1.5, "anchor", "y");
    }
    return bottom - ANCHOR.armSize / 2;
}

// --- skeleton and animations ---
// ModelDoc turns an .smd 90 degrees around Z ((x, y, z) -> (-y, x, z)): written turned back.
const Unturn = ([x, y, z]) => [y, -x, z];
const BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    { name: "pendulum", parent: 0, bind: Unturn(PIVOT) },
];
const PENDULUM_BONE = 1;
/** The skeleton swung `along` degrees round Hammer's X (the file's -Y) and `across` round Hammer's Y (the file's X). */
function SwingFrame(along, across = 0) {
    const frame = BindFrame(BONES);
    frame[PENDULUM_BONE].rot = [Rad(across), -Rad(along), 0];
    return frame;
}
/** A point of the pendulum swung like SwingFrame, in Hammer's frame: round X first, then round Y, both through PIVOT. */
function Swung(p, along, across) {
    const [x, y, z] = V3.Sub(p, PIVOT), a = Rad(along), b = Rad(across);
    const y1 = y * Math.cos(a) - z * Math.sin(a), z1 = y * Math.sin(a) + z * Math.cos(a);
    return V3.Add(PIVOT, [x * Math.cos(b) + z1 * Math.sin(b), y1, -x * Math.sin(b) + z1 * Math.cos(b)]);
}
/** One looping animation: (along, across) in degrees at share f (0..1) of the cycle; the last frame would repeat the first, so it's left out. */
const Cycle = Angles => Array.from({ length: Math.round(SWING_SECONDS * FPS) }, (_, f) => Angles((2 * Math.PI * f) / (SWING_SECONDS * FPS)));
const MOTIONS = {
    swing: t => [SWING_DEGREES * Math.sin(t), 0],
    swing_across: t => [0, ACROSS_DEGREES * Math.sin(t)],
    swing_round: t => [SWING_DEGREES * Math.sin(t), ACROSS_DEGREES * Math.cos(t)],
};

const mount = new Mesh(32), mountPhysics = new Mesh();
BuildMount(mount, mountPhysics);
const pendulum = new Mesh(32), pendulumPhysics = new Mesh();
const lowest = BuildPendulum(pendulum, pendulumPhysics);

const Turned = tris => tris.map(tri => ({ ...tri, corners: tri.corners.map(c => ({ ...c, p: Unturn(c.p), n: Unturn(c.n) })) }));
const triangles = Turned([...MeshSmdTriangles(mount, NAME, 0), ...MeshSmdTriangles(pendulum, NAME, PENDULUM_BONE)]);
// Every motion must keep the anchor off the wall (both ways round, so a mirrored rotation can't sneak in).
let closest = Infinity;
for (const [name, Angles] of Object.entries(MOTIONS)) {
    for (const [along, across] of Cycle(Angles)) {
        for (const sign of [1, -1]) {
            const x = Math.min(...pendulum.v.map(p => Swung(p, along, sign * across)[0]));
            if (x < WALL_CLEARANCE) throw new Error(`${name}: the anchor comes within ${x.toFixed(1)} of the wall (at ${along.toFixed(0)} / ${(sign * across).toFixed(0)} degrees): lower ACROSS_DEGREES or raise ARM.reach`);
            closest = Math.min(closest, x);
        }
    }
}
const animations = [
    ...Object.entries(MOTIONS).map(([name, Angles]) => ({ name, frames: Cycle(Angles).map(([along, across]) => SwingFrame(along, across)) })),
    { name: "idle", frames: [BindFrame(BONES)] },
].map(a => ({ ...a, file: `${MODEL_DIR}/${NAME}_${a.name}.smd`, looping: true }));
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`${MODEL_DIR}/${NAME}.smd`, SmdText(BONES, triangles));
for (const a of animations) WriteAddonFile(a.file, SmdAnimationText(BONES, a.frames));// In Hammer's frame like the render mesh (written turned back), so no { smd: true } turn here.
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics.obj`, ObjText(mountPhysics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics_pendulum.obj`, ObjText(pendulumPhysics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({
    name: NAME,
    mesh: `${MODEL_DIR}/${NAME}.smd`,
    physicsObj: [
        { file: `${MODEL_DIR}/${NAME}_physics.obj`, bone: "" },
        { file: `${MODEL_DIR}/${NAME}_physics_pendulum.obj`, bone: "pendulum" },
    ],
    materials,
    animations: animations.map(({ name, file, looping }) => ({ name, file, looping })),
    surfaceProp: "metal",
}));
for (const [part, { rgb, metalness = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, metalness, tint: 0 }));
}
const length = PIVOT[2] - lowest;
console.log(`${triangles.length} triangles (mount ${mount.triangleCount}, chain + anchor ${pendulum.triangleCount}; collision ${mountPhysics.triangleCount} + ${pendulumPhysics.triangleCount}), animations ${animations.map(a => `${a.name} (${a.frames.length})`).join(", ")}; at its closest ${closest.toFixed(0)} off the wall`);
console.log(`the anchor's lowest point ${(-lowest).toFixed(0)} under the origin (hanging straight down), ${length.toFixed(0)} under the pin; it sweeps ${(2 * length * Math.sin(Rad(SWING_DEGREES))).toFixed(0)} along the course, ${(2 * (ANCHOR.armRadius * Math.sin(Rad(ANCHOR.armDegrees)) + ANCHOR.fluke * 0.7)).toFixed(0)} wide across it, ${ARM.reach} out from the wall`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
