// Builds a shopping cart a melon can ride in — `node tools/models/make-shopping-cart-model.mjs`:
// a chrome wire basket (wider at the top, rims round its top and bottom,
// upright wires, a wire floor) on a chassis with a wire rack under it, four
// swivel casters with dark rubber wheels, two back legs up to the push
// handle with a plastic grip, a plastic plate on the front. Sized for a
// melon: the basket's floor (BASKET_BOTTOM) holds one sitting in it, a
// jump gets it in and out.
// A physics prop (prop_physics), plain physics — no script: a melon bumping
// into it pushes it (and whoever sits in it) across the floor.
// Its collision: convex hulls (each its own .obj — a moving body can't use a
// concave mesh): the floor, the four walls, the chassis, the handle, a block
// per wheel (the only parts touching the ground). MASS_KG, a little more than
// a melon (2): one bump sends it off, it doesn't fly away.
// The plastic (grip, plate, caster caps) is white and tinted per prop by its
// render color; chrome and rubber aren't.
// Origin on the floor under the basket's middle, the front facing +X, the
// handle at -X.
// Writes models/melon_racer/shopping_cart/shopping_cart.vmdl (+ .obj,
// _hull_<piece>.obj) and materials/melon_racer/shopping_cart/
// shopping_cart_{chrome,rubber,plastic}.vmat (+ _color.png).
// Compile the .vmdl with resourcecompiler (see the output).
import { ChamferedRect, Mesh, ObjText, Shape, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- Measures (units; a melon is about 15 across) ---
const BASKET_BOTTOM = { x0: -14, x1: 16, y: 11, z: 12 }; // the basket's floor: x from..to, y half, height
const BASKET_TOP = { x0: -17, x1: 19, y: 13.5, z: 28 }; // its top rim
const CORNER = 2.5; // the basket's corners rounded this much (in plan)
const CORNER_STEPS = 2; // points per rounded corner
const WIRE = { radius: 0.32, sides: 4, step: 3.5 }; // the basket's wires, `step` apart
const RIM = { radius: 0.85, sides: 6 }; // the rims round the basket's top and bottom
const RAILS = [0.36, 0.68]; // horizontal wires round the basket, share of its height
const CHASSIS = { x0: -13, x1: 15, y: 9.5, z: 7, radius: 0.9, sides: 6 }; // the frame under the basket
const RACK = { z: 6.4 }; // the wire rack in it
const WHEEL = { radius: 2.6, width: 1.6, sides: 10, xs: [-11.5, 13.5], y: 9.5 };
const CASTER = { plate: 1.6, plateHeight: 0.8, fork: 0.35, sides: 6 };
const LEG = { radius: 0.9, sides: 6 }; // the back legs, from the chassis up to the handle
const HANDLE = { x: -20, z: 34, y: 13, radius: 0.8, grip: 1.35, gripY: 10.5, sides: 8 };
const PLATE = { width: 16, height: 6, thickness: 0.6, z: 20 }; // the plastic plate on the front
const WALL_HULL = 1.8; // the walls' collision this thick (a fast melon mustn't pass through)
const MASS_KG = 3;
const LINEAR_DAMPING = 0; // only the floor's friction slows it
const ANGULAR_DAMPING = 1.5; // it doesn't keep spinning

const COLORS = {
    chrome: { rgb: [0xd8, 0xdc, 0xe0], metalness: 1, tint: 0 },
    rubber: { rgb: [0x22, 0x24, 0x28], metalness: 0, tint: 0 },
    plastic: { rgb: [0xf2, 0xf2, 0xf2], metalness: 0, tint: 1 }, // tinted per prop
};

const NAME = "shopping_cart";
const MODEL_DIR = "models/melon_racer/shopping_cart";
const MATERIAL_DIR = "materials/melon_racer/shopping_cart";
const GENERATOR = "tools/models/make-shopping-cart-model.mjs";

const Lerp = (a, b, k) => a + (b - a) * k;

/** The basket's outline at height share h (0 floor, 1 rim), closed (last = first), counter-clockwise. */
function Outline(h) {
    const x0 = Lerp(BASKET_BOTTOM.x0, BASKET_TOP.x0, h), x1 = Lerp(BASKET_BOTTOM.x1, BASKET_TOP.x1, h);
    const y = Lerp(BASKET_BOTTOM.y, BASKET_TOP.y, h), z = Lerp(BASKET_BOTTOM.z, BASKET_TOP.z, h);
    const points = [];
    for (const [cx, cy, a0] of [[x1 - CORNER, -y + CORNER, -Math.PI / 2], [x1 - CORNER, y - CORNER, 0], [x0 + CORNER, y - CORNER, Math.PI / 2], [x0 + CORNER, -y + CORNER, Math.PI]]) {
        for (let k = 0; k <= CORNER_STEPS; k++) {
            const a = a0 + (Math.PI / 2) * (k / CORNER_STEPS);
            points.push([cx + CORNER * Math.cos(a), cy + CORNER * Math.sin(a), z]);
        }
    }
    points.push(points[0]);
    return points;
}

/** The point `s` (0..1) of the way round a closed outline. */
function AlongOutline(points, s) {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(...V3.Sub(points[i], points[i - 1])));
    const at = s * lengths.at(-1);
    let i = 1;
    while (i < points.length - 1 && lengths[i] < at) i++;
    const k = (at - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
    return points[i - 1].map((n, j) => n + (points[i][j] - n) * k);
}

function BuildBasket(mesh) {
    mesh.Tube(Outline(1), RIM.radius, RIM.sides, "chrome", false);
    mesh.Tube(Outline(0), RIM.radius * 0.8, RIM.sides, "chrome", false);
    for (const h of RAILS) mesh.Tube(Outline(h), WIRE.radius, WIRE.sides, "chrome", false);
    // Upright wires, evenly round: the same share of the way round at the bottom and the top.
    const bottom = Outline(0), top = Outline(1);
    const perimeter = bottom.slice(1).reduce((sum, p, i) => sum + Math.hypot(...V3.Sub(p, bottom[i])), 0);
    const count = Math.round(perimeter / WIRE.step);
    for (let i = 0; i < count; i++) mesh.Tube([AlongOutline(bottom, i / count), AlongOutline(top, i / count)], WIRE.radius, WIRE.sides, "chrome", false);
    // The floor: wires along it, two across.
    const { x0, x1, y, z } = BASKET_BOTTOM;
    for (let wy = -y + WIRE.step; wy < y - 0.5; wy += WIRE.step) mesh.Tube([[x0 + 0.5, wy, z], [x1 - 0.5, wy, z]], WIRE.radius, WIRE.sides, "chrome", false);
    for (const wx of [Lerp(x0, x1, 0.3), Lerp(x0, x1, 0.7)]) mesh.Tube([[wx, -y + 0.5, z - 0.4], [wx, y - 0.5, z - 0.4]], WIRE.radius, WIRE.sides, "chrome", false);
}

function BuildChassis(mesh) {
    const { x0, x1, y, z, radius, sides } = CHASSIS;
    // Two rails along, crossbars at both ends, struts up to the basket's floor.
    for (const sy of [-y, y]) mesh.Tube([[x0, sy, z], [x1, sy, z]], radius, sides, "chrome");
    for (const sx of [x0, x1]) mesh.Tube([[sx, -y, z], [sx, y, z]], radius, sides, "chrome");
    for (const sx of [x0 + 2, x1 - 2]) for (const sy of [-y, y]) {
        mesh.Tube([[sx, sy, z], [sx + (sx < 0 ? -1 : 1) * 0.5, sy * (BASKET_BOTTOM.y / y) * 0.95, BASKET_BOTTOM.z]], WIRE.radius * 1.6, WIRE.sides, "chrome", false);
    }
    // The rack: wires along between the end crossbars.
    for (let wy = -y + WIRE.step; wy < y - 0.5; wy += WIRE.step) mesh.Tube([[x0, wy, RACK.z], [x1, wy, RACK.z]], WIRE.radius, WIRE.sides, "chrome", false);
    // The back legs, from the chassis's back corners up past the basket to the handle.
    for (const sy of [-1, 1]) {
        const foot = [x0, sy * y, z], top = [HANDLE.x, sy * HANDLE.y, HANDLE.z];
        mesh.Tube([foot, [x0 - 2.5, sy * (y + 2.5), BASKET_TOP.z - 4], top], LEG.radius, LEG.sides, "chrome", false);
    }
    // The handle: a chrome bar, a plastic grip on it, end caps.
    mesh.Tube([[HANDLE.x, -HANDLE.y, HANDLE.z], [HANDLE.x, HANDLE.y, HANDLE.z]], HANDLE.radius, HANDLE.sides, "chrome");
    mesh.Tube([[HANDLE.x, -HANDLE.gripY, HANDLE.z], [HANDLE.x, HANDLE.gripY, HANDLE.z]], HANDLE.grip, HANDLE.sides, "plastic");
    for (const sy of [-1, 1]) mesh.Tube([[HANDLE.x, sy * (HANDLE.y - 0.2), HANDLE.z], [HANDLE.x, sy * (HANDLE.y + 1), HANDLE.z]], HANDLE.radius * 1.4, HANDLE.sides, "plastic");
}

function BuildWheels(mesh) {
    for (const x of WHEEL.xs) for (const sy of [-1, 1]) {
        const y = sy * WHEEL.y, axle = WHEEL.radius;
        // Swivel plate under the chassis, plastic cap on it, the fork down to the axle.
        mesh.Tube([[x, y, CHASSIS.z - CHASSIS.radius - CASTER.plateHeight], [x, y, CHASSIS.z - CHASSIS.radius]], CASTER.plate, CASTER.sides, "plastic");
        for (const side of [-1, 1]) {
            const fy = y + side * (WHEEL.width / 2 + 0.4);
            mesh.Tube([[x, fy, CHASSIS.z - CHASSIS.radius - CASTER.plateHeight], [x - 1, fy, axle]], CASTER.fork, 4, "chrome");
        }
        // The wheel and its hub.
        mesh.Tube([[x - 1, y - WHEEL.width / 2, axle], [x - 1, y + WHEEL.width / 2, axle]], WHEEL.radius, WHEEL.sides, "rubber");
        mesh.Tube([[x - 1, y - WHEEL.width / 2 - 0.3, axle], [x - 1, y + WHEEL.width / 2 + 0.3, axle]], WHEEL.radius * 0.4, 6, "chrome");
    }
}

function BuildPlate(mesh) {
    // On the front wall, leaning out with it.
    const h = (PLATE.z - BASKET_BOTTOM.z) / (BASKET_TOP.z - BASKET_BOTTOM.z);
    const x = Lerp(BASKET_BOTTOM.x1, BASKET_TOP.x1, h) + 0.4;
    mesh.Extrude(Shape(ChamferedRect(0, PLATE.z, PLATE.width, PLATE.height, 1)), x, x + PLATE.thickness, "plastic", "x");
}

// --- Collision: convex hulls ---

/** A convex hull from its corners (an .obj of their triangles — ModelDoc hulls the points). */
function Hull(corners) {
    const mesh = new Mesh();
    const [a, b, c, d, e, f, g, h] = corners; // bottom a b c d, top e f g h, same order
    for (const [p, q, r, s] of [[a, b, c, d], [h, g, f, e], [a, e, f, b], [b, f, g, c], [c, g, h, d], [d, h, e, a]]) {
        mesh.Tri(p, q, r, "chrome");
        mesh.Tri(p, r, s, "chrome");
    }
    return mesh;
}
const Box = (x0, x1, y0, y1, z0, z1) => Hull([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);

function Hulls() {
    const b = BASKET_BOTTOM, t = BASKET_TOP, w = WALL_HULL;
    const hulls = {
        floor: { mesh: Box(b.x0, b.x1, -b.y, b.y, b.z - 1.5, b.z + 0.5) },
        // The walls: slabs from the floor's edge out to the rim's, WALL_HULL thick (outwards).
        front: { mesh: Hull([[b.x1, -b.y, b.z], [b.x1 + w, -b.y, b.z], [b.x1 + w, b.y, b.z], [b.x1, b.y, b.z], [t.x1, -t.y, t.z], [t.x1 + w, -t.y, t.z], [t.x1 + w, t.y, t.z], [t.x1, t.y, t.z]]) },
        back: { mesh: Hull([[b.x0 - w, -b.y, b.z], [b.x0, -b.y, b.z], [b.x0, b.y, b.z], [b.x0 - w, b.y, b.z], [t.x0 - w, -t.y, t.z], [t.x0, -t.y, t.z], [t.x0, t.y, t.z], [t.x0 - w, t.y, t.z]]) },
        left: { mesh: Hull([[b.x0, b.y, b.z], [b.x1, b.y, b.z], [b.x1, b.y + w, b.z], [b.x0, b.y + w, b.z], [t.x0, t.y, t.z], [t.x1, t.y, t.z], [t.x1, t.y + w, t.z], [t.x0, t.y + w, t.z]]) },
        right: { mesh: Hull([[b.x0, -b.y - w, b.z], [b.x1, -b.y - w, b.z], [b.x1, -b.y, b.z], [b.x0, -b.y, b.z], [t.x0, -t.y - w, t.z], [t.x1, -t.y - w, t.z], [t.x1, -t.y, t.z], [t.x0, -t.y, t.z]]) },
        chassis: { mesh: Box(CHASSIS.x0, CHASSIS.x1, -CHASSIS.y - 1, CHASSIS.y + 1, CHASSIS.z - 2, b.z - 1.5) },
        handle: { mesh: Box(HANDLE.x - 1.5, HANDLE.x + 1.5, -HANDLE.y - 1, HANDLE.y + 1, BASKET_TOP.z - 1, HANDLE.z + 1.5) },
    };
    for (const [i, x] of WHEEL.xs.entries()) for (const sy of [-1, 1]) {
        const y = sy * WHEEL.y;
        hulls[`wheel_${i}${sy < 0 ? "r" : "l"}`] = { mesh: Box(x - 1 - WHEEL.radius * 0.8, x - 1 + WHEEL.radius * 0.8, y - WHEEL.width / 2, y + WHEEL.width / 2, 0, CHASSIS.z - 2), surfaceProp: "rubber" };
    }
    return hulls;
}

// --- Write ---

const mesh = new Mesh(32);
BuildBasket(mesh);
BuildChassis(mesh);
BuildWheels(mesh);
BuildPlate(mesh);

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const hulls = Object.entries(Hulls()).map(([piece, { mesh: hull, surfaceProp = "metal" }]) => {
    const file = `${MODEL_DIR}/${NAME}_hull_${piece}.obj`;
    WriteAddonFile(file, ObjText(hull, NAME, GENERATOR));
    return { file, surfaceProp };
});
const obj = `${MODEL_DIR}/${NAME}.obj`;
WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({
    name: NAME, mesh: obj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])),
    hulls, body: { mass: MASS_KG, linearDamping: LINEAR_DAMPING, angularDamping: ANGULAR_DAMPING },
}));
for (const [part, { rgb, metalness, tint }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, metalness, tint }));
}
console.log(`${NAME}.vmdl: ${mesh.triangleCount} triangles, ${hulls.length} collision hulls, ${MASS_KG} kg; `
    + `${(HANDLE.x - 1.5).toFixed(0)}..${(BASKET_TOP.x1 + WALL_HULL).toFixed(0)} long, ${(2 * (BASKET_TOP.y + WALL_HULL)).toFixed(0)} wide, ${(HANDLE.z + HANDLE.grip).toFixed(0)} high; `
    + `basket floor ${BASKET_BOTTOM.x1 - BASKET_BOTTOM.x0} x ${2 * BASKET_BOTTOM.y} at ${BASKET_BOTTOM.z}, rim at ${BASKET_TOP.z}`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
