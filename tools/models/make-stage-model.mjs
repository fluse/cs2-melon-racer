// Builds the round stage the Grand Prix pavilion stands on — `node tools/models/make-stage-model.mjs`:
// a round deck, low steps all the way round it with a glowing LED strip
// along every riser, and at each of the pavilion's four openings (+X, +Y,
// -X, -Y) a platform reaching out over the steps at deck height, with steps
// at its front end and LED strips along its edges. Details: the deck laid in
// panels (thin dark joints, rings and spokes), a checkered racing ring inside
// a dark inlay ring, a dark anti-slip strip along every step's edge, and a
// bollard with a glowing cap at each platform's front corners.
//
// Split into models so each piece can be tinted on its own (the prop's
// render color tints the deck surface and the lights, never the dark inlay),
// the repeated ones built once, all around the same origin (the stage's
// middle, on the floor), so every piece is placed at that one spot and only
// turned (yaw, in 90 degree steps):
//   stage_deck          the deck: panels, inlay ring, checkered ring   1x
//   stage_steps         the steps of one quarter (+X to +Y)            4x: yaw 0, 90, 180, 270
//   stage_step_lights   that quarter's LED strips                      4x: yaw 0, 90, 180, 270
//   stage_thrust        the platform at +X with its front steps,
//                       and bollards                                   4x: yaw 0, 90, 180, 270
//   stage_thrust_lights its LED strips and the bollards' caps          4x: yaw 0, 90, 180, 270
// The pavilion stands on the deck: place its pieces STAGE_HEIGHT higher.
// Plus the backdrop platform the hub's podium, rocks and trees stand on, in
// the same look, with its own origin (raise what stands on it STAGE_HEIGHT too):
//   stage_platform        a rectangular deck (PLATFORM), panel joints,
//                         steps across its whole front (+X)              1x, origin: the deck's middle, on the floor
//   stage_platform_lights its LED strips: front risers, both sides        1x, same origin
// Steps are low (STEP_RISE) so a melon can roll up them.
// Writes models/melon_racer/stage/stage_<piece>.vmdl (+ .obj; deck, steps
// and thrust with _physics.obj — the lights aren't solid) and
// materials/melon_racer/stage/stage_{deck,dark,light}.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { Circle, Mesh, ObjText, Shape, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

const DECK_RADIUS = 272; // the pavilion's legs, stakes and blower stand within it
const STEP_RISE = 4; // each step's height: low, so melons roll up
const STEP_COUNT = 4; // risers, the deck's own edge included
const STEP_TREAD = 16; // each step's depth
const STAGE_HEIGHT = STEP_RISE * STEP_COUNT; // the deck's top
const OUTER_RADIUS = DECK_RADIUS + (STEP_COUNT - 1) * STEP_TREAD; // the lowest step's outer edge
const ARC_STEP = 3; // degrees per straight piece along the round edges
const INLAY = { radius: 252, width: 5, raise: 0.1 }; // a dark ring set into the deck
// The checkered ring inside it: two rows of square tiles (as long round the ring as deep), every other one dark.
const CHECKER = { outer: 247, rows: 2, depth: 8, tiles: 192, raise: 0.1 }; // tiles: 2 pi r / depth, even
// The deck's panels: thin dark joints, rings at JOINT_RINGS and spokes every JOINT_SPOKE degrees between them.
const JOINT = { width: 0.8, raise: 0.08, rings: [70, 140, 200], spoke: 22.5, arcStep: 6 };
// Anti-slip strips along every step's edge (the deck's too): dark, on the tread.
const NOSING = { width: 2.2, inset: 0.6, raise: 0.12, arcStep: 4.5 };
// Bollards at the platform's front corners: a dark post, a glowing cap.
const BOLLARD = { radius: 3, height: 16, inset: 7, cap: 3, sides: 12 };
// The platforms at the openings: along +X, THRUST_WIDTH wide, from the deck's
// edge out THRUST_REACH past the steps' outer edge, then its own steps.
const THRUST_WIDTH = 128;
const THRUST_REACH = 48;
// LED strips: a thin glowing rod along the top of each riser and of the platform's sides.
const LED = { radius: 0.7, sides: 4, below: 1.3, out: 0.15, arcStep: 4.5 };
const PHYSICS_ARC_STEP = 10;
// The backdrop platform: depth along X (its steps beyond it at +X), width along Y, panel joints every `grid` units.
const PLATFORM = { depth: 448, width: 832, grid: 64 };

const COLORS = {
    deck: { rgb: [0xd8, 0xdc, 0xe0], tint: 1 }, // light grey, matte, tinted per prop
    dark: { rgb: [0x2b, 0x30, 0x38], tint: 0 }, // the hub gates' graphite: inlay, checks, joints, nosing, bollards
    light: { rgb: [0xff, 0xf1, 0xd6], tint: 1, glow: 3 }, // warm white LEDs, tinted per prop
};

const NAME = "stage";
const MODEL_DIR = "models/melon_racer/stage";
const MATERIAL_DIR = "materials/melon_racer/stage";
const GENERATOR = "tools/models/make-stage-model.mjs";

const Rad = d => (d * Math.PI) / 180;
/** Points along an arc of radius r from a0 to a1 (degrees), every `step` degrees. */
const Arc = (r, a0, a1, step) => {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
    return Array.from({ length: n + 1 }, (_, i) => {
        const a = Rad(a0 + ((a1 - a0) * i) / n);
        return [r * Math.cos(a), r * Math.sin(a)];
    });
};
/** An annular sector from radius r0 to r1, a0 to a1 degrees, counter-clockwise. */
const Sector = (r0, r1, a0, a1, step) => [...Arc(r1, a0, a1, step), ...Arc(r0, a1, a0, step)];
/** A flat marking just above a surface at height z: only its face (it's too thin for sides to show). */
const Inlay = (mesh, shapes, z, raise, part) => mesh.Cap(shapes, z + raise, part, "z");
/** A rectangle from (x0, y0) to (x1, y1), counter-clockwise. */
const Rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** Riser k's radius (0: the deck's edge) and the height of its top. */
const Riser = k => ({ r: DECK_RADIUS + k * STEP_TREAD, top: STAGE_HEIGHT - k * STEP_RISE });

function BuildDeck(mesh, physics) {
    mesh.Extrude(Shape(Circle(0, 0, DECK_RADIUS, 360 / ARC_STEP)), 0, STAGE_HEIGHT, "deck", "z");
    Inlay(mesh, Shape(Circle(0, 0, INLAY.radius + INLAY.width / 2, 360 / ARC_STEP), [Circle(0, 0, INLAY.radius - INLAY.width / 2, 360 / ARC_STEP)]), STAGE_HEIGHT, INLAY.raise, "dark");
    physics.Extrude(Shape(Circle(0, 0, DECK_RADIUS, 360 / PHYSICS_ARC_STEP)), 0, STAGE_HEIGHT, "deck", "z");
    // The checkered ring: every other tile dark, the rows offset by one.
    const tile = 360 / CHECKER.tiles;
    for (let row = 0; row < CHECKER.rows; row++) {
        const r1 = CHECKER.outer - row * CHECKER.depth, r0 = r1 - CHECKER.depth;
        for (let i = row % 2; i < CHECKER.tiles; i += 2) {
            Inlay(mesh, Shape(Sector(r0, r1, i * tile, (i + 1) * tile, tile)), STAGE_HEIGHT, CHECKER.raise, "dark");
        }
    }
    // The panel joints: rings, and spokes between them (none inside the first ring).
    const w = JOINT.width / 2;
    for (const r of JOINT.rings) {
        Inlay(mesh, Shape(Circle(0, 0, r + w, 360 / JOINT.arcStep), [Circle(0, 0, r - w, 360 / JOINT.arcStep)]), STAGE_HEIGHT, JOINT.raise, "dark");
    }
    const spokeEnd = CHECKER.outer - CHECKER.rows * CHECKER.depth;
    for (let a = 0; a < 360; a += JOINT.spoke) {
        const [c, s] = [Math.cos(Rad(a)), Math.sin(Rad(a))];
        const r0 = JOINT.rings[0], r1 = spokeEnd;
        Inlay(mesh, Shape([[r0 * c + w * s, r0 * s - w * c], [r1 * c + w * s, r1 * s - w * c], [r1 * c - w * s, r1 * s + w * c], [r0 * c - w * s, r0 * s + w * c]]), STAGE_HEIGHT, JOINT.raise, "dark");
    }
}

/** One quarter's steps (0 to 90 degrees): each a solid ring sector from the floor to its top. */
function BuildSteps(mesh, physics) {
    for (let k = 1; k < STEP_COUNT; k++) {
        const inner = Riser(k - 1).r - 1, { r, top } = Riser(k); // a unit into the step above: no gap
        mesh.Extrude(Shape(Sector(inner, r, 0, 90, ARC_STEP)), 0, top, "deck", "z");
        physics.Extrude(Shape(Sector(inner, r, 0, 90, PHYSICS_ARC_STEP)), 0, top, "deck", "z");
    }
    // Anti-slip strips along every edge, the deck's included.
    for (let k = 0; k < STEP_COUNT; k++) {
        const { r, top } = Riser(k), r1 = r - NOSING.inset;
        Inlay(mesh, Shape(Sector(r1 - NOSING.width, r1, 0, 90, NOSING.arcStep)), top, NOSING.raise, "dark");
    }
}

/** An LED rod along `points` (x, y) at height z. */
const Led = (mesh, points, z) => mesh.Tube(points.map(([x, y]) => [x, y, z]), LED.radius, LED.sides, "light", false);

/** One quarter's LED strips: along the top of every riser, the deck's edge included. */
function BuildStepLights(mesh) {
    for (let k = 0; k < STEP_COUNT; k++) {
        const { r, top } = Riser(k);
        Led(mesh, Arc(r + LED.out, 0, 90, LED.arcStep), top - LED.below);
    }
}

/** The platform at +X: a block at deck height over the steps, then its own steps down at its front. */
function BuildThrust(mesh, physics) {
    const half = THRUST_WIDTH / 2, end = OUTER_RADIUS + THRUST_REACH;
    // Its inner end follows the deck's edge: no surface lies on top of the deck's (they'd flicker).
    const a = (Math.asin(half / DECK_RADIUS) * 180) / Math.PI;
    const outline = [[end, -half], [end, half], ...Arc(DECK_RADIUS, a, -a, ARC_STEP)];
    for (const m of [mesh, physics]) m.Extrude(Shape(outline), 0, STAGE_HEIGHT, "deck", "z");
    for (let k = 1; k < STEP_COUNT; k++) {
        const x0 = end + (k - 1) * STEP_TREAD - 1, x1 = end + k * STEP_TREAD, top = STAGE_HEIGHT - k * STEP_RISE;
        for (const m of [mesh, physics]) m.Extrude(Shape(Rect(x0, -half, x1, half)), 0, top, "deck", "z");
    }
    // Anti-slip strips along its front edges.
    for (let k = 0; k < STEP_COUNT; k++) {
        const x1 = end + k * STEP_TREAD - NOSING.inset, top = STAGE_HEIGHT - k * STEP_RISE;
        Inlay(mesh, Shape(Rect(x1 - NOSING.width, -half, x1, half)), top, NOSING.raise, "dark");
    }
    // Bollards at the front corners.
    for (const s of [-1, 1]) {
        const x = end - BOLLARD.inset, y = s * (half - BOLLARD.inset);
        mesh.Tube([[x, y, STAGE_HEIGHT - 0.5], [x, y, STAGE_HEIGHT + BOLLARD.height]], BOLLARD.radius, BOLLARD.sides, "dark");
        physics.Tube([[x, y, STAGE_HEIGHT], [x, y, STAGE_HEIGHT + BOLLARD.height + BOLLARD.cap]], BOLLARD.radius, 8, "deck");
    }
}

/** The platform's LED strips: its front risers, and its sides along the top from the deck's edge out. */
function BuildThrustLights(mesh) {
    const half = THRUST_WIDTH / 2, end = OUTER_RADIUS + THRUST_REACH;
    for (let k = 0; k < STEP_COUNT; k++) {
        const x = end + k * STEP_TREAD + LED.out, z = STAGE_HEIGHT - k * STEP_RISE - LED.below;
        Led(mesh, [[x, -half], [x, half]], z);
    }
    // Along the sides: from where they come out of the deck to the front.
    const from = Math.sqrt(DECK_RADIUS ** 2 - half ** 2);
    for (const s of [-1, 1]) Led(mesh, [[from, s * (half + LED.out)], [end, s * (half + LED.out)]], STAGE_HEIGHT - LED.below);
    // The bollards' glowing caps.
    for (const s of [-1, 1]) {
        const x = end - BOLLARD.inset, y = s * (half - BOLLARD.inset), z = STAGE_HEIGHT + BOLLARD.height;
        mesh.Tube([[x, y, z - 0.2], [x, y, z + BOLLARD.cap]], BOLLARD.radius + 0.4, BOLLARD.sides, "light");
    }
}

/** The backdrop platform: a block at deck height, panel joints, its steps down across the whole front (+X). */
function BuildPlatform(mesh, physics) {
    const hx = PLATFORM.depth / 2, hy = PLATFORM.width / 2;
    for (const m of [mesh, physics]) m.Extrude(Shape(Rect(-hx, -hy, hx, hy)), 0, STAGE_HEIGHT, "deck", "z");
    for (let k = 1; k < STEP_COUNT; k++) {
        const x0 = hx + (k - 1) * STEP_TREAD - 1, x1 = hx + k * STEP_TREAD, top = STAGE_HEIGHT - k * STEP_RISE;
        for (const m of [mesh, physics]) m.Extrude(Shape(Rect(x0, -hy, x1, hy)), 0, top, "deck", "z");
    }
    // Anti-slip strips along its front edges.
    for (let k = 0; k < STEP_COUNT; k++) {
        const x1 = hx + k * STEP_TREAD - NOSING.inset, top = STAGE_HEIGHT - k * STEP_RISE;
        Inlay(mesh, Shape(Rect(x1 - NOSING.width, -hy, x1, hy)), top, NOSING.raise, "dark");
    }
    // The panel joints: a grid, none on the edges, stopping short of the front's anti-slip strip.
    const w = JOINT.width / 2, front = hx - NOSING.inset - NOSING.width - 4;
    for (let x = -hx + PLATFORM.grid; x < front; x += PLATFORM.grid) Inlay(mesh, Shape(Rect(x - w, -hy, x + w, hy)), STAGE_HEIGHT, JOINT.raise, "dark");
    for (let y = -hy + PLATFORM.grid; y < hy; y += PLATFORM.grid) Inlay(mesh, Shape(Rect(-hx, y - w, front, y + w)), STAGE_HEIGHT, JOINT.raise, "dark");
}

/** The backdrop platform's LED strips: its front risers, and along both sides' top edge. */
function BuildPlatformLights(mesh) {
    const hx = PLATFORM.depth / 2, hy = PLATFORM.width / 2;
    for (let k = 0; k < STEP_COUNT; k++) {
        const x = hx + k * STEP_TREAD + LED.out, z = STAGE_HEIGHT - k * STEP_RISE - LED.below;
        Led(mesh, [[x, -hy], [x, hy]], z);
    }
    for (const s of [-1, 1]) Led(mesh, [[-hx, s * (hy + LED.out)], [hx, s * (hy + LED.out)]], STAGE_HEIGHT - LED.below);
}

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const PIECES = [
    { piece: "deck", solid: true, Build: BuildDeck, count: 1, place: "" },
    { piece: "steps", solid: true, Build: BuildSteps, count: 4, place: "yaw 0 / 90 / 180 / 270" },
    { piece: "step_lights", Build: BuildStepLights, count: 4, place: "yaw 0 / 90 / 180 / 270" },
    { piece: "thrust", solid: true, Build: BuildThrust, count: 4, place: "yaw 0 / 90 / 180 / 270" },
    { piece: "thrust_lights", Build: BuildThrustLights, count: 4, place: "yaw 0 / 90 / 180 / 270" },
    { piece: "platform", solid: true, Build: BuildPlatform, count: 1, place: "the backdrop, its own origin" },
    { piece: "platform_lights", Build: BuildPlatformLights, count: 1, place: "the backdrop, its own origin" },
];

let total = 0;
for (const { piece, solid, Build, count, place } of PIECES) {
    const mesh = new Mesh(64);
    const physics = new Mesh();
    Build(mesh, physics);
    const name = `${NAME}_${piece}`;
    const obj = `${MODEL_DIR}/${name}.obj`;
    const physicsObj = solid ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    if (solid) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    total += count * mesh.triangleCount;
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles${solid ? ` (collision ${physics.triangleCount})` : ""} — ${count}x${place ? `, ${place}` : ""}`);
}
for (const [part, { rgb, tint, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint, glow }));
}
console.log(`all placed: ${total} triangles; deck radius ${DECK_RADIUS}, ${STAGE_HEIGHT} high (place the pavilion's pieces that much higher), `
    + `steps out to ${OUTER_RADIUS}, the platforms out to ${OUTER_RADIUS + THRUST_REACH + (STEP_COUNT - 1) * STEP_TREAD} at +-X / +-Y, ${THRUST_WIDTH} wide`);
console.log(`backdrop platform: ${PLATFORM.depth} x ${PLATFORM.width}, ${STAGE_HEIGHT} high (raise what stands on it that much), `
    + `its steps out to x = ${PLATFORM.depth / 2 + (STEP_COUNT - 1) * STEP_TREAD} from its origin (the deck's middle)`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<piece>.vmdl"`);
