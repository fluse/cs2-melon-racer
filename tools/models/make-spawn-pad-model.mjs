// Builds the pad that marks where melons spawn in the hub (hub_spawn) —
// `node tools/models/make-spawn-pad-model.mjs`. In the stage's look
// (make-stage-model.mjs): a low round disc in light grey, two steps of
// PAD_STEP_RISE so a melon rolls on and off it, a dark inlay ring, a
// glowing ring round the middle, a dark spot in the middle with a white ring
// (where the melon appears), and white chevrons pointing +X: the way the
// melon faces when it spawns.
//
// Split in two so each is tinted on its own (the prop's render color):
//   spawn_pad        the disc and its markings (solid)
//   spawn_pad_light  the glowing ring and the chevrons' glowing tips
// Both at the same origin: on the floor under hub_spawn, yaw = hub_spawn's yaw.
// Writes models/melon_racer/spawn_pad/<piece>.vmdl (+ .obj, the pad with
// _physics.obj) and materials/melon_racer/spawn_pad/spawn_pad_<part>.vmat
// (+ _color.png). Compile the .vmdl files with resourcecompiler (see the output).
import { Circle, Mesh, ObjText, Shape, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

const PAD_RADIUS = 44; // the bottom step's edge: a few melons across
const PAD_STEP_RISE = 1; // two steps: a melon rolls over them
const PAD_STEP_TREAD = 3;
const PAD_HEIGHT = 2 * PAD_STEP_RISE;
const SIDES = 40; // around the disc
const RAISE = 0.1; // flat markings this far over the surface
const INLAY = { radius: 38, width: 1.6 }; // a dark ring near the edge
const GLOW = { radius: 30, width: 2.4 }; // the glowing ring
const SPOT = { radius: 11, ring: [8.5, 9.6] }; // the dark spot in the middle and its white ring
// Chevrons in front of the spot, pointing +X: [tip's x], each `size` long, `width` thick, half-angle `spread`.
const CHEVRONS = { tips: [21, 27.5], size: 7.5, width: 2.4, spread: 50 };

const COLORS = {
    body: { rgb: [0xd8, 0xdc, 0xe0], tint: 1 }, // the stage's light grey, tinted per prop
    dark: { rgb: [0x2b, 0x30, 0x38], tint: 0 }, // graphite
    white: { rgb: [0xf2, 0xf4, 0xf5], tint: 0 },
    light: { rgb: [0xff, 0xf1, 0xd6], tint: 1, glow: 3 }, // the stage's warm white LEDs, tinted per prop
};

const NAME = "spawn_pad";
const MODEL_DIR = "models/melon_racer/spawn_pad";
const MATERIAL_DIR = "materials/melon_racer/spawn_pad";
const GENERATOR = "tools/models/make-spawn-pad-model.mjs";

/** A ring from r0 to r1 around the origin. */
const Ring = (r0, r1) => Shape(Circle(0, 0, r1, SIDES), [Circle(0, 0, r0, SIDES)]);
/** A chevron (an arrow head without a shaft) pointing +X, its tip at (tip, 0). */
function Chevron(tip) {
    const { size, width, spread } = CHEVRONS;
    const a = (spread * Math.PI) / 180, back = size * Math.cos(a), side = size * Math.sin(a);
    const inner = width / Math.sin(a); // the inner tip, `width` behind the outer one across the arms
    return Shape([[tip, 0], [tip - back, side], [tip - back - inner, side], [tip - inner, 0], [tip - back - inner, -side], [tip - back, -side]]);
}

function BuildPad(mesh, physics) {
    mesh.Extrude(Shape(Circle(0, 0, PAD_RADIUS, SIDES)), 0, PAD_STEP_RISE, "body", "z");
    mesh.Extrude(Shape(Circle(0, 0, PAD_RADIUS - PAD_STEP_TREAD, SIDES)), PAD_STEP_RISE - 0.5, PAD_HEIGHT, "body", "z");
    const top = PAD_HEIGHT + RAISE;
    mesh.Cap(Ring(INLAY.radius - INLAY.width / 2, INLAY.radius + INLAY.width / 2), top, "dark", "z");
    mesh.Cap(Ring(SPOT.ring[1], SPOT.radius), top, "dark", "z");
    mesh.Cap(Ring(SPOT.ring[0], SPOT.ring[1]), top, "white", "z");
    mesh.Cap(Shape(Circle(0, 0, SPOT.ring[0], SIDES)), top, "dark", "z");
    mesh.Cap(CHEVRONS.tips.flatMap(Chevron), top, "white", "z");
    physics.Extrude(Shape(Circle(0, 0, PAD_RADIUS, 16)), 0, PAD_STEP_RISE, "body", "z");
    physics.Extrude(Shape(Circle(0, 0, PAD_RADIUS - PAD_STEP_TREAD, 16)), PAD_STEP_RISE - 0.5, PAD_HEIGHT, "body", "z");
}

/** The glowing ring, a little over the pad's markings so it never flickers with the disc. */
function BuildLight(mesh) {
    mesh.Cap(Ring(GLOW.radius - GLOW.width / 2, GLOW.radius + GLOW.width / 2), PAD_HEIGHT + 2 * RAISE, "light", "z");
}

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const Used = mesh => Object.fromEntries(Object.keys(mesh.tris).map(part => [part, materials[part]]));
const PIECES = [
    { piece: NAME, solid: true, Build: BuildPad },
    { piece: `${NAME}_light`, Build: BuildLight },
];
for (const { piece, solid, Build } of PIECES) {
    const mesh = new Mesh(64), physics = new Mesh();
    Build(mesh, physics);
    const obj = `${MODEL_DIR}/${piece}.obj`;
    const physicsObj = solid ? `${MODEL_DIR}/${piece}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    if (solid) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${piece}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Used(mesh) }));
    console.log(`  ${piece}.vmdl: ${mesh.triangleCount} triangles${solid ? ` (collision ${physics.triangleCount})` : ""}`);
}
for (const [part, { rgb, tint, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint, glow }));
}
console.log(`pad ${2 * PAD_RADIUS} across, ${PAD_HEIGHT} high; place both on the floor under hub_spawn, yaw = hub_spawn's (the chevrons point +X)`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/<piece>.vmdl"`);
