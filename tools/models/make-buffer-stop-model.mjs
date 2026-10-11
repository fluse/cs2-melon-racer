// Generates a buffer stop (Prellbock) — `node tools/models/make-buffer-stop-model.mjs`:
// a chunky magenta beam with a cream top and a white chevron front and back, two
// round buffers sticking out of its front, standing on two bent grey steel
// legs (each an upside-down V with flat feet, like a sawhorse) joined by a
// crossbar at each foot. A track obstacle: the beam is a wall like any other
// (bounces, wall jumps). Writes
//   models/melon_racer/buffer_stop/buffer_stop.obj           render mesh
//   models/melon_racer/buffer_stop/buffer_stop_physics.obj   collision: beam, buffers, legs, crossbars —
//                                                             coarser (no chevrons, fewer sides and bend steps)
//   models/melon_racer/buffer_stop/buffer_stop.vmdl
//   materials/melon_racer/buffer_stop/buffer_stop_{beam,rim,stripe,steel,plate}.vmat (+ _color.png)
// Compile the .vmdl with resourcecompiler (see the end of the output). Origin
// on the floor in the middle; the beam runs along Y, the buffers face +X.
import { ChamferedRect, Circle, Mesh, ObjText, Shape, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the melon is ~14 across) ---
const BEAM_LENGTH = 104; // along Y
const BEAM_HEIGHT = 22;
const BEAM_DEPTH = 18; // along X
const BEAM_BOTTOM = 34;
const BEAM_CHAMFER = 4;
const RIM_HEIGHT = 4; // the cream layer on top of the beam
const CHEVRON_HALF_WIDTH = 22; // the white "^", half its span along the beam
const CHEVRON_BAND = 7; // its arms' thickness (vertical)
const CHEVRON_LIFT = 0.3; // how far it stands off the beam's face
const BUFFER_Y = 34; // buffer centers, ±
const BUFFER_SHAFT_RADIUS = 3.5;
const BUFFER_SHAFT_LENGTH = 9;
const BUFFER_PLATE_RADIUS = 7.5;
const BUFFER_PLATE_THICKNESS = 3;
const BUFFER_FLANGE = 13; // the square mount on the beam's face
const LEG_Y = 40; // leg centers, ±
const LEG_WIDTH = 6; // along Y
const LEG_THICKNESS = 5; // the bar's thickness in its own profile
const LEG_FOOT_X = 46; // the feet's outer ends, ±
const LEG_FOOT_LENGTH = 14; // flat on the floor
const CROSSBAR_SIZE = 5;

// --- tessellation: as low as still reads round ---
const BUFFER_SIDES = 12; // 30° steps: still smooth-shaded (model.mjs hardens above 35°)
const BEND_STEPS = 3; // points around each bend of a leg
const PHYSICS_BUFFER_SIDES = 6;
const PHYSICS_BEND_STEPS = 1;

// --- look: magenta/white, the spike spring's rim color (off-palette on purpose: an obstacle, not a start gate) ---
const BEAM_COLOR = [0xff, 0x20, 0xff]; // #FF20FF
const RIM_COLOR = [0xf4, 0xe6, 0xc8]; // cream
const STRIPE_COLOR = [0xf6, 0xf6, 0xf2]; // white
const STEEL_COLOR = [0x8c, 0x92, 0x9a]; // legs, buffer shafts
const PLATE_COLOR = [0x5a, 0x60, 0x68]; // buffer plates and flanges, darker

const NAME = "buffer_stop";
const MODEL_DIR = "models/melon_racer/buffer_stop";
const MATERIAL_DIR = "materials/melon_racer/buffer_stop";
const GENERATOR = "tools/models/make-buffer-stop-model.mjs";

/**
 * A bar of `thickness` along a centerline (x, z points), its corners rounded
 * with `bendSteps` points each, as an outline in the "y" axis' 2D plane (z, x).
 */
function BarOutline(points, thickness, bendRadius, bendSteps) {
    // Round every inner corner: replace it by an arc from one leg to the next.
    const path = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const [p, c, n] = [points[i - 1], points[i], points[i + 1]];
        const d1 = Unit([c[0] - p[0], c[1] - p[1]]), d2 = Unit([n[0] - c[0], n[1] - c[1]]);
        const a = [c[0] - d1[0] * bendRadius, c[1] - d1[1] * bendRadius];
        const b = [c[0] + d2[0] * bendRadius, c[1] + d2[1] * bendRadius];
        // A quadratic curve a -> c -> b: close enough to an arc for a bar's bend.
        for (let s = 0; s <= bendSteps + 1; s++) {
            const t = s / (bendSteps + 1);
            path.push([0, 1].map(k => (1 - t) ** 2 * a[k] + 2 * (1 - t) * t * c[k] + t ** 2 * b[k]));
        }
    }
    path.push(points.at(-1));
    // Offset both ways along the averaged normal (mitered, kept to its thickness).
    const left = [], right = [];
    path.forEach((p, i) => {
        const prev = path[Math.max(i - 1, 0)], next = path[Math.min(i + 1, path.length - 1)];
        const d = Unit([next[0] - prev[0], next[1] - prev[1]]);
        const n = [-d[1], d[0]];
        left.push([p[0] + (n[0] * thickness) / 2, p[1] + (n[1] * thickness) / 2]);
        right.push([p[0] - (n[0] * thickness) / 2, p[1] - (n[1] * thickness) / 2]);
    });
    return [...left, ...right.reverse()].map(([x, z]) => [z, x]);
}

function Unit([x, y]) {
    const len = Math.hypot(x, y);
    return [x / len, y / len];
}

/** The render mesh (detailed) or the collision mesh (`physics`). */
function Build(physics) {
    const mesh = new Mesh(64);
    const sides = physics ? PHYSICS_BUFFER_SIDES : BUFFER_SIDES;
    const bendSteps = physics ? PHYSICS_BEND_STEPS : BEND_STEPS;
    const half = BEAM_LENGTH / 2;

    // The beam, along Y: its profile in (z, x), the cream rim stacked on top.
    const beamZ = BEAM_BOTTOM + BEAM_HEIGHT / 2;
    mesh.Extrude(Shape(ChamferedRect(beamZ, 0, BEAM_HEIGHT, BEAM_DEPTH, physics ? 0 : BEAM_CHAMFER)), -half, half, "beam", "y");
    const rimZ = BEAM_BOTTOM + BEAM_HEIGHT + RIM_HEIGHT / 2 - 0.5; // overlaps the beam's chamfer
    mesh.Extrude(Shape(ChamferedRect(rimZ, 0, RIM_HEIGHT + 1, BEAM_DEPTH - 2, physics ? 0 : 1.5)), -(half - 2), half - 2, "rim", "y");

    // The white chevron, front and back: a "^" on the beam's face, in (y, z).
    if (!physics) {
        const top = BEAM_BOTTOM + BEAM_HEIGHT - 3, bottom = BEAM_BOTTOM + 3;
        const chevron = Shape([
            [-CHEVRON_HALF_WIDTH, bottom], [0, top - CHEVRON_BAND], [CHEVRON_HALF_WIDTH, bottom],
            [CHEVRON_HALF_WIDTH, bottom + CHEVRON_BAND], [0, top], [-CHEVRON_HALF_WIDTH, bottom + CHEVRON_BAND],
        ]);
        const face = BEAM_DEPTH / 2 + CHEVRON_LIFT;
        mesh.Cap(chevron, face, "stripe", "x", 1);
        mesh.Cap(chevron, -face, "stripe", "x", -1);
    }

    // Buffers on the front face, along X: flange, shaft, plate.
    const front = BEAM_DEPTH / 2;
    for (const y of [-BUFFER_Y, BUFFER_Y]) {
        if (!physics) mesh.Extrude(Shape(ChamferedRect(y, beamZ, BUFFER_FLANGE, BUFFER_FLANGE, 2.5)), front - 0.5, front + 1.5, "plate", "x");
        mesh.Extrude(Shape(Circle(y, beamZ, BUFFER_SHAFT_RADIUS, sides)), front, front + BUFFER_SHAFT_LENGTH, "steel", "x");
        const plate = front + BUFFER_SHAFT_LENGTH;
        mesh.Extrude(Shape(Circle(y, beamZ, BUFFER_PLATE_RADIUS, sides)), plate, plate + BUFFER_PLATE_THICKNESS, "plate", "x");
    }

    // Legs: an upside-down V with flat feet, centerline in (x, z), under the beam.
    const t = LEG_THICKNESS / 2;
    const footInner = LEG_FOOT_X - LEG_FOOT_LENGTH;
    const legTop = BEAM_BOTTOM + t - 1; // tucked into the beam
    const leg = BarOutline([
        [LEG_FOOT_X, t], [footInner, t], [BEAM_DEPTH / 2 - 2, legTop],
        [-(BEAM_DEPTH / 2 - 2), legTop], [-footInner, t], [-LEG_FOOT_X, t],
    ], LEG_THICKNESS, 6, bendSteps);
    for (const y of [-LEG_Y, LEG_Y]) {
        mesh.Extrude(Shape(leg), y - LEG_WIDTH / 2, y + LEG_WIDTH / 2, "steel", "y");
    }
    // Crossbars between the two legs, on the feet.
    for (const x of [footInner + LEG_FOOT_LENGTH / 2, -(footInner + LEG_FOOT_LENGTH / 2)]) {
        mesh.Extrude(Shape(ChamferedRect(LEG_THICKNESS + CROSSBAR_SIZE / 2, x, CROSSBAR_SIZE, CROSSBAR_SIZE, physics ? 0 : 1)), -(LEG_Y - LEG_WIDTH / 2), LEG_Y - LEG_WIDTH / 2, "steel", "y");
    }
    return mesh;
}

const render = Build(false);
const physics = Build(true);
const obj = `${MODEL_DIR}/${NAME}.obj`;
const physicsObj = `${MODEL_DIR}/${NAME}_physics.obj`;
const parts = ["beam", "rim", "stripe", "steel", "plate"];
const materials = Object.fromEntries(parts.map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(obj, ObjText(render, NAME, GENERATOR));
WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials }));
for (const [part, rgb, options] of [
    ["beam", BEAM_COLOR, {}],
    ["rim", RIM_COLOR, {}],
    ["stripe", STRIPE_COLOR, {}],
    ["steel", STEEL_COLOR, { metalness: 0.6 }],
    ["plate", PLATE_COLOR, { metalness: 0.6 }],
]) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...options }));
}
const height = BEAM_BOTTOM + BEAM_HEIGHT + RIM_HEIGHT;
const depth = 2 * LEG_FOOT_X;
console.log(`${render.triangleCount} triangles (collision ${physics.triangleCount}), ${BEAM_LENGTH} wide, ${depth} deep, ${height} high`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
