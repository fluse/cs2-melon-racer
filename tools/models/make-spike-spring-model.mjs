// Generates a spike spring trap — `node tools/models/make-spike-spring-model.mjs`:
// a square shaft sunk into the floor with a signal red rim around it; down in
// it a steel plate of spikes on a chrome coil spring. Again and again the
// plate shoots up out of the floor, bounces on its spring and sinks back.
// The spring is skinned between the shaft's bottom and the plate, so it
// really stretches and compresses. Animations:
//   cycle   looping: down DOWN_SECONDS, rise, up UP_SECONDS, sink (CycleSeconds() in total)
//   rise    down -> up: pops out, overshoots, wobbles out (RISE_SECONDS)
//   sink    up -> down (SINK_SECONDS)
//   up, down   held (one frame each)
// In the map the script runs it: a prop_dynamic named "spike_spring..."
// (docs/mapping-api/18-spike-springs.md) gets rise/sink on its clock and breaks
// the melons on its spikes — "cycle" is only for a decoration nobody can
// touch. No collision at all: melons drive over it as if it weren't there
// (the script does the hurting). A SHAFT_SIZE square hole under it shows the
// shaft — but then nothing covers the hole, so close it with a nodraw brush
// level with the floor or melons fall in.
// Writes
//   models/melon_racer/spike_spring/spike_spring.smd           render mesh + skeleton (bind pose: up)
//   models/melon_racer/spike_spring/spike_spring_<animation>.smd
//   models/melon_racer/spike_spring/spike_spring.vmdl
//   materials/melon_racer/spike_spring/spike_spring_{spike,plate,spring,rim,shaft}.vmat (+ _color.png)
// Compile the .vmdl with resourcecompiler (see the end of the output). Origin
// on the floor in the middle of the shaft.
import { BindFrame, ChamferedRect, Helix, Mesh, MeshSmdTriangles, Shape, SmdAnimationText, SmdText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";
// The timing the script plays the animations on (world/spike-spring/): shared, so they fit.
import {
    SPIKE_SPRING_DOWN_SECONDS as DOWN_SECONDS, SPIKE_SPRING_UP_SECONDS as UP_SECONDS, SPIKE_SPRING_POP_SECONDS as POP_SECONDS,
    SPIKE_SPRING_RISE_SECONDS as RISE_SECONDS, SPIKE_SPRING_SINK_SECONDS as SINK_SECONDS,
} from "../../src/melon_drive/world/spike-spring/constants.js";

// --- shape (units; the melon is ~14 across) ---
const SHAFT_SIZE = 32; // inside, square: the hole the floor needs
const SHAFT_DEPTH = 30;
const SHAFT_WALL = 2;
const RIM_WIDTH = 4; // the red frame on the floor around the shaft
const RIM_HEIGHT = 1.5;
const PLATE_SIZE = 29;
const PLATE_THICKNESS = 3;
const PLATE_CHAMFER = 2.5;
const SPIKE_GRID = 3; // spikes per row and column
const SPIKE_SPACING = 9;
const SPIKE_RADIUS = 3.2;
const SPIKE_HEIGHT = 10;
const UP_PLATE_BOTTOM = 22; // the plate's underside when it's up
const DOWN_TIP = -1.5; // the spike tips when it's down: just under the floor
const SPRING_RADIUS = 10; // helix, to the wire's center
const WIRE_RADIUS = 1.1;
const SPRING_TURNS = 6; // compressed it needs > 2 * WIRE_RADIUS * SPRING_TURNS of height
const TRAVEL = UP_PLATE_BOTTOM + PLATE_THICKNESS + SPIKE_HEIGHT - DOWN_TIP; // how far the plate moves
const SPRING_BOTTOM = -SHAFT_DEPTH + WIRE_RADIUS;

// --- animation ---
const FPS = 30;
const OVERSHOOT = 5; // first bounce above the up position
const BOUNCE_HZ = 4;
const BOUNCE_DAMPING = 6; // 1/s
const TILT_DEGREES = 5; // the plate rocks a little while bouncing
const TILT_HZ = 3.1;

// --- tessellation: as low as still reads round ---
const SPIKE_SIDES = 6;
const WIRE_SIDES = 6;
const SPRING_STEPS_PER_TURN = 14;

// --- look: steel spikes, a magenta rim (off-palette on purpose: a hazard, not a start gate) ---
const SPIKE_COLOR = [0xc8, 0xcc, 0xd2]; // polished steel
const PLATE_COLOR = [0x4a, 0x4e, 0x56];
const SPRING_COLOR = [0xd8, 0xdc, 0xe0]; // chrome
const RIM_COLOR = [0xff, 0x20, 0xff]; // #FF20FF
const SHAFT_COLOR = [0x22, 0x24, 0x28]; // dark, so the hole reads as deep

const NAME = "spike_spring";
const MODEL_DIR = "models/melon_racer/spike_spring";
const MATERIAL_DIR = "materials/melon_racer/spike_spring";
const GENERATOR = "tools/models/make-spike-spring-model.mjs";
const PARTS = ["spike", "plate", "spring", "rim", "shaft"];

// --- skeleton: the root (shaft, rim) and the plate, its origin under the plate's middle ---
const BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    { name: "plate", parent: 0, bind: [0, 0, UP_PLATE_BOTTOM] },
];
const PLATE_BONE = 1;

/** Skin weights: the spring blends from the root at its bottom to the plate at its top, the rest is rigid. */
function Weights([, , z], part) {
    if (part === "spike" || part === "plate") return [[PLATE_BONE, 1]];
    if (part !== "spring") return [[0, 1]];
    const w = Math.min(Math.max((z - SPRING_BOTTOM) / (UP_PLATE_BOTTOM - SPRING_BOTTOM), 0), 1);
    return [[0, 1 - w], [PLATE_BONE, w]].filter(([, x]) => x > 1e-4);
}

/** The render mesh, in the up pose. */
function BuildRender() {
    const mesh = new Mesh(64);
    // The shaft: walls (a square frame) down into the floor, and its bottom.
    const inner = ChamferedRect(0, 0, SHAFT_SIZE, SHAFT_SIZE, 0);
    const outer = ChamferedRect(0, 0, SHAFT_SIZE + 2 * SHAFT_WALL, SHAFT_SIZE + 2 * SHAFT_WALL, 0);
    mesh.Extrude(Shape(outer, [inner]), -SHAFT_DEPTH, 0, "shaft", "z");
    mesh.Extrude(Shape(outer), -SHAFT_DEPTH - SHAFT_WALL, -SHAFT_DEPTH, "shaft", "z");
    // The rim on the floor.
    const rimOuter = ChamferedRect(0, 0, SHAFT_SIZE + 2 * RIM_WIDTH, SHAFT_SIZE + 2 * RIM_WIDTH, 2);
    mesh.Extrude(Shape(rimOuter, [inner]), -0.5, RIM_HEIGHT, "rim", "z");
    // The spring, from the shaft's bottom up into the plate.
    mesh.Tube(Helix(0, 0, SPRING_RADIUS, SPRING_BOTTOM, UP_PLATE_BOTTOM + 0.5, SPRING_TURNS, SPRING_STEPS_PER_TURN), WIRE_RADIUS, WIRE_SIDES, "spring");
    // The plate and its spikes.
    const plateTop = UP_PLATE_BOTTOM + PLATE_THICKNESS;
    mesh.Extrude(Shape(ChamferedRect(0, 0, PLATE_SIZE, PLATE_SIZE, PLATE_CHAMFER)), UP_PLATE_BOTTOM, plateTop, "plate", "z");
    const first = -((SPIKE_GRID - 1) * SPIKE_SPACING) / 2;
    for (let i = 0; i < SPIKE_GRID; i++) {
        for (let j = 0; j < SPIKE_GRID; j++) {
            const x = first + i * SPIKE_SPACING, y = first + j * SPIKE_SPACING;
            mesh.Cone([x, y, plateTop - 0.2], [x, y, plateTop + SPIKE_HEIGHT], SPIKE_RADIUS, SPIKE_SIDES, "spike");
        }
    }
    return mesh;
}

// --- animation: the plate's height (0 = up, -TRAVEL = down) and tilt over time ---
const Smooth = x => x * x * (3 - 2 * x);

/** A damped sine starting at 0, faded to exactly 0 at `end`. */
function Damped(t, amplitude, hz, end) {
    if (t <= 0 || t >= end) return 0;
    return amplitude * Math.sin(2 * Math.PI * hz * t) * Math.exp(-BOUNCE_DAMPING * t) * (1 - (t / end) ** 4);
}

/** t seconds into "rise". */
function Rise(t) {
    if (t < POP_SECONDS) return { z: -TRAVEL * (1 - Math.sin((Math.PI / 2) * (t / POP_SECONDS))), tilt: 0 };
    const w = t - POP_SECONDS, end = RISE_SECONDS - POP_SECONDS;
    return { z: Damped(w, OVERSHOOT, BOUNCE_HZ, end), tilt: Damped(w, TILT_DEGREES, TILT_HZ, end) };
}

/** t seconds into "sink". */
const Sink = t => ({ z: -TRAVEL * Smooth(Math.min(t / SINK_SECONDS, 1)), tilt: 0 });

const UP = { z: 0, tilt: 0 };
const DOWN = { z: -TRAVEL, tilt: 0 };
const CycleSeconds = () => DOWN_SECONDS + RISE_SECONDS + UP_SECONDS + SINK_SECONDS;

/** t seconds into "cycle": down, rise, up, sink. */
function Cycle(t) {
    if (t < DOWN_SECONDS) return DOWN;
    t -= DOWN_SECONDS;
    if (t < RISE_SECONDS) return Rise(t);
    t -= RISE_SECONDS;
    if (t < UP_SECONDS) return UP;
    return Sink(t - UP_SECONDS);
}

/** The skeleton in one pose. */
function Frame({ z, tilt }) {
    const frame = BindFrame(BONES);
    const rad = (tilt * Math.PI) / 180;
    frame[PLATE_BONE].pos = [0, 0, UP_PLATE_BOTTOM + z];
    frame[PLATE_BONE].rot = [rad, rad * 0.6, 0];
    return frame;
}

/** Frames of `pose(t)` over `seconds`, both ends included. */
const Frames = (pose, seconds) => Array.from({ length: Math.round(seconds * FPS) + 1 }, (_, f) => Frame(pose(Math.min(f / FPS, seconds))));

const ANIMATIONS = [
    { name: "cycle", looping: true, frames: Frames(Cycle, CycleSeconds()) },
    { name: "rise", looping: false, frames: Frames(Rise, RISE_SECONDS) },
    { name: "sink", looping: false, frames: Frames(Sink, SINK_SECONDS) },
    { name: "up", looping: true, frames: [Frame(UP)] },
    { name: "down", looping: true, frames: [Frame(DOWN)] },
].map(a => ({ ...a, file: `${MODEL_DIR}/${NAME}_${a.name}.smd` }));

const render = BuildRender();
const mesh = `${MODEL_DIR}/${NAME}.smd`;
const materials = Object.fromEntries(PARTS.map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(mesh, SmdText(BONES, MeshSmdTriangles(render, NAME, Weights)));
for (const a of ANIMATIONS) WriteAddonFile(a.file, SmdAnimationText(BONES, a.frames));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh, materials, animations: ANIMATIONS }));
for (const [part, rgb, options] of [
    ["spike", SPIKE_COLOR, { metalness: 0.85 }],
    ["plate", PLATE_COLOR, { metalness: 0.6 }],
    ["spring", SPRING_COLOR, { metalness: 1 }],
    ["rim", RIM_COLOR, {}],
    ["shaft", SHAFT_COLOR, {}],
]) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...options }));
}
const compressed = UP_PLATE_BOTTOM - TRAVEL - SPRING_BOTTOM;
if (compressed < 2 * WIRE_RADIUS * SPRING_TURNS) throw new Error(`the spring compresses to ${compressed.toFixed(1)}: its coils would overlap`);
console.log(`${render.triangleCount} triangles (no collision), cycle ${CycleSeconds().toFixed(2)} s; floor hole ${SHAFT_SIZE} x ${SHAFT_SIZE}, spikes ${(UP_PLATE_BOTTOM + PLATE_THICKNESS + SPIKE_HEIGHT).toFixed(0)} high when up`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
