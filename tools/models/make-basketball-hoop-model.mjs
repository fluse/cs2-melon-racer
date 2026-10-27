// Generates a basketball hoop for a court — `node tools/models/make-basketball-hoop-model.mjs`:
// an outdoor hoop on a graphite steel post (a square foot plate, a navy pad
// round its foot), bent forward into a gooseneck with a diagonal brace, a
// white backboard with a black frame and the shooter's square, an orange rim
// on a bracket, a white cord net hanging from it in diamonds. Sized to the
// melon as the ball (the melon ~14 across is a basketball's 24 cm): the rim
// a real 3.05 m up, wide enough for a melon to drop through. Writes
//   models/melon_racer/basketball_hoop/basketball_hoop.obj           render mesh
//   models/melon_racer/basketball_hoop/basketball_hoop_physics.obj   collision: post, arm, board, rim —
//                                                                     coarser, no net (a melon drops through it)
//   models/melon_racer/basketball_hoop/basketball_hoop.vmdl
//   materials/melon_racer/basketball_hoop/basketball_hoop_{steel,pad,board,line,rim,net}.vmat (+ _color.png)
// Compile the .vmdl with resourcecompiler (see the end of the output). Origin
// on the floor in the middle of the post; the hoop faces +X, the board along Y.
import { ChamferedRect, Mesh, ObjText, Shape, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; 14 units = 24 cm, so 1 m = ~58 units) ---
const RIM_HEIGHT = 178; // 3.05 m: out of a ground jump's reach (~85), a jump pad or wall jumps get there
const RIM_RADIUS = 13; // to the rim tube's center: 26 across inside, the melon (~14) drops through
const RIM_TUBE = 0.8;
const RIM_GAP = 9; // board front to the rim's inner edge (15 cm)
const BOARD_WIDTH = 107; // along Y (1.83 m)
const BOARD_HEIGHT = 62; // 1.07 m
const BOARD_BOTTOM = RIM_HEIGHT - 9; // the rim 15 cm above the board's lower edge
const BOARD_THICKNESS = 2;
const BOARD_X = 70; // the board's back face, in front of the post (the overhang)
const FRAME_BAND = 3; // the black frame round the board's front
const SQUARE_WIDTH = 34; // the shooter's square (59 x 45 cm), its lower edge level with the rim
const SQUARE_HEIGHT = 26;
const SQUARE_BAND = 2;
const LINE_LIFT = 0.2; // how far the lines stand off the board
const POST_RADIUS = 4;
const ARM_Z = BOARD_BOTTOM + BOARD_HEIGHT / 2; // the gooseneck meets the board's middle
const ARM_BEND = 18; // radius of the bend from the post into the arm
const BRACE_FROM_Z = 120; // the diagonal brace from the post up to the board's back
const BRACE_RADIUS = 2;
const FOOT_SIZE = 26; // square plate on the floor
const FOOT_THICKNESS = 2;
const PAD_RADIUS = 6.5; // the safety pad round the post's foot
const PAD_HEIGHT = 60;
const NET_DEPTH = 26; // how far the net hangs below the rim
const NET_BOTTOM_RADIUS = 8; // narrower at the bottom, still wider than half a melon
const NET_CORD = 0.35;

// --- tessellation: as low as still reads round ---
const POST_SIDES = 10;
const ARM_BEND_STEPS = 5;
const RIM_SEGMENTS = 16; // around the rim
const RIM_SIDES = 6;
const NET_LOOPS = 12; // cords hanging from the rim (12 hooks)
const NET_ROWS = 3; // diamond rows down
const NET_SIDES = 3;
const PHYSICS_POST_SIDES = 6;
const PHYSICS_RIM_SEGMENTS = 10;
const PHYSICS_RIM_SIDES = 4;

// --- look: a court hoop (off-palette on purpose: a real thing) ---
const STEEL_COLOR = [0x3a, 0x3e, 0x44]; // graphite post, arm, bracket
const PAD_COLOR = [0x1e, 0x3a, 0x8a]; // navy pad
const BOARD_COLOR = [0xf4, 0xf4, 0xf0]; // white board
const LINE_COLOR = [0x22, 0x25, 0x2a]; // black frame and square
const RIM_COLOR = [0xf2, 0x6b, 0x1d]; // rim orange
const NET_COLOR = [0xf2, 0xf2, 0xee]; // white cords

const NAME = "basketball_hoop";
const MODEL_DIR = "models/melon_racer/basketball_hoop";
const MATERIAL_DIR = "materials/melon_racer/basketball_hoop";
const GENERATOR = "tools/models/make-basketball-hoop-model.mjs";

const RIM_X = BOARD_X + BOARD_THICKNESS + RIM_GAP + RIM_RADIUS;

/** A closed ring of points around (cx, cy) at height z, the first one repeated at the end (for Mesh.Tube). */
function Ring(cx, cy, z, radius, segments, start = 0) {
    return Array.from({ length: segments + 1 }, (_, i) => {
        const a = start + (2 * Math.PI * i) / segments;
        return [cx + radius * Math.cos(a), cy + radius * Math.sin(a), z];
    });
}

/** The post's centerline: straight up, bent forward (ARM_BEND, `steps` points) into the arm to the board's back. */
function PostLine(steps) {
    const points = [[0, 0, 0], [0, 0, ARM_Z - ARM_BEND]];
    for (let s = 1; s < steps; s++) {
        const a = (Math.PI / 2) * (s / steps);
        points.push([ARM_BEND * (1 - Math.cos(a)), 0, ARM_Z - ARM_BEND + ARM_BEND * Math.sin(a)]);
    }
    points.push([ARM_BEND, 0, ARM_Z], [BOARD_X, 0, ARM_Z]);
    return points;
}

/** A rectangle outline in the "x" axis' 2D plane (y, z), as a frame `band` wide (a hole inside). */
function Frame(cy, cz, w, h, band) {
    const Rect = (rw, rh) => [[cy - rw / 2, cz - rh / 2], [cy + rw / 2, cz - rh / 2], [cy + rw / 2, cz + rh / 2], [cy - rw / 2, cz + rh / 2]];
    return Shape(Rect(w, h), [Rect(w - 2 * band, h - 2 * band)]);
}

/** The render mesh (detailed) or the collision mesh (`physics`). */
function Build(physics) {
    const mesh = new Mesh(64);
    const postSides = physics ? PHYSICS_POST_SIDES : POST_SIDES;

    // Foot plate, post with its gooseneck, the brace, the pad round the foot.
    mesh.Extrude(Shape(ChamferedRect(0, 0, FOOT_SIZE, FOOT_SIZE, physics ? 0 : 2)), 0, FOOT_THICKNESS, "steel", "z");
    mesh.Tube(PostLine(physics ? 2 : ARM_BEND_STEPS), POST_RADIUS, postSides, "steel");
    mesh.Tube([[0, 0, BRACE_FROM_Z], [BOARD_X, 0, BOARD_BOTTOM + 6]], BRACE_RADIUS, physics ? 4 : 6, "steel");
    if (!physics) {
        mesh.Tube([[0, 0, FOOT_THICKNESS], [0, 0, PAD_HEIGHT]], PAD_RADIUS, POST_SIDES, "pad");
        // The mount plate on the board's back, where arm and brace meet it.
        mesh.Extrude(Shape(ChamferedRect(0, BOARD_BOTTOM + BOARD_HEIGHT / 2, 24, BOARD_HEIGHT - 12, 2)), BOARD_X - 1.5, BOARD_X, "steel", "x");
    }

    // The backboard, along Y: white, a black frame round its front and back, the shooter's square in front.
    const boardZ = BOARD_BOTTOM + BOARD_HEIGHT / 2;
    mesh.Extrude(Shape(ChamferedRect(0, boardZ, BOARD_WIDTH, BOARD_HEIGHT, physics ? 0 : 1)), BOARD_X, BOARD_X + BOARD_THICKNESS, "board", "x");
    if (!physics) {
        const front = BOARD_X + BOARD_THICKNESS + LINE_LIFT;
        mesh.Cap(Frame(0, boardZ, BOARD_WIDTH - 1, BOARD_HEIGHT - 1, FRAME_BAND), front, "line", "x", 1);
        mesh.Cap(Frame(0, boardZ, BOARD_WIDTH - 1, BOARD_HEIGHT - 1, FRAME_BAND), BOARD_X - LINE_LIFT, "line", "x", -1);
        mesh.Cap(Frame(0, RIM_HEIGHT + SQUARE_HEIGHT / 2, SQUARE_WIDTH, SQUARE_HEIGHT, SQUARE_BAND), front, "line", "x", 1);
    }

    // The rim on its bracket: a plate on the board, two struts under the rim's back.
    mesh.Tube(Ring(RIM_X, 0, RIM_HEIGHT, RIM_RADIUS, physics ? PHYSICS_RIM_SEGMENTS : RIM_SEGMENTS), physics ? 1.5 : RIM_TUBE, physics ? PHYSICS_RIM_SIDES : RIM_SIDES, "rim", false);
    const boardFront = BOARD_X + BOARD_THICKNESS;
    if (!physics) mesh.Extrude(Shape(ChamferedRect(0, RIM_HEIGHT - 3, 12, 9, 1)), boardFront, boardFront + 1, "rim", "x");
    for (const y of [-3.5, 3.5]) {
        const back = [RIM_X - RIM_RADIUS + 0.5, y, RIM_HEIGHT];
        mesh.Tube([[boardFront + 0.5, y, RIM_HEIGHT], back], 0.8, 4, "rim");
        if (!physics) mesh.Tube([[boardFront + 0.5, y, RIM_HEIGHT - 6], back], 0.6, 4, "rim");
    }
    if (physics) return mesh;

    // The net: cords in diamonds, each hook on the rim splitting down to its two
    // neighbours' halfway points, row by row, narrowing to NET_BOTTOM_RADIUS.
    const NetPoint = (row, k) => {
        const t = row / NET_ROWS;
        const r = RIM_RADIUS + (NET_BOTTOM_RADIUS - RIM_RADIUS) * t;
        const a = (2 * Math.PI * (k + (row % 2) / 2)) / NET_LOOPS;
        return [RIM_X + r * Math.cos(a), r * Math.sin(a), RIM_HEIGHT - RIM_TUBE - NET_DEPTH * t];
    };
    for (let row = 0; row < NET_ROWS; row++) {
        for (let k = 0; k < NET_LOOPS; k++) {
            const top = NetPoint(row, k);
            // Odd rows are offset half a loop: their points sit between the row above's.
            const left = NetPoint(row + 1, row % 2 ? k : k - 1), right = NetPoint(row + 1, row % 2 ? k + 1 : k);
            for (const bottom of [left, right]) {
                const mid = V3.Scale(V3.Add(top, bottom), 0.5);
                mesh.Tube([top, V3.Add(mid, [0, 0, -0.6]), bottom], NET_CORD, NET_SIDES, "net", false); // sagging a little
            }
        }
    }
    // The cord round the bottom.
    mesh.Tube(Ring(RIM_X, 0, RIM_HEIGHT - RIM_TUBE - NET_DEPTH, NET_BOTTOM_RADIUS, NET_LOOPS, (Math.PI * (NET_ROWS % 2)) / NET_LOOPS), NET_CORD, NET_SIDES, "net", false);
    return mesh;
}

const render = Build(false);
const physics = Build(true);
const obj = `${MODEL_DIR}/${NAME}.obj`;
const physicsObj = `${MODEL_DIR}/${NAME}_physics.obj`;
const parts = ["steel", "pad", "board", "line", "rim", "net"];
const materials = Object.fromEntries(parts.map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(obj, ObjText(render, NAME, GENERATOR));
WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials, surfaceProp: "metal" }));
for (const [part, rgb, options] of [
    ["steel", STEEL_COLOR, { metalness: 0.6 }],
    ["pad", PAD_COLOR, {}],
    ["board", BOARD_COLOR, {}],
    ["line", LINE_COLOR, {}],
    ["rim", RIM_COLOR, { metalness: 0.4 }],
    ["net", NET_COLOR, {}],
]) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...options }));
}
const height = BOARD_BOTTOM + BOARD_HEIGHT;
console.log(`${render.triangleCount} triangles (collision ${physics.triangleCount}), ${BOARD_WIDTH} wide, ${height} high`);
console.log(`rim center: ${RIM_X} forward (+X) of the origin, ${RIM_HEIGHT} up; ${2 * (RIM_RADIUS - RIM_TUBE)} across inside`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
