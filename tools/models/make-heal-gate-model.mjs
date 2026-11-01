// Builds the heal gate as a 3D model — `node tools/models/make-heal-gate-model.mjs`:
// an inflatable arch in the hub gates' style (tools/lib/inflatable.mjs) in
// place of heal_gate.vmap's three glowing bars, but smaller than a route gate
// and shaped like a door: taller than it is wide. A fat round tube bent into
// an upside-down U in the white inflatable vinyl (tinted by the prop's render
// color: heal cyan, docs/GAME_CI.md), pinched seams with dark straps, each
// leg standing in a squashed ring on a dark base plate and held by two guy
// ropes, a blower at the right foot. The heal details: a chain of glowing
// bulbs along the opening on the front and back, a puffy pharmacy green
// cross on the top (glowing, like the first-aid tent's), and the holo panel
// filling the opening, shaped to the arch, in the existing holo_heal.vmat
// (no collision: melons drive through it).
//
// Origin on the floor in the middle of the opening, the legs on either side
// along X, the melon driving through along Y — like the prefab's bars, whose
// floor is 48 below the prefab's origin. The opening is wider than the old
// bars': the prefab's heal_zone_full trigger is widened to match.
// Writes models/melon_racer/heal_gate/heal_gate.vmdl (+ .obj, _physics.obj:
// the tube, the feet, the blower) and materials/melon_racer/heal_gate/heal_gate_{dark,rope,bulb,cross}.vmat
// (+ _color.png). Compile the .vmdl with resourcecompiler (see the end of the output).
import { Blower, GuyRope, InflatableBlock, InflatableFoot, RopeLoop, SegmentedTube } from "../lib/inflatable.mjs";
import { Mesh, ObjText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- The arch (units; a melon is ~14 across; the route gate: 56 / 62 / 14) ---
const ARC_RADIUS = 44; // the tube's centerline: half the distance between the legs, and the arc's radius
const SPRING = 66; // where the legs turn into the arc
const TUBE_RADIUS = 9;
const TUBE_SIDES = 12; // around the tube: the lowest that still looks round and soft
const TUBE_STEP = 12; // units along the tube between rings, mid-segment
const SEGMENT_COUNT = 6;
const SEAM = { radius: 0.86, rounding: 3.5, rings: [0, 1, 3.5] };
const STRAP = { radius: TUBE_RADIUS * 0.93, halfWidth: 0.9, part: "dark" };
const FOOT = { plateRadius: 14, plateHeight: 2.5, platePart: "dark", radius: 13, height: 7, rings: 6, sides: TUBE_SIDES, part: "vinyl" };
const LEG_BOTTOM = FOOT.plateHeight + FOOT.height - 1; // the tube starts inside the ring
// Guy ropes: from the tube at ROPE_HEIGHT, front and back of each leg, to a
// stake ROPE_REACH out along Y and ROPE_SPREAD further out along X.
const ROPE_HEIGHT = 34;
const ROPE_REACH = 26;
const ROPE_SPREAD = 6;
const ROPE = { ropeRadius: 0.3, ropePart: "rope", stakeRadius: 0.6, stakeHeight: 2.5, stakePart: "dark" };
// The blower behind the right foot (-Y), its duct into the ring.
const BLOWER = { y: -24, size: [7, 8, 6], ductRadius: 2.2 };
// The bulbs: along the opening's edge, front and back, every BULB_SPACING units.
const BULB_SPACING = 11;
const BULB_RADIUS = 1.1;
const BULB_ANGLE = Math.PI / 4; // round the tube from the opening towards the front / back
// The cross on the top: two puffy bars through each other, facing +-Y.
const CROSS = { half: 11, arm: 3.8, thickness: 3.2, sink: 3, round: 0.32, rows: 6, cols: 12 };
const HOLO_UV_TILE = 128; // units per texture repeat, like the brush panel at Hammer's default scale
const PHYSICS_SIDES = 8;

// The vinyl: the shared white inflatable material, tinted by the entity's
// render color (tools/materials/make-inflatable.mjs). The rest isn't tinted.
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat";
const HOLO_MATERIAL = "materials/melon_racer/holo/holo_heal.vmat";
const COLORS = {
    dark: { rgb: [0x2b, 0x30, 0x38] }, // the hub gates' graphite: straps, plates, blower, stakes
    rope: { rgb: [0x1a, 0x1c, 0x20] },
    bulb: { rgb: [0xf4, 0xff, 0xfb], glow: 2 }, // a white just towards heal cyan
    cross: { rgb: [0x28, 0xff, 0x6e], glow: 2 }, // the heal holo gradient's pharmacy green, like the first-aid tent's crosses
};

const NAME = "heal_gate";
const MODEL_DIR = "models/melon_racer/heal_gate";
const MATERIAL_DIR = "materials/melon_racer/heal_gate";
const GENERATOR = "tools/models/make-heal-gate-model.mjs";

// The tube's centerline by length s: up the right leg, over the arc, down the left leg.
const LEG_LENGTH = SPRING - LEG_BOTTOM;
const ARC_LENGTH = Math.PI * ARC_RADIUS;
const PATH_LENGTH = 2 * LEG_LENGTH + ARC_LENGTH;
const BENDS = [LEG_LENGTH, LEG_LENGTH + ARC_LENGTH];
/** The centerline point s along, and the unit direction from it into the opening (in the XZ plane). */
function PathFrame(s) {
    if (s <= LEG_LENGTH) return { at: [ARC_RADIUS, 0, LEG_BOTTOM + s], inward: [-1, 0, 0] };
    if (s <= LEG_LENGTH + ARC_LENGTH) {
        const a = (s - LEG_LENGTH) / ARC_RADIUS;
        const c = Math.cos(a), n = Math.sin(a);
        return { at: [ARC_RADIUS * c, 0, SPRING + ARC_RADIUS * n], inward: [-c, 0, -n] };
    }
    return { at: [-ARC_RADIUS, 0, SPRING - (s - LEG_LENGTH - ARC_LENGTH)], inward: [1, 0, 0] };
}
const PathPoint = s => PathFrame(s).at;

/** An octahedron round c, its corners on the axes. */
function Bulb(mesh, [x, y, z], radius, part) {
    const top = [x, y, z + radius], bottom = [x, y, z - radius];
    const ring = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => [x + dx * radius, y + dy * radius, z]);
    for (let i = 0; i < 4; i++) {
        const a = ring[i], b = ring[(i + 1) % 4];
        mesh.Tri(a, b, top, part);
        mesh.Tri(b, a, bottom, part);
    }
}

function BuildGate(mesh, physics) {
    SegmentedTube(mesh, {
        At: PathPoint, length: PATH_LENGTH, bends: BENDS, segments: SEGMENT_COUNT,
        radius: TUBE_RADIUS, sides: TUBE_SIDES, step: TUBE_STEP, seam: SEAM, strap: STRAP, part: "vinyl",
    });
    for (const side of [-1, 1]) {
        const x = side * ARC_RADIUS;
        InflatableFoot(mesh, x, 0, FOOT);
        for (const front of [-1, 1]) {
            GuyRope(mesh, [x + side * 1.5, front * (TUBE_RADIUS - 1), ROPE_HEIGHT], [x + side * ROPE_SPREAD, front * ROPE_REACH], ROPE);
        }
        RopeLoop(mesh, x, 0, ROPE_HEIGHT, TUBE_RADIUS, TUBE_SIDES, "rope");
    }
    Blower(mesh, physics, {
        at: [ARC_RADIUS, BLOWER.y], into: [ARC_RADIUS, -FOOT.radius + 2, FOOT.plateHeight + FOOT.height / 2],
        size: BLOWER.size, ductRadius: BLOWER.ductRadius, ductLow: BLOWER.ductRadius + FOOT.plateHeight,
        boxPart: "dark", ringPart: "rope", ductPart: "vinyl",
    });

    // The bulbs, sitting on the tube's surface between the opening and its front / back, clear of the straps.
    const reach = TUBE_RADIUS + BULB_RADIUS * 0.3;
    const first = FOOT.height + BULB_SPACING / 2, count = Math.round((PATH_LENGTH - 2 * first) / BULB_SPACING) + 1;
    const step = (PATH_LENGTH - 2 * first) / (count - 1), segment = PATH_LENGTH / SEGMENT_COUNT;
    for (let i = 0; i < count; i++) {
        const s = first + i * step;
        const seamOffset = Math.abs(s / segment - Math.round(s / segment)) * segment;
        if (seamOffset < STRAP.halfWidth + BULB_RADIUS + 0.5) continue;
        const { at, inward } = PathFrame(s);
        for (const front of [-1, 1]) {
            const dir = [inward[0] * Math.cos(BULB_ANGLE), front * Math.sin(BULB_ANGLE), inward[2] * Math.cos(BULB_ANGLE)];
            Bulb(mesh, at.map((n, k) => n + dir[k] * reach), BULB_RADIUS, "bulb");
        }
    }

    // The cross on the top, sunk into the tube a little.
    const { half, arm, thickness, round, rows, cols } = CROSS;
    const center = [0, 0, SPRING + ARC_RADIUS + TUBE_RADIUS - CROSS.sink + half];
    InflatableBlock(mesh, { center, half: [arm, thickness, half], round, rows, cols, part: "cross" });
    InflatableBlock(mesh, { center, half: [half, thickness, arm], round, rows, cols, part: "cross" });

    // The holo panel filling the opening, both sides, its edge inside the tube: its texture upright like the brush panel's.
    const edge = ARC_RADIUS - TUBE_RADIUS + 1;
    const arc = Array.from({ length: 17 }, (_, i) => {
        const a = (Math.PI * i) / 16;
        return [edge * Math.cos(a), 0, SPRING + edge * Math.sin(a)];
    });
    const panel = [[edge, 0, 0], ...arc, [-edge, 0, 0]];
    const uvs = panel.map(([x, , z]) => [x / HOLO_UV_TILE, -z / HOLO_UV_TILE]);
    mesh.Face(panel, uvs, "holo");
    mesh.Face([...panel].reverse(), [...uvs].reverse(), "holo");

    // Collision: the tube (coarse), the feet; the blower is already in.
    const rings = Array.from({ length: 21 }, (_, i) => (PATH_LENGTH * i) / 20);
    physics.Tube([...rings, ...BENDS].sort((a, b) => a - b).map(PathPoint), TUBE_RADIUS, PHYSICS_SIDES, "vinyl");
    for (const x of [-ARC_RADIUS, ARC_RADIUS]) physics.Tube([[x, 0, 0], [x, 0, FOOT.plateHeight + FOOT.height]], FOOT.plateRadius, PHYSICS_SIDES, "vinyl");
    return center[2] + half;
}

const materials = {
    vinyl: VINYL_MATERIAL,
    holo: HOLO_MATERIAL,
    ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])),
};
const mesh = new Mesh(64);
const physics = new Mesh();
const top = BuildGate(mesh, physics);
const obj = `${MODEL_DIR}/${NAME}.obj`;
const physicsObj = `${MODEL_DIR}/${NAME}_physics.obj`;
WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials }));
for (const [part, { rgb, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, glow }));
}
const clear = ARC_RADIUS - TUBE_RADIUS;
console.log(`  ${NAME}: ${mesh.triangleCount} triangles (collision ${physics.triangleCount}); opening ${2 * clear} wide, ${SPRING + clear} high under the top; `
    + `${2 * (ARC_RADIUS + FOOT.plateRadius)} wide over the feet, ${top.toFixed(1)} high with the cross, ropes ${ROPE_REACH} out along Y`);
console.log(`place: prop_static ${MODEL_DIR}/${NAME}.vmdl in maps/prefabs/heal_gate.vmap at (0 0 -48), yaw 0, render color heal cyan 100 251 223; widen the trigger to x +-${clear}`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
