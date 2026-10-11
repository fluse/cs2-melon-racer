// Generates the free-look drone — `node tools/models/make-drone-model.mjs`: a
// small quadcopter every player in free look turns into (dev/free-look.js),
// so the others see who's flying around. About a melon in size (SPAN).
// Built in layers so it reads with depth: a white shell stepped over a dark
// carbon chassis (a shadow seam between them), a stepped tinted canopy with
// a GPS puck, vent grilles on both sides, a ribbed battery and two antennas
// at the back, a rear light bar, obstacle sensors and a camera on a gimbal
// at the front (+X in the game) — with a red recording light blinking on
// it —, tapered carbon arms with LEDs underneath,
// motor mounts, double guard rings on struts and spokes, bent landing skids
// — and four rotors, each on its own bone: a silver motor bell, a hub, two
// curved blades and a spinner, spinning around Z:
//   spin    the rotors turning ROTOR_TURNS_PER_SECOND, diagonal pairs the
//           other way round (like a real quadcopter), and the camera's red
//           recording light blinking (on its own bone, it sinks into the
//           camera's housing for the off half of each REC_BLINK_SECONDS), looping
//   idle    rotors standing still (one frame)
// The chassis and arms are woven carbon: a twill color + normal map
// (drone_carbon_{color,normal}.png), so the surface has structure too.
// The script spawns it from the point_template DRONE_TEMPLATE_NAME and
// starts "spin" itself — in the template just a prop_dynamic with this
// model. No collision at all: melons drive through a drone, and the
// script keeps it out of the world with traces (dev/free-look.js). Writes
//   models/melon_racer/drone/drone.smd             render mesh + skeleton (bind pose)
//   models/melon_racer/drone/drone_{spin,idle}.smd the animations
//   models/melon_racer/drone/drone.vmdl
//   materials/melon_racer/drone/drone_<part>.vmat (+ _color.png; carbon also _normal.png)
// Compile the .vmdl with resourcecompiler (see the end of the output).
// Origin in the body's center.
import { BindFrame, ChamferedRect, Circle, Mesh, MeshSmdTriangles, Shape, SmdAnimationText, SmdText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

// --- shape (built at ~4x and scaled down to SPAN on writing, so the small
// parts keep readable numbers; the melon is ~14 across) ---
const SPAN = 16; // across the guard rings, in the game: about a melon
const ARM_REACH = 17; // a motor's distance from the center along X and along Y
const GUARD_RADIUS = 12.5; // the rings around each rotor
const GUARD_TUBE = 0.55;
const GUARD_LOW_Z = 2.6; // the two rings, below and above the blades
const GUARD_HIGH_Z = 4.9;
const ROTOR_Z = 3.4; // the blades' underside
const BLADE_THICKNESS = 0.5;
const SKID_Z = -8.6;

// --- the camera's recording light ---
// Two, on the housing's upper flanks near the lens (above it sits the gimbal
// mount), one seen from each side; REC_LED is their bone, between them.
const REC_LED = [11, 0, -4.3];
const REC_SIDE = 1.6; // how far out to each side
const REC_RADIUS = 0.45;
const REC_HIDE_DEPTH = 1.4; // how far it sinks into the housing while off
const REC_BLINK_SECONDS = 1; // one on + off; SPIN_SECONDS must be a whole number of these
const REC_COLOR = [0xff, 0x18, 0x18]; // recording red

// --- rotor animation ---
const ROTOR_TURNS_PER_SECOND = 10; // 120 degrees a frame at FPS — under half a turn, so it still interpolates the right way round
const SPIN_SECONDS = 1; // one loop
const FPS = 30;

// --- tessellation: as low as still reads round ---
const ARM_SIDES = 8;
const MOTOR_SIDES = 12;
const GUARD_SIDES = 4; // around a ring's tube
const GUARD_SEGMENTS = 16; // along a ring
const STRUT_SIDES = 4;
const SKID_SIDES = 6;
const CAMERA_SIDES = 12;
const SMALL_SIDES = 8; // sensors, lights, antenna tips

// --- look: off-palette on purpose (a player avatar, not a map signal) ---
const SHELL_COLOR = [0xec, 0xef, 0xf2]; // white shell
const CANOPY_COLOR = [0x22, 0x26, 0x2c]; // dark tinted canopy
const FRAME_COLOR = [0x3a, 0x3e, 0x46]; // graphite mounts, gimbal, skids
const GUARD_COLOR = [0x55, 0x5a, 0x63];
const ROTOR_COLOR = [0x1c, 0x1e, 0x22];
const METAL_COLOR = [0xb8, 0xbd, 0xc4]; // motor bells, spinners
const VENT_COLOR = [0x0c, 0x0d, 0x0f];
const LENS_COLOR = [0x10, 0x10, 0x12];
const GLASS_COLOR = [0x4a, 0x9c, 0xff]; // the camera lens, glowing faintly
const LIGHT_COLOR = [0xff, 0xa8, 0x2a]; // amber lights, glowing
const CARBON_DARK = [0x16, 0x18, 0x1b]; // carbon weave: between the tows
const CARBON_LIGHT = [0x3a, 0x3f, 0x47]; // carbon weave: the tows' sheen

// --- carbon weave texture ---
const CARBON_SIZE = 64; // px, a power of two
const CARBON_CELLS = 4; // tows across the texture (2/2 twill: a period of 4)
const CARBON_BUMP = 2.5; // how strongly the normal map tilts at the tows' edges
const CARBON_UV_TILE = 12; // built units one carbon texture covers

const NAME = "drone";
const MODEL_DIR = "models/melon_racer/drone";
const MATERIAL_DIR = "materials/melon_racer/drone";
const GENERATOR = "tools/models/make-drone-model.mjs";

// The rotors: front-left, front-right, back-left, back-right; diagonal pairs
// turn the same way (+1 counter-clockwise from above).
const ROTORS = [
    { name: "rotor_fl", x: ARM_REACH, y: ARM_REACH, turn: 1 },
    { name: "rotor_fr", x: ARM_REACH, y: -ARM_REACH, turn: -1 },
    { name: "rotor_bl", x: -ARM_REACH, y: ARM_REACH, turn: -1 },
    { name: "rotor_br", x: -ARM_REACH, y: -ARM_REACH, turn: 1 },
];
const BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    ...ROTORS.map(({ name, x, y }) => ({ name, parent: 0, bind: [x, y, 0] })),
    { name: "rec_led", parent: 0, bind: REC_LED },
];
const REC_BONE = BONES.length - 1;

/**
 * The skeleton t seconds into the spin: every rotor turned around +Z its own
 * way, the recording light up for the first half of each blink, sunk into
 * the housing for the second.
 */
function SpinFrame(t) {
    const frame = BindFrame(BONES);
    ROTORS.forEach((rotor, i) => {
        frame[i + 1].rot = [0, 0, rotor.turn * 2 * Math.PI * ROTOR_TURNS_PER_SECOND * t];
    });
    const on = (t % REC_BLINK_SECONDS) < REC_BLINK_SECONDS / 2 - 1e-9;
    frame[REC_BONE].pos = on ? REC_LED : [REC_LED[0], REC_LED[1], REC_LED[2] - REC_HIDE_DEPTH];
    return frame;
}

// Built in game coordinates (front +X). ModelDoc turns an .smd 90 degrees
// around Z on import ((x, y, z) -> (-y, x, z), see ObjText in model.mjs), so
// everything is turned the other way before it's written — and scaled to SPAN.
const BUILT_SPAN = 2 * (ARM_REACH + GUARD_RADIUS + GUARD_TUBE);
const SCALE = SPAN / BUILT_SPAN;
const ToSource = ([x, y, z]) => [y * SCALE, -x * SCALE, z * SCALE];
const TurnOnly = ([x, y, z]) => [y, -x, z];

/** A box from (x0, y0, z0) to (x1, y1, z1), corners cut by `chamfer` around Z. */
const Box = (mesh, [x0, y0, z0], [x1, y1, z1], part, chamfer = 0) =>
    mesh.Extrude(Shape(ChamferedRect((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, chamfer)), z0, z1, part, "z");
/** A flat round puck around (x, y) from z0 to z1. */
const Puck = (mesh, x, y, radius, z0, z1, part, sides = MOTOR_SIDES) => mesh.Extrude(Shape(Circle(x, y, radius, sides)), z0, z1, part, "z");
/** A closed ring of tube around (x, y) at height z. */
function Ring(mesh, x, y, z, radius, tube, part) {
    const points = Array.from({ length: GUARD_SEGMENTS + 1 }, (_, i) => {
        const a = (2 * Math.PI * i) / GUARD_SEGMENTS;
        return [x + radius * Math.cos(a), y + radius * Math.sin(a), z];
    });
    mesh.Tube(points, tube, GUARD_SIDES, part, false);
}

const body = new Mesh(32);
const carbon = new Mesh(CARBON_UV_TILE); // chassis and arms: the weave at its own scale

// --- body: carbon chassis, the white shell stepped over it, the canopy ---
Box(carbon, [-11, -6.75, -3.2], [11, 6.75, 0.2], "carbon", 3.5);
Box(body, [-12, -8, 0], [12, 8, 2.6], "shell", 4);
Box(body, [-10.5, -6.5, 2.5], [10.5, 6.5, 3.6], "shell", 3.4);
Box(body, [-5, -4.75, 3.5], [8, 4.75, 5], "canopy", 2.6);
Box(body, [-3.5, -3.5, 4.9], [6.5, 3.5, 5.8], "canopy", 2);
Puck(body, 1.5, 0, 1.6, 5.7, 6.3, "frame", 10); // GPS puck
// Vent grilles on both sides: a dark recess, three slats over it.
for (const side of [1, -1]) {
    const y0 = side * 7.95, y1 = side * 8.15;
    body.Extrude(Shape(ChamferedRect(1.3, -1, 1.8, 6, 0)), Math.min(y0, y1), Math.max(y0, y1), "vent", "y");
    for (const z of [0.7, 1.3, 1.9]) {
        const a = side * 8.0, b = side * 8.4;
        body.Extrude(Shape(ChamferedRect(z, -1, 0.25, 5.6, 0)), Math.min(a, b), Math.max(a, b), "shell", "y");
    }
}
// Battery at the back, ribbed.
Box(body, [-11, -4, 3.5], [-6, 4, 5.2], "frame", 0.8);
for (const x of [-10, -8.5, -7]) {
    Box(body, [x - 0.3, -4.2, 4.2], [x + 0.3, 4.2, 5.5], "rotor");
}
// Antennas, angled back and up, with glowing tips.
for (const side of [1, -1]) {
    const foot = [-10.5, side * 3, 3.6], tip = [-14, side * 5, 9];
    body.Tube([foot, tip], 0.35, 4, "frame", false);
    body.Tube([tip, [tip[0] - 0.35, tip[1] + side * 0.2, tip[2] + 0.9]], 0.55, SMALL_SIDES, "light", true);
}
// Light bar across the back, sensors and two lights at the front.
body.Extrude(Shape(ChamferedRect(0, 1.3, 6, 0.8, 0)), -12.25, -11.9, "light", "x");
for (const side of [1, -1]) {
    body.Tube([[11.8, side * 2.2, 1.3], [12.4, side * 2.2, 1.3]], 0.75, SMALL_SIDES, "lens", true);
    const corner = [10.4, side * 6.4, 1.3], out = [Math.SQRT1_2, side * Math.SQRT1_2, 0];
    body.Tube([corner, corner.map((c, i) => c + out[i] * 0.7)], 0.6, SMALL_SIDES, "light", true);
}
// Camera gimbal under the nose: mount, yoke, a rounded body, bezel, lens.
Box(body, [7, -3, -4], [11, 3, -3.1], "frame", 1);
for (const side of [1, -1]) {
    const a = side * 2.6, b = side * 3.1;
    body.Extrude(Shape(ChamferedRect(-5, 9.5, 3.6, 2.2, 0.6)), Math.min(a, b), Math.max(a, b), "frame", "y");
}
const camRadii = [1.6, 2.3, 2.3, 1.9];
body.Tube([[7.6, 0, -5.6], [8.4, 0, -5.6], [10.4, 0, -5.6], [11.4, 0, -5.6]], i => camRadii[i], CAMERA_SIDES, "lens", true);
body.Tube([[11.3, 0, -5.6], [11.8, 0, -5.6]], 1.75, CAMERA_SIDES, "frame", true);
body.Tube([[11.8, 0, -5.6], [12.0, 0, -5.6]], 1.3, CAMERA_SIDES, "glass", true);

// --- arms, motor mounts, guard rings ---
for (const { x, y } of ROTORS) {
    const sx = Math.sign(x), sy = Math.sign(y);
    const root = [sx * 9, sy * 5.5, 0.4], end = [x, y, 0.2];
    carbon.Tube([root, end], i => (i === 0 ? 2 : 1.3), ARM_SIDES, "carbon", false);
    // An LED under the arm, near the motor.
    const led = root.map((r, i) => r + (end[i] - r) * 0.78);
    body.Tube([[led[0], led[1], -1.0], [led[0], led[1], -1.6]], 0.55, SMALL_SIDES, "light", true);
    Puck(body, x, y, 3.8, -1.4, 0.6, "frame");
    Puck(body, x, y, 4.2, -1.8, -1.3, "rotor"); // a dark foot ring under the mount
    Ring(body, x, y, GUARD_LOW_Z, GUARD_RADIUS, GUARD_TUBE, "guard");
    Ring(body, x, y, GUARD_HIGH_Z, GUARD_RADIUS, GUARD_TUBE, "guard");
    const outward = Math.atan2(sy, sx);
    // Struts between the rings, and two spokes from the mount out to the low ring.
    for (let k = 0; k < 4; k++) {
        const a = outward + Math.PI / 4 + (k * Math.PI) / 2;
        const p = [x + GUARD_RADIUS * Math.cos(a), y + GUARD_RADIUS * Math.sin(a)];
        body.Tube([[...p, GUARD_LOW_Z], [...p, GUARD_HIGH_Z]], 0.4, STRUT_SIDES, "guard", false);
    }
    for (const turn of [-1, 1]) {
        const a = outward + turn * (Math.PI / 3);
        body.Tube([
            [x + 3.6 * Math.cos(a), y + 3.6 * Math.sin(a), -0.4],
            [x + GUARD_RADIUS * Math.cos(a), y + GUARD_RADIUS * Math.sin(a), GUARD_LOW_Z],
        ], 0.45, STRUT_SIDES, "guard", false);
    }
}

// --- landing skids: two bent legs each, a rail turned up at the front ---
for (const side of [1, -1]) {
    for (const x of [4.5, -4.5]) {
        body.Tube([[x, side * 5.8, -3], [x, side * 7.5, -6], [x, side * 8.2, SKID_Z + 0.2]], 0.8, SKID_SIDES, "frame", false);
    }
    body.Tube([[-9, side * 8.2, SKID_Z], [7, side * 8.2, SKID_Z], [9, side * 8.2, SKID_Z + 0.8], [9.8, side * 8.2, SKID_Z + 2]], 0.8, SKID_SIDES, "frame", true);
}

// One blade along +x from the hub: its outline, counter-clockwise — wide
// near the root, curved leading edge, rounded tip.
const BLADE = [[1.2, -0.8], [4, -1.1], [8, -0.9], [10.3, -0.4], [10.6, 0.1], [10.2, 0.6], [7, 1.0], [3.5, 1.3], [1.2, 0.9]];

/** One rotor around (x, y), on its own bone: motor bell, hub, two blades, spinner. */
function BuildRotor({ x, y, turn }) {
    const rotor = new Mesh(32);
    Puck(rotor, x, y, 3.3, 0.5, 2.6, "metal");
    Puck(rotor, x, y, 2.4, 2.5, 3.1, "rotor");
    Puck(rotor, x, y, 1.7, 3.0, ROTOR_Z + BLADE_THICKNESS + 0.2, "rotor", 10);
    for (const flip of [1, -1]) {
        // Mirrored across the blade's own axis for the rotors turning the other way: the leading edge leads.
        const outline = BLADE.map(([u, v]) => [x + flip * u, y + flip * v * turn]);
        const ccw = flip * turn > 0 ? outline : [...outline].reverse();
        rotor.Extrude(Shape(ccw), ROTOR_Z, ROTOR_Z + BLADE_THICKNESS, "rotor", "z");
    }
    rotor.Cone([x, y, ROTOR_Z + BLADE_THICKNESS + 0.2], [x, y, ROTOR_Z + 2.2], 1.4, 10, "metal");
    return rotor;
}

/** A mesh's SMD triangles, turned from game into source coordinates. */
const Turned = (mesh, bone) => MeshSmdTriangles(mesh, NAME, bone).map(tri => ({
    ...tri,
    corners: tri.corners.map(c => ({ ...c, p: ToSource(c.p), n: TurnOnly(c.n) })),
}));
const sourceBones = BONES.map(b => ({ ...b, bind: ToSource(b.bind) }));
// The recording lights: two small red domes on their own bone, standing out of the housing along its surface normal.
const rec = new Mesh(32);
for (const side of [1, -1]) {
    const normal = [0, side * 0.78, 0.62];
    const at = [REC_LED[0], side * REC_SIDE, REC_LED[2]];
    rec.Tube([at.map((c, i) => c - normal[i] * 0.6), at.map((c, i) => c + normal[i] * 0.3)], REC_RADIUS, SMALL_SIDES, "rec", true);
}
const triangles = [
    ...Turned(body, 0),
    ...Turned(carbon, 0),
    ...ROTORS.flatMap((rotor, i) => Turned(BuildRotor(rotor), i + 1)),
    ...Turned(rec, REC_BONE),
];

// --- carbon weave: 2/2 twill, tows as rounded bumps, seamless ---
/** How high the weave stands at pixel (px, py), 0..1, and which way the tow there runs. */
function CarbonHeight(px, py) {
    const cell = CARBON_SIZE / CARBON_CELLS;
    const wrap = v => ((v % CARBON_SIZE) + CARBON_SIZE) % CARBON_SIZE;
    const x = wrap(px), y = wrap(py);
    const i = Math.floor(x / cell), j = Math.floor(y / cell);
    const fx = (x % cell) / cell, fy = (y % cell) / cell;
    const warp = (i + j) % 4 < 2; // runs along y here, else along x
    const across = warp ? fx : fy;
    return { h: Math.sqrt(Math.max(0, Math.sin(Math.PI * across))), warp };
}
const carbonColor = EncodePng(CARBON_SIZE, CARBON_SIZE, (px, py) => {
    const { h, warp } = CarbonHeight(px + 0.5, py + 0.5);
    const shine = h * (warp ? 1 : 0.7);
    return [...CARBON_DARK.map((d, k) => Math.round(d + (CARBON_LIGHT[k] - d) * shine)), 255];
});
const carbonNormal = EncodePng(CARBON_SIZE, CARBON_SIZE, (px, py) => {
    const H = (x, y) => CarbonHeight(x + 0.5, y + 0.5).h;
    const dx = (H(px + 1, py) - H(px - 1, py)) / 2, dy = (H(px, py + 1) - H(px, py - 1)) / 2;
    const n = [-dx * CARBON_BUMP, -dy * CARBON_BUMP, 1];
    const len = Math.hypot(...n);
    return [...n.map(c => Math.round((c / len * 0.5 + 0.5) * 255)), 255];
});

const looks = [
    ["shell", SHELL_COLOR, {}],
    ["canopy", CANOPY_COLOR, { metalness: 0.4 }],
    ["frame", FRAME_COLOR, { metalness: 0.5 }],
    ["guard", GUARD_COLOR, {}],
    ["rotor", ROTOR_COLOR, {}],
    ["metal", METAL_COLOR, { metalness: 0.9 }],
    ["vent", VENT_COLOR, {}],
    ["lens", LENS_COLOR, { metalness: 0.6 }],
    ["glass", GLASS_COLOR, { glow: 1.5 }],
    ["light", LIGHT_COLOR, { glow: 3 }],
    ["rec", REC_COLOR, { glow: 4 }],
    ["carbon", undefined, { metalness: 0.3, normal: `${MATERIAL_DIR}/${NAME}_carbon_normal.png` }],
];
const materials = Object.fromEntries(looks.map(([part]) => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
// The last frame repeats the first pose (whole turns): the loop closes seamlessly.
const spinFrames = Array.from({ length: Math.round(SPIN_SECONDS * FPS) + 1 }, (_, f) => SpinFrame(f / FPS));
const animations = [
    { name: "spin", file: `${MODEL_DIR}/${NAME}_spin.smd`, looping: true },
    { name: "idle", file: `${MODEL_DIR}/${NAME}_idle.smd`, looping: true },
];
const mesh = `${MODEL_DIR}/${NAME}.smd`;
WriteAddonFile(mesh, SmdText(sourceBones, triangles));
WriteAddonFile(animations[0].file, SmdAnimationText(sourceBones, spinFrames.map(frame => frame.map(bone => ({ ...bone, pos: ToSource(bone.pos) })))));
WriteAddonFile(animations[1].file, SmdAnimationText(sourceBones, [BindFrame(sourceBones)]));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh, materials, animations }));
WriteAddonFile(`${MATERIAL_DIR}/${NAME}_carbon_normal.png`, carbonNormal);
for (const [part, rgb, options] of looks) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, rgb ? SolidPng(rgb) : carbonColor);
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...options }));
}
console.log(`${triangles.length} triangles, no collision, spin ${spinFrames.length} frames (${ROTOR_TURNS_PER_SECOND} turns/s); ${SPAN} across, ${((6.3 - SKID_Z + 0.8) * SCALE).toFixed(1)} high`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
