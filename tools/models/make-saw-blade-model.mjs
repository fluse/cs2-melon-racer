// Generates a circular saw blade (Kreissaegeblatt) — `node tools/models/make-saw-blade-model.mjs`:
// a thin steel disc with hooked teeth, a darker carbide tip on every tooth
// (a little wider than the blade, like a real kerf), four expansion slots,
// a signal red ring printed on both faces and a clamping flange with a hex
// nut in the middle. Everything sits on one bone that turns:
//   spin    one full turn every SPIN_SECONDS, looping
//   idle    standing still (one frame)
// A track hazard: place it as a prop_dynamic (Idle Animation "spin" with
// Idle Animation Loop Mode "Loop" — "Do Not Loop" stops it after one turn; its
// Playback Rate or the SetPlaybackRate input makes it faster or slower,
// SetAnimation "idle" stops it) and give it a melon_break trigger. Only the
// picture turns — the collision is a plain disc, so that's all it needs.
// Writes
//   models/melon_racer/saw_blade/saw_blade.smd           render mesh + skeleton (bind pose)
//   models/melon_racer/saw_blade/saw_blade_{spin,idle}.smd   the animations
//   models/melon_racer/saw_blade/saw_blade_physics.obj   collision: a thicker plain disc (no teeth) + the hub
//   models/melon_racer/saw_blade/saw_blade.vmdl
//   materials/melon_racer/saw_blade/saw_blade_{blade,tip,paint,hub}.vmat (+ _color.png)
// Compile the .vmdl with resourcecompiler (see the end of the output). Origin
// in the blade's center (the axis to spin it around); the blade stands
// upright in the XZ plane, its faces towards ±Y. The teeth cut when the top
// edge moves towards +X.
import { BindFrame, Circle, Mesh, MeshSmdTriangles, ObjText, Polar, RadialOutline, Shape, Slot, SmdAnimationText, SmdText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the melon is ~14 across) ---
const DIAMETER = 36; // across the tooth tips: the size it's placed at in the 2D route
// Every measure below was drawn for a 96-unit blade and is scaled by S, so
// the proportions stay when DIAMETER changes. (Scale the model here, not in
// Hammer: a prop_dynamic ignores a non-uniform scale in-game.)
const S = DIAMETER / 96;
const RADIUS = 48 * S; // tooth tips
const ROOT_RADIUS = 41.5 * S; // bottom of the gullets
const TEETH = 24;
const BLADE_THICKNESS = 2 * S;
const TIP_THICKNESS = 3.2 * S; // the carbide tips, wider than the blade
const TIP_DEPTH = 4 * S; // how far down the tooth face a tip reaches
const TIP_LENGTH = 0.24; // along the tooth's back, in tooth pitches
const SLOTS = 4; // expansion slots, evenly around
const SLOT_INNER = 27 * S; // their inner end's radius
const SLOT_OUTER = 36 * S;
const SLOT_SWEEP = 0.18; // how far the outer end trails the inner one (radians)
const SLOT_WIDTH = 1.6 * S;
const PAINT_INNER = 15 * S; // the printed ring
const PAINT_OUTER = 23 * S;
const PAINT_LIFT = 0.05; // how far it stands off the blade's face
const FLANGE_RADIUS = 11 * S;
const FLANGE_THICKNESS = 2.5 * S; // per side
const NUT_RADIUS = 6 * S; // hex nut, corner radius
const NUT_THICKNESS = 2.5 * S; // per side, on top of the flange
const PHYSICS_THICKNESS = 4; // not scaled: much thicker than the blade, so a fast melon doesn't tunnel through

// --- spin animation ---
const SPIN_SECONDS = 1; // one full turn
const FPS = 30;

// One tooth, [t, radius]: t runs along one tooth pitch in the cutting direction.
// The back rises slowly from the gullet to the tip at TIP_T, the face drops
// almost radially, hooked slightly forward.
const TIP_T = 0.8;
const TOOTH_PROFILE = [
    [0, ROOT_RADIUS],
    [0.3, ROOT_RADIUS + 2.4 * S],
    [0.55, ROOT_RADIUS + 4.3 * S],
    [TIP_T, RADIUS],
    [0.83, ROOT_RADIUS + 2.6 * S],
    [0.9, ROOT_RADIUS + 0.4 * S],
];

// --- tessellation: as low as still reads round ---
const PAINT_SIDES = 32; // the ring is big and flat: 11.25° steps
const FLANGE_SIDES = 16;
const SLOT_END_SIDES = 3;
const PHYSICS_SIDES = 16;
const PHYSICS_HUB_SIDES = 8;

// --- look: bright steel, warning red ring (off-palette on purpose: a hazard) ---
const BLADE_COLOR = [0xc8, 0xcc, 0xd2]; // polished steel
const TIP_COLOR = [0x5e, 0x62, 0x6a]; // carbide, darker
const PAINT_COLOR = [0xe8, 0x3c, 0x2a]; // signal red
const HUB_COLOR = [0x3a, 0x3e, 0x46]; // flange and nut

const NAME = "saw_blade";
const MODEL_DIR = "models/melon_racer/saw_blade";
const MATERIAL_DIR = "materials/melon_racer/saw_blade";
const GENERATOR = "tools/models/make-saw-blade-model.mjs";

// --- skeleton: a fixed root and the blade turning on it around Y ---
const BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    { name: "blade", parent: 0, bind: [0, 0, 0] },
];
const BLADE_BONE = 1;

/** The skeleton t seconds into the spin: turned around +Y, so the top edge moves towards +X. */
function SpinFrame(t) {
    const frame = BindFrame(BONES);
    frame[BLADE_BONE].rot = [0, (2 * Math.PI * t) / SPIN_SECONDS, 0];
    return frame;
}

/** The tooth profile's radius at t (0..1), straight between its points. */
function ProfileRadius(t) {
    const pts = [...TOOTH_PROFILE, [1, TOOTH_PROFILE[0][1]]];
    const i = pts.findIndex(([pt]) => pt > t);
    const [t0, r0] = pts[i - 1], [t1, r1] = pts[i];
    return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
}

/** Tooth k's carbide tip in the blade's 2D plane: its top follows the tooth's back up to the tip. */
function TipOutline(k) {
    const A = t => (2 * Math.PI * (k + t)) / TEETH;
    const back = TIP_T - TIP_LENGTH;
    return [
        Polar(0, 0, RADIUS + 0.3 * S, A(TIP_T + 0.01)),
        Polar(0, 0, RADIUS - TIP_DEPTH, A(TIP_T + 0.025)),
        Polar(0, 0, ProfileRadius(back) - TIP_DEPTH + S, A(back)),
        Polar(0, 0, ProfileRadius(back) + 0.3 * S, A(back)),
    ];
}

/** Both sides of the blade's center plane: from -d to d along Y. */
const Both = (mesh, shapes, d0, d1, part) => {
    mesh.Extrude(shapes, d0, d1, part, "y");
    mesh.Extrude(shapes, -d1, -d0, part, "y");
};

/** The render mesh (detailed) or the collision mesh (`physics`). */
function Build(physics) {
    const mesh = new Mesh(64);
    const half = BLADE_THICKNESS / 2;
    if (physics) {
        mesh.Extrude(Shape(Circle(0, 0, RADIUS - S, PHYSICS_SIDES)), -PHYSICS_THICKNESS / 2, PHYSICS_THICKNESS / 2, "blade", "y");
        const hub = half + FLANGE_THICKNESS + NUT_THICKNESS;
        mesh.Extrude(Shape(Circle(0, 0, FLANGE_RADIUS, PHYSICS_HUB_SIDES)), -hub, hub, "hub", "y");
        return mesh;
    }

    // The blade: toothed outline, the expansion slots cut out of it.
    const slots = Array.from({ length: SLOTS }, (_, i) => {
        const a = (2 * Math.PI * i) / SLOTS;
        return Slot(Polar(0, 0, SLOT_INNER, a), Polar(0, 0, SLOT_OUTER, a - SLOT_SWEEP), SLOT_WIDTH / 2, SLOT_END_SIDES);
    });
    mesh.Extrude(Shape(RadialOutline(0, 0, TEETH, TOOTH_PROFILE), slots), -half, half, "blade", "y");

    // A carbide tip on every tooth.
    for (let k = 0; k < TEETH; k++) {
        mesh.Extrude(Shape(TipOutline(k)), -TIP_THICKNESS / 2, TIP_THICKNESS / 2, "tip", "y");
    }

    // The printed ring, on both faces.
    const ring = Shape(Circle(0, 0, PAINT_OUTER, PAINT_SIDES), [Circle(0, 0, PAINT_INNER, PAINT_SIDES)]);
    mesh.Cap(ring, half + PAINT_LIFT, "paint", "y", 1);
    mesh.Cap(ring, -(half + PAINT_LIFT), "paint", "y", -1);

    // Flange and hex nut, on both sides.
    Both(mesh, Shape(Circle(0, 0, FLANGE_RADIUS, FLANGE_SIDES)), half - 0.1 * S, half + FLANGE_THICKNESS, "hub");
    const nutStart = half + FLANGE_THICKNESS - 0.1 * S;
    Both(mesh, Shape(Circle(0, 0, NUT_RADIUS, 6, Math.PI / 6)), nutStart, nutStart + NUT_THICKNESS, "hub");
    return mesh;
}

const render = Build(false);
const physics = Build(true);
const mesh = `${MODEL_DIR}/${NAME}.smd`;
const physicsObj = `${MODEL_DIR}/${NAME}_physics.obj`;
const parts = ["blade", "tip", "paint", "hub"];
const materials = Object.fromEntries(parts.map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
// The last frame is a full turn, the same pose as the first: the loop closes seamlessly.
const spinFrames = Array.from({ length: Math.round(SPIN_SECONDS * FPS) + 1 }, (_, f) => SpinFrame(f / FPS));
const animations = [
    { name: "spin", file: `${MODEL_DIR}/${NAME}_spin.smd`, looping: true },
    { name: "idle", file: `${MODEL_DIR}/${NAME}_idle.smd`, looping: true },
];
WriteAddonFile(mesh, SmdText(BONES, MeshSmdTriangles(render, NAME, BLADE_BONE)));
WriteAddonFile(animations[0].file, SmdAnimationText(BONES, spinFrames));
WriteAddonFile(animations[1].file, SmdAnimationText(BONES, [BindFrame(BONES)]));
WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR, { smd: true }));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh, physicsObj, materials, animations, surfaceProp: "metal" }));
for (const [part, rgb, options] of [
    ["blade", BLADE_COLOR, { metalness: 0.85 }],
    ["tip", TIP_COLOR, { metalness: 0.7 }],
    ["paint", PAINT_COLOR, {}],
    ["hub", HUB_COLOR, { metalness: 0.6 }],
]) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...options }));
}
const width = 2 * (BLADE_THICKNESS / 2 + FLANGE_THICKNESS + NUT_THICKNESS);
console.log(`${render.triangleCount} triangles (collision ${physics.triangleCount}), spin ${spinFrames.length} frames, ${2 * RADIUS} across, ${width.toFixed(1)} thick at the hub`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
