// Builds old storm lanterns to light dark corners (the lighthouse parkour's
// rock, its back side) — `node tools/models/make-lantern-model.mjs`: a hexagonal
// iron lantern, its glass glowing warm (self-illum: it lights nothing — put a
// light entity at the glass, the output says where), flat-shaded like the
// coast rocks and the wooden scaffold. Variants (VARIANTS):
//   lantern_hanging   just the lantern, origin at the top of its ring: hang it under a scaffold's rail, a beam, a ceiling
//   lantern_standing  the lantern, origin on the floor under it: on a scaffold deck, a rock, a crate
//   lantern_wall      an iron plate on the wall, an arm out along +X with a brace, the lantern hanging off its end;
//                     origin on the wall face at the arm's height, the plate WALL_SINK behind it
//   lantern_post      a wooden post on a crossed foot, an arm out along +X at its top, the lantern hanging off it; origin on the floor
//   lantern_post_double the same with an arm and a lantern each way (+X and -X)
// Only the posts are solid (the post, a box); the lanterns hang over a melon's head.
// Writes models/melon_racer/lantern/<variant>.vmdl (+ .obj, _physics.obj for the posts)
// and materials/melon_racer/lantern/lantern_<part>.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { AxisBox, Beam, Circle, Mesh, ObjText, Shape, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the melon is ~14 across) ---
const SIDES = 6; // the lantern's hexagon
const BASE = { radius: 6.5, height: 2.5 };
const GLASS = { radius: 5.2, height: 10 };
const BAND = { radius: 6.5, height: 1.5 };
const CAP = { radius: 7.2, height: 5 };
const CHIMNEY = { radius: 2, height: 2 };
const RING = { radius: 2.4, thickness: 0.5 };
const BAR = 0.9; // the frame's bars at the glass' corners
const HOOK = 3; // from the arm down to the ring's top
const WALL_SINK = 4;
const WALL_ARM = { length: 22, braceDrop: 9, braceReach: 14 };
const POST = { size: 6, height: 112, foot: 26, arm: 24, braceDrop: 16, braceReach: 14 };

// --- tessellation: as low as still reads ---
const RING_SIDES = 3;
const RING_STEPS = 6;

// --- look: blackened iron, warm candle light, weathered wood (the scaffold's beams) ---
const COLORS = {
    iron: { rgb: [0x2e, 0x30, 0x34], metalness: 0.5 },
    glass: { rgb: [0xff, 0xc8, 0x70], tint: 0, glow: 4 },
    wood: { rgb: [0x7a, 0x56, 0x3a] },
};

const NAME = "lantern";
const MODEL_DIR = "models/melon_racer/lantern";
const MATERIAL_DIR = "materials/melon_racer/lantern";
const GENERATOR = "tools/models/make-lantern-model.mjs";

const LANTERN_HEIGHT = BASE.height + GLASS.height + BAND.height + CAP.height + CHIMNEY.height + 2 * RING.radius;

/** A hexagonal prism round (x, y) from z0 to z1. */
const Hex = (mesh, [x, y], radius, z0, z1, part) => mesh.Extrude(Shape(Circle(x, y, radius, SIDES)), z0, z1, part, "z");

/** The lantern standing at `at` (the middle of its bottom); returns the glass' middle (where the light goes). */
function Lantern(mesh, at) {
    const [x, y] = at;
    let z = at[2];
    Hex(mesh, at, BASE.radius, z, z += BASE.height, "iron");
    const glass = [x, y, z + GLASS.height / 2];
    Hex(mesh, at, GLASS.radius, z, z + GLASS.height, "glass");
    for (const [cx, cy] of Circle(x, y, GLASS.radius + BAR / 4, SIDES)) AxisBox(mesh, [cx - BAR / 2, cy - BAR / 2, z], [cx + BAR / 2, cy + BAR / 2, z + GLASS.height], "iron");
    z += GLASS.height;
    Hex(mesh, at, BAND.radius, z, z += BAND.height, "iron");
    // The cap: a flat-shaded hexagonal pyramid, cut off under the chimney.
    const base = Circle(x, y, CAP.radius, SIDES).map(([u, v]) => [u, v, z]);
    const top = Circle(x, y, CHIMNEY.radius, SIDES).map(([u, v]) => [u, v, z + CAP.height]);
    for (let k = 0; k < SIDES; k++) {
        const n = (k + 1) % SIDES;
        mesh.Tri(base[k], base[n], top[n], "iron");
        mesh.Tri(base[k], top[n], top[k], "iron");
        mesh.Tri(base[n], base[k], [x, y, z], "iron"); // its underside
    }
    z += CAP.height;
    Hex(mesh, at, CHIMNEY.radius, z, z += CHIMNEY.height, "iron");
    // The ring on top, upright in the XZ plane.
    const ring = Array.from({ length: RING_STEPS + 1 }, (_, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / RING_STEPS;
        return [x + RING.radius * Math.cos(a), y, z + RING.radius + RING.radius * Math.sin(a)];
    });
    mesh.Tube(ring, RING.thickness, RING_SIDES, "iron", false);
    return glass;
}
/** The lantern hanging from the point `hook` on an arm: a short bar down to its ring. */
function HangingLantern(mesh, hook) {
    Beam(mesh, hook, V3.Add(hook, [0, 0, -HOOK]), 0.8, 0.8, "iron");
    return Lantern(mesh, V3.Add(hook, [0, 0, -HOOK - LANTERN_HEIGHT]));
}

function Hanging() {
    const mesh = new Mesh(32);
    return { mesh, lights: [Lantern(mesh, [0, 0, -LANTERN_HEIGHT])] };
}
function Standing() {
    const mesh = new Mesh(32);
    return { mesh, lights: [Lantern(mesh, [0, 0, 0])] };
}
function Wall() {
    const mesh = new Mesh(32);
    AxisBox(mesh, [-WALL_SINK, -4, -WALL_ARM.braceDrop - 3], [1, 4, 5], "iron"); // the plate
    Beam(mesh, [0, 0, 0], [WALL_ARM.length, 0, 0], 2, 2, "iron");
    Beam(mesh, [0, 0, -WALL_ARM.braceDrop], [WALL_ARM.braceReach, 0, 0], 1.6, 1.6, "iron", [0, 1, 0]);
    AxisBox(mesh, [WALL_ARM.length - 2, -1.4, -0.5], [WALL_ARM.length, 1.4, 2.5], "iron"); // a knob at its end
    return { mesh, lights: [HangingLantern(mesh, [WALL_ARM.length - 4, 0, -1])] };
}
/** A wooden post with an arm and a lantern towards each of `sides` (+1: +X, -1: -X). */
function Post(sides) {
    const mesh = new Mesh(32), physics = new Mesh();
    const h = POST.size / 2, top = POST.height;
    AxisBox(mesh, [-h, -h, 0], [h, h, top], "wood");
    AxisBox(physics, [-h, -h, 0], [h, h, top], "wood");
    for (const axis of [0, 1]) { // the crossed foot
        const lo = [-h - 1, -h - 1, 0], hi = [h + 1, h + 1, 5];
        lo[axis] = -POST.foot / 2; hi[axis] = POST.foot / 2;
        AxisBox(mesh, lo, hi, "wood");
    }
    AxisBox(mesh, [-h - 0.5, -h - 0.5, top], [h + 0.5, h + 0.5, top + 2], "iron"); // a cap on its head
    const lights = sides.map(s => {
        const z = top - 6;
        Beam(mesh, [0, 0, z], [s * POST.arm, 0, z], 4, 4, "wood");
        Beam(mesh, [s * h, 0, z - POST.braceDrop], [s * POST.braceReach, 0, z - 2], 3, 3, "wood", [0, 1, 0]);
        return HangingLantern(mesh, [s * (POST.arm - 4), 0, z - 2]);
    });
    return { mesh, physics, lights };
}

const VARIANTS = [
    { name: "lantern_hanging", build: Hanging },
    { name: "lantern_standing", build: Standing },
    { name: "lantern_wall", build: Wall },
    { name: "lantern_post", build: () => Post([1]) },
    { name: "lantern_post_double", build: () => Post([1, -1]) },
];

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const fmt = p => p.map(n => +n.toFixed(1)).join(" ");
for (const variant of VARIANTS) {
    const { mesh, physics, lights } = variant.build();
    const obj = `${MODEL_DIR}/${variant.name}.obj`, physicsObj = physics ? `${MODEL_DIR}/${variant.name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    if (physics) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${variant.name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    console.log(`  ${variant.name}.vmdl: ${mesh.triangleCount} triangles, ${physics ? `collision ${physics.triangleCount}` : "no collision"}; light at ${lights.map(fmt).join(" and ")} from the origin`);
}
for (const [part, { rgb, metalness = 0, tint = 1, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, metalness, tint, glow }));
}
console.log(`light: a light_omni2 at the glass, warm (255 200 112), small range (~300-500), shadows off where it's only fill`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/<variant>.vmdl"`);
