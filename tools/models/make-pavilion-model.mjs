// Builds the hub's Grand Prix pavilion — `node tools/models/make-pavilion-model.mjs`:
// a big inflatable spider tent, the place the Grand Prix starts from, in the
// hub gates' style (tools/lib/inflatable.mjs: the same tube, seams, straps,
// feet, guy ropes and blower).
//
//   frame    four fat vinyl legs rising from the corners and curving in to a
//            squashed ring crown on top, in segments with pinched seams and a
//            dark strap around each, each leg in a foot ring on a base plate,
//            a guy rope out to a stake at every corner, a blower at one leg
//   canopy   white fabric stretched over the legs, both sides, curving in a
//            little between them; an arched opening on every side, its hem
//            trimmed with dark piping
//   details  a checkered racing flag on a pole over the crown; pennant
//            bunting (white and dark, alternating) under three hems; over the
//            main entrance (+X) a "GRAND PRIX" sign hanging from the hem,
//            readable from outside and in, checkered ends; a glowing light
//            ring under the crown inside
//
// Split into models so each piece can be tinted on its own (the prop's
// render color tints its light surfaces — vinyl, canvas, pennants, letters,
// light ring — never the dark straps, plates, ropes or the board), the
// repeated ones built once, all around the same origin (the pavilion's
// middle, on the floor), so every piece is placed at that one spot and only
// turned (yaw, in 90 degree steps):
//   pavilion_leg      a leg with its foot, straps, guy rope and stake: the
//                     +X+Y corner's (45 degrees)            4x: yaw 0, 90, 180, 270
//   pavilion_canopy   one side's canopy with its hem: +X     4x: yaw 0, 90, 180, 270
//   pavilion_bunting  one side's pennants: +X                3x: yaw 90, 180, 270
//   pavilion_sign     the "GRAND PRIX" sign: +X, the main entrance       1x: yaw 0
//   pavilion_crown    the ring the legs run into                         1x
//   pavilion_flag     flagpole and checkered flag, waving: a prop_dynamic
//                     with Idle Animation "wave", Loop Mode "Loop"        1x
//   pavilion_light    the light ring inside                               1x
//   pavilion_blower   the blower beside the leg at yaw 0 (turn it like
//                     the leg it should stand at)                         1x
// Writes models/melon_racer/pavilion/pavilion_<piece>.vmdl (+ .obj; the leg
// and the blower with _physics.obj — nothing else is solid) and
// materials/melon_racer/pavilion/pavilion_<part>.vmat (+ textures).
// Compile the .vmdl files with resourcecompiler (see the output).
import { BUNGEE, LoadFont, TextShapes } from "../lib/font.mjs";
import { Blower, GuyRope, InflatableFoot, PolylinePath, RopeLoop, SegmentedTube, SquashedRing } from "../lib/inflatable.mjs";
import { EncodePng } from "../lib/png.mjs";
import { BindFrame, ChamferedRect, Mesh, MeshSmdTriangles, ObjText, Shape, SmdAnimationText, SmdText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- The frame ---
const CORNER = 144; // the legs stand at (+-CORNER, +-CORNER)
const REACH = CORNER * Math.SQRT2; // a leg's distance from the middle
const BEND_Z = 70; // the legs rise straight up to here, then curve in
const DOME_RISE = 110; // from BEND_Z to the curve's top (the tube's centerline)
const TUBE_RADIUS = 16;
const TUBE_SIDES = 16;
const TUBE_STEP = 34; // units along a leg between rings, mid-segment (smooth normals hide the chords)
const LEG_SEGMENTS = 4;
const SEAM = { radius: 0.86, rounding: 6, rings: [0, 6] };
const STRAP = { radius: 15, halfWidth: 1.4, part: "dark" };
const CURVE_POINTS = 60; // the legs' curve, sampled for the path
const CROWN_RADIUS = 40; // the ring on top the legs run into
const CROWN_HEIGHT = 26;
const LEG_END_REACH = 30; // the legs end this far from the middle, inside the crown
const FOOT = { plateRadius: 26, plateHeight: 3, platePart: "dark", radius: 24, height: 12, rings: 6, sides: TUBE_SIDES, part: "vinyl" };
const LEG_BOTTOM = FOOT.plateHeight + FOOT.height - 1; // the legs start inside the foot rings
const ROPE = { ropeRadius: 0.4, ropePart: "rope", stakeRadius: 0.8, stakeHeight: 3.5, stakePart: "dark" };
const ROPE_HEIGHT = 56; // where a guy rope is tied around its leg
const ROPE_OUT = 56; // how far out past its leg (diagonally) the stake is
const BLOWER = { size: [12, 14, 10], ductRadius: 3.8 };
const PHYSICS_SIDES = 8;

// --- The canopy ---
// Fabric under the legs, the way a spider tent's frame stands out on top of
// it: the legs' curve shrunk by CANOPY_INSET (inside the tubes), pulled in by
// up to CANOPY_SAG of its distance from the middle halfway between two legs.
const CANOPY_INSET = 0.4 * TUBE_RADIUS;
const CANOPY_SAG = 0.12;
// Its hem: at HEM_LEG_Z where it meets a leg, arching up to HEM_MID_Z halfway between two.
const HEM_LEG_Z = 95;
const HEM_MID_Z = 132;
const CANOPY_COLUMNS = 12; // across one side, leg to leg
const CANOPY_ROWS = 7; // from the hem up to the crown
const PIPING_RADIUS = 1.1;

// --- The details ---
const FLAGPOLE_HEIGHT = 46; // above the crown
const FLAGPOLE_RADIUS = 1;
const FLAG_SIZE = [30, 19]; // along Y, down
const FLAG_CHECKS = [6, 4]; // checks along, down
// The wave: the cloth hangs on a chain of FLAG_BONES bones along it, each
// turning around the vertical a little behind the one before — a wave
// running from the pole to the free end, growing towards it.
const FLAG_BONES = 5;
const FLAG_COLUMNS = 2 * FLAG_BONES; // across the cloth, along the bones
const FLAG_ROWS = 4;
const FLAG_WAVE_SECONDS = 1.2; // one wave
const FLAG_WAVE_DEGREES = 16; // each bone's swing at the free end; less towards the pole
const FLAG_WAVE_DELAY = 0.9; // radians each bone is behind the one before
const FLAG_FPS = 30;
const BUNTING_SAG = 7; // the line sags this far below the hem halfway along
const BUNTING_DROP = 3; // the line hangs this far below the hem at its ends
const PENNANTS = 11; // per side
const PENNANT_LENGTH = 9;
const SIGN_SIZE = [150, 28]; // along Y, up
const SIGN_THICKNESS = 2;
const SIGN_GAP = 10; // from the hem down to the sign's top
const SIGN_TEXT = "GRAND PRIX";
const SIGN_TEXT_HEIGHT = 14;
const SIGN_TEXT_RAISE = 1;
const SIGN_EDGE = { inset: 1.5, width: 1, raise: 0.5 };
const SIGN_CHECK = 3.2; // the checkered ends: squares this big, 2 rows x 3
const LIGHT_RING_RADIUS = 26; // under the crown, inside
const LIGHT_RING_TUBE = 1.6;
const LIGHT_RING_DROP = 22; // below the crown's bottom

// tint: whether the prop's render color tints it.
const COLORS = {
    canvas: { rgb: [0xf4, 0xf5, 0xf2], tint: 1 }, // the canopy's white fabric
    dark: { rgb: [0x2b, 0x30, 0x38], tint: 0 }, // the hub gates' graphite: straps, plates, piping, sign board
    rope: { rgb: [0x1a, 0x1c, 0x20], tint: 0 },
    white: { rgb: [0xf2, 0xf4, 0xf5], tint: 1 }, // letters, sign edge, pennants, the flagpole's ball
    light: { rgb: [0xff, 0xf1, 0xd6], tint: 1, glow: 3 }, // the light ring, warm white
};
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat"; // tools/materials/make-inflatable.mjs, tinted per prop

const NAME = "pavilion";
const MODEL_DIR = "models/melon_racer/pavilion";
const MATERIAL_DIR = "materials/melon_racer/pavilion";
const GENERATOR = "tools/models/make-pavilion-model.mjs";

const font = LoadFont(BUNGEE);
// Leg azimuths, from +X counter-clockwise. Side k runs from leg k to leg k + 1:
// side 0 faces +Y, 1 -X, 2 -Y, and 3 +X — the main entrance.
const LEG_ANGLES = [45, 135, 225, 315].map(a => (a * Math.PI) / 180);
const ENTRANCE_SIDE = 3;

/** The legs' curve at t (0 = where it starts bending, PI/2 = the top) for a curve `grown` out from the tube's centerline. */
const Curve = (t, grown = 0) => [(REACH + grown) * Math.cos(t), BEND_Z + (DOME_RISE + grown) * Math.sin(t)];
const LEG_END_T = Math.acos(LEG_END_REACH / REACH);
const CROWN_Z = Curve(LEG_END_T)[1] - CROWN_HEIGHT / 2;

/** Where on the curve (t) a height z is, for `grown`. */
const CurveT = (z, grown = 0) => Math.asin(Math.min(1, (z - BEND_Z) / (DOME_RISE + grown)));

/** The point at azimuth `angle`, `reach` out from the middle, at height z. */
const AtAzimuth = (angle, reach, z) => [reach * Math.cos(angle), reach * Math.sin(angle), z];

/** One leg as a path: straight up from its foot, then curving in to the crown. */
function LegPath(angle) {
    const points = [AtAzimuth(angle, REACH, LEG_BOTTOM)];
    for (let i = 0; i <= CURVE_POINTS; i++) {
        const [reach, z] = Curve((LEG_END_T * i) / CURVE_POINTS);
        points.push(AtAzimuth(angle, reach, z));
    }
    return { ...PolylinePath(points), bend: BEND_Z - LEG_BOTTOM };
}

/** The leg at azimuth `angle` with its foot, guy rope and stake. */
function BuildLeg(mesh, physics, angle) {
    const path = LegPath(angle);
    SegmentedTube(mesh, {
        At: path.At, length: path.length, bends: [path.bend], segments: LEG_SEGMENTS,
        radius: TUBE_RADIUS, sides: TUBE_SIDES, step: TUBE_STEP, seam: SEAM, strap: STRAP, part: "vinyl",
    });
    physics.Tube(Array.from({ length: 13 }, (_, k) => path.At((path.length * k) / 12)), TUBE_RADIUS, PHYSICS_SIDES, "vinyl");
    const [x, y] = AtAzimuth(angle, REACH, 0);
    InflatableFoot(mesh, x, y, FOOT);
    physics.Tube([[x, y, 0], [x, y, FOOT.plateHeight + FOOT.height]], FOOT.plateRadius, PHYSICS_SIDES, "vinyl");
    // A guy rope straight out along the diagonal.
    GuyRope(mesh, AtAzimuth(angle, REACH + TUBE_RADIUS - 1, ROPE_HEIGHT), AtAzimuth(angle, REACH + ROPE_OUT, 0).slice(0, 2), ROPE);
    RopeLoop(mesh, x, y, ROPE_HEIGHT, TUBE_RADIUS, TUBE_SIDES, "rope");
}

/** The blower beside the leg at `angle` (along the side counter-clockwise from it, clear of its rope). */
function BuildBlower(mesh, physics, angle) {
    const [x, y] = AtAzimuth(angle, REACH, 0);
    const side = angle + Math.PI / 2;
    const at = [x + Math.cos(side) * 46, y + Math.sin(side) * 46];
    const into = [x + Math.cos(side) * (FOOT.radius - 3), y + Math.sin(side) * (FOOT.radius - 3), FOOT.plateHeight + FOOT.height / 2];
    Blower(mesh, physics, { at, into, ...BLOWER, ductLow: BLOWER.ductRadius + FOOT.plateHeight, boxPart: "dark", ringPart: "rope", ductPart: "vinyl" });
}

function BuildCrown(mesh) {
    SquashedRing(mesh, 0, 0, CROWN_Z, { radius: CROWN_RADIUS, height: CROWN_HEIGHT, rings: 8, sides: 24, part: "vinyl" });
    mesh.Tube([[0, 0, CROWN_Z + CROWN_HEIGHT / 2 - STRAP.halfWidth], [0, 0, CROWN_Z + CROWN_HEIGHT / 2 + STRAP.halfWidth]], CROWN_RADIUS + 0.4, 24, "dark", false);
}

/** The hem's height across a side (u 0..1, leg to leg): low at the legs, arching up between them. */
const HemZ = u => HEM_LEG_Z + (HEM_MID_Z - HEM_LEG_Z) * Math.sin(Math.PI * u);

/** A point of the canopy over the side from leg k, at u across (0..1) and height z. */
function CanopyPoint(k, u, z) {
    const angle = LEG_ANGLES[k] + (Math.PI / 2) * u;
    const t = CurveT(z, -CANOPY_INSET);
    const reach = Curve(t, -CANOPY_INSET)[0] * (1 - CANOPY_SAG * Math.sin(Math.PI * u));
    return AtAzimuth(angle, reach, z);
}

const CANOPY_TOP_Z = CROWN_Z + CROWN_HEIGHT * 0.6; // tucked under the crown ring

/** Side k's canopy and its hem's piping. */
function BuildCanopy(mesh, k) {
    const middle = [0, 0, BEND_Z];
    {
        const grid = [];
        for (let i = 0; i <= CANOPY_ROWS; i++) {
            const w = i / CANOPY_ROWS;
            grid.push(Array.from({ length: CANOPY_COLUMNS + 1 }, (_, j) => {
                const u = j / CANOPY_COLUMNS, hem = HemZ(u);
                // Rows bunch up towards the hem a little, where the cloth curves most.
                return CanopyPoint(k, u, hem + (CANOPY_TOP_Z - hem) * w ** 1.25);
            }));
        }
        mesh.Surface(grid, "canvas", { away: middle });
        mesh.Surface(grid, "canvas", { away: middle, flip: true });
        // The hem's piping.
        mesh.Tube(grid[0], PIPING_RADIUS, 4, "dark", true);
    }
}

/** The bunting line under side k's hem (u 0..1). */
const BuntingPoint = (k, u) => {
    const p = CanopyPoint(k, u, HemZ(u));
    return [p[0], p[1], p[2] - BUNTING_DROP - (BUNTING_SAG - BUNTING_DROP) * Math.sin(Math.PI * u)];
};

/** Side k's bunting. */
function BuildBunting(mesh, k) {
    {
        const line = Array.from({ length: 13 }, (_, i) => BuntingPoint(k, 0.06 + (0.88 * i) / 12));
        mesh.Tube(line, 0.35, 4, "rope", false);
        for (let n = 0; n < PENNANTS; n++) {
            const u = 0.06 + (0.88 * (n + 0.5)) / PENNANTS, half = (0.88 / PENNANTS) * 0.42;
            const a = BuntingPoint(k, u - half), b = BuntingPoint(k, u + half), mid = BuntingPoint(k, u);
            const tip = [mid[0], mid[1], mid[2] - PENNANT_LENGTH];
            const part = n % 2 ? "dark" : "white";
            mesh.Tri(a, b, tip, part);
            mesh.Tri(b, a, tip, part);
        }
    }
}

const FLAG_POLE_TOP = CROWN_Z + CROWN_HEIGHT + FLAGPOLE_HEIGHT;
const FLAG_TOP = FLAG_POLE_TOP - 1; // the cloth's upper edge at the pole
const FLAG_SLOPE = 0.08; // the cloth's upper edge falls this much per unit along it

/** The flagpole, its ball, and the cloth flat in the X = 0 plane, flying towards +Y. */
function BuildFlag(mesh) {
    const top = CROWN_Z + CROWN_HEIGHT;
    mesh.Tube([[0, 0, top - 2], [0, 0, FLAG_POLE_TOP]], FLAGPOLE_RADIUS, 8, "dark");
    mesh.Tube([[0, 0, FLAG_POLE_TOP], [0, 0, FLAG_POLE_TOP + 1.6]], 1.8, 8, "white"); // the ball on top
    const [len, drop] = FLAG_SIZE;
    const grid = Array.from({ length: FLAG_ROWS + 1 }, (_, i) => Array.from({ length: FLAG_COLUMNS + 1 }, (_, j) => {
        const along = (len * j) / FLAG_COLUMNS;
        return [0, FLAGPOLE_RADIUS + along, FLAG_TOP - (drop * i) / FLAG_ROWS - along * FLAG_SLOPE];
    }));
    const uvScale = [FLAG_CHECKS[0] / 4, FLAG_CHECKS[1] / 4];
    mesh.Surface(grid, "flag", { away: [-10, 0, FLAG_POLE_TOP], uvScale });
    mesh.Surface(grid, "flag", { away: [-10, 0, FLAG_POLE_TOP], flip: true, uvScale });
}

// The flag's skeleton: root (the pole), then the chain along the cloth's top
// edge: flag_0 at the pole, flag_<i> every FLAG_SIZE[0] / FLAG_BONES along.
const FLAG_SEGMENT = FLAG_SIZE[0] / FLAG_BONES;
const FLAG_SKELETON = [{ name: "root", parent: -1, bind: [0, 0, 0] }];
for (let i = 0; i <= FLAG_BONES; i++) {
    FLAG_SKELETON.push({ name: `flag_${i}`, parent: i, bind: i === 0 ? [0, FLAGPOLE_RADIUS, FLAG_TOP] : [0, FLAG_SEGMENT, -FLAG_SEGMENT * FLAG_SLOPE] });
}

/** Skin weights: the pole on the root, the cloth blended between the two nearest bones along it. */
function FlagWeights(p, part) {
    if (part !== "flag") return [[0, 1]];
    const k = Math.min(Math.max((p[1] - FLAGPOLE_RADIUS) / FLAG_SEGMENT, 0), FLAG_BONES);
    const i = Math.min(Math.floor(k), FLAG_BONES - 1), f = k - i;
    return [[1 + i, 1 - f], [2 + i, f]].filter(([, w]) => w > 1e-4);
}

/** The wave at time t: each bone turned around Z, later and further the nearer the free end. */
function FlagFrame(time) {
    const frame = BindFrame(FLAG_SKELETON);
    for (let i = 0; i <= FLAG_BONES; i++) {
        const amplitude = (FLAG_WAVE_DEGREES * Math.PI / 180) * (0.35 + 0.65 * i / FLAG_BONES);
        frame[1 + i].rot = [0, 0, amplitude * Math.sin((2 * Math.PI * time) / FLAG_WAVE_SECONDS - FLAG_WAVE_DELAY * i)];
    }
    return frame;
}

/**
 * ModelDoc turns an .smd 90 degrees around Z on import ((x, y, z) -> (-y, x, z));
 * the flag is turned the other way first, so it lines up with the other
 * pieces (plain .obj files, not turned).
 */
const Unturn = ([x, y, z]) => [y, -x, z];

/** Writes the flag as a skinned model with its looping "wave" (and a still "idle"). */
function WriteFlag() {
    const mesh = new Mesh(64);
    BuildFlag(mesh);
    const name = `${NAME}_flag`;
    const triangles = MeshSmdTriangles(mesh, NAME, FlagWeights)
        .map(tri => ({ ...tri, corners: tri.corners.map(c => ({ ...c, p: Unturn(c.p), n: Unturn(c.n) })) }));
    const bones = FLAG_SKELETON.map(b => ({ ...b, bind: Unturn(b.bind) }));
    // Frames relative to the parent like the bind pose: turned the same way (rotations around Z stay).
    const Turned = frame => frame.map(({ pos, rot }) => ({ pos: Unturn(pos), rot }));
    const frames = Array.from({ length: Math.round(FLAG_WAVE_SECONDS * FLAG_FPS) }, (_, f) => Turned(FlagFrame(f / FLAG_FPS)));
    WriteAddonFile(`${MODEL_DIR}/${name}.smd`, SmdText(bones, triangles));
    WriteAddonFile(`${MODEL_DIR}/${name}_wave.smd`, SmdAnimationText(bones, frames));
    WriteAddonFile(`${MODEL_DIR}/${name}_idle.smd`, SmdAnimationText(bones, [BindFrame(bones)]));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({
        name: NAME, mesh: `${MODEL_DIR}/${name}.smd`,
        materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])),
        animations: [
            { name: "wave", file: `${MODEL_DIR}/${name}_wave.smd`, looping: true },
            { name: "idle", file: `${MODEL_DIR}/${name}_idle.smd`, looping: true },
        ],
    }));
    return { triangles: mesh.triangleCount, frames: frames.length };
}

/** Mirrored across u = 0 (outer still counter-clockwise), so it reads right from behind. */
const Mirror = shapes => shapes.map(s => ({
    outer: s.outer.map(([u, v]) => [-u, v]).reverse(),
    holes: s.holes.map(h => h.map(([u, v]) => [-u, v]).reverse()),
}));

/** The "GRAND PRIX" sign under the main entrance's hem, facing +X out and -X in. */
function BuildSign(mesh) {
    const [width, height] = SIGN_SIZE;
    const front = CanopyPoint(ENTRANCE_SIDE, 0.5, HemZ(0.5)); // the hem's middle, on +X
    const x = front[0] - 4; // just inside the hem
    const top = front[2] - SIGN_GAP, zc = top - height / 2;
    const back = x - SIGN_THICKNESS / 2, face = x + SIGN_THICKNESS / 2;
    const Both = (shapes, d0, d1, part, mirrored = shapes) => {
        mesh.Extrude(shapes, d0, d1, part, "x");
        mesh.Extrude(mirrored, 2 * x - d1, 2 * x - d0, part, "x");
    };
    mesh.Extrude(Shape(ChamferedRect(0, zc, width, height, 3)), back, face, "dark", "x");
    const { inset, width: ew, raise } = SIGN_EDGE;
    Both(Shape(ChamferedRect(0, zc, width - 2 * inset, height - 2 * inset, 2.2), [ChamferedRect(0, zc, width - 2 * (inset + ew), height - 2 * (inset + ew), 1.5)]), face - 0.2, face + raise, "white");
    // The name, centered on the capitals.
    const shapes = TextShapes(font, SIGN_TEXT, SIGN_TEXT_HEIGHT, { letterSpacing: 1, curveStep: 4, minSegments: 1 });
    const us = shapes.flatMap(s => s.outer.map(p => p[0]));
    const du = -(Math.min(...us) + Math.max(...us)) / 2, dv = zc - SIGN_TEXT_HEIGHT / 2;
    const Move = c => c.map(([u, v]) => [u + du, v + dv]);
    const text = shapes.map(s => ({ outer: Move(s.outer), holes: s.holes.map(Move) }));
    Both(text, face - 0.2, face + SIGN_TEXT_RAISE, "white", Mirror(text));
    // Checkered ends: 2 rows x 3, white on the dark board.
    const textHalf = (Math.max(...us) - Math.min(...us)) / 2;
    const flagCenter = (textHalf + (width / 2 - SIGN_EDGE.inset - SIGN_EDGE.width)) / 2;
    for (const end of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        if ((r + c) % 2) continue;
        const u = end * flagCenter + (c - 1) * SIGN_CHECK, v = zc + (r - 0.5) * SIGN_CHECK;
        Both(Shape(ChamferedRect(u, v, SIGN_CHECK, SIGN_CHECK, 0)), face - 0.2, face + SIGN_TEXT_RAISE * 0.6, "white");
    }
    // Hung from the hem by two straps.
    for (const end of [-1, 1]) {
        const y = end * (width / 2 - 12);
        const u = 0.5 + Math.atan2(y, front[0]) / (Math.PI / 2); // the hem right above
        mesh.Tube([[x, y, top - 1], [x, y, HemZ(u) + 2]], 0.5, 4, "rope", false);
    }
}

/** A glowing ring hanging under the crown, inside the tent. */
function BuildLight(mesh) {
    const z = CROWN_Z - LIGHT_RING_DROP;
    const ring = Array.from({ length: 25 }, (_, i) => AtAzimuth((2 * Math.PI * i) / 24, LIGHT_RING_RADIUS, z));
    mesh.Tube(ring, LIGHT_RING_TUBE, 6, "light", false);
    // Hung from the crown on four thin lines.
    for (const angle of LEG_ANGLES) mesh.Tube([AtAzimuth(angle, LIGHT_RING_RADIUS, z), AtAzimuth(angle, LIGHT_RING_RADIUS, CROWN_Z + 2)], 0.3, 4, "rope", false);
}

const materials = {
    vinyl: VINYL_MATERIAL,
    flag: `${MATERIAL_DIR}/${NAME}_flag.vmat`,
    ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])),
};

// Each piece: its builder (into the render mesh and, if solid, the collision
// mesh), how often it's placed and how.
const PIECES = [
    { piece: "leg", solid: true, Build: (m, p) => BuildLeg(m, p, LEG_ANGLES[0]), count: 4, place: "yaw 0 / 90 / 180 / 270" },
    { piece: "canopy", Build: m => BuildCanopy(m, ENTRANCE_SIDE), count: 4, place: "yaw 0 / 90 / 180 / 270" },
    { piece: "bunting", Build: m => BuildBunting(m, ENTRANCE_SIDE), count: 3, place: "yaw 90 / 180 / 270, not over the sign" },
    { piece: "sign", Build: BuildSign, count: 1, place: "yaw 0, the +X entrance" },
    { piece: "crown", Build: BuildCrown, count: 1, place: "" },
    { piece: "light", Build: BuildLight, count: 1, place: "" },
    { piece: "blower", solid: true, Build: (m, p) => BuildBlower(m, p, LEG_ANGLES[0]), count: 1, place: "the yaw of the leg it stands at" },
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

const flag = WriteFlag();
total += flag.triangles;
console.log(`  ${NAME}_flag.vmdl: ${flag.triangles} triangles, ${FLAG_SKELETON.length} bones, "wave" ${flag.frames} frames looping — 1x, a prop_dynamic, Idle Animation "wave", Loop Mode "Loop"`);

for (const [part, { rgb, tint, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint, glow }));
}
// The flag's checks: a 4 x 4 checkerboard, repeated by the UVs.
const flagTexture = `${MATERIAL_DIR}/${NAME}_flag_color.png`;
WriteAddonFile(flagTexture, EncodePng(64, 64, (x, y) => (((x >> 4) + (y >> 4)) % 2 ? [...COLORS.dark.rgb, 255] : [...COLORS.white.rgb, 255])));
WriteAddonFile(materials.flag, VmatText({ texture: flagTexture, generator: GENERATOR, tint: 0 }));

const top = FLAG_POLE_TOP + 1.6;
console.log(`all placed: ${total} triangles; every piece at the same origin (the middle, on the floor)`);
console.log(`legs at +-${CORNER}; ${2 * (CORNER + FOOT.plateRadius)} across the feet, side openings ${(2 * CORNER - 2 * TUBE_RADIUS).toFixed(0)} wide and `
    + `${HEM_MID_Z} high in the middle (${HEM_MID_Z - SIGN_GAP - SIGN_SIZE[1]} under the sign), crown at ${CROWN_Z.toFixed(0)}, ${top.toFixed(0)} high with the flag; `
    + `stakes ${(REACH + ROPE_OUT).toFixed(0)} out on the diagonals`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<piece>.vmdl"`);
