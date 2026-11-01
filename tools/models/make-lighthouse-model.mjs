// Builds the lighthouse parkour's lighthouse as a model — `node tools/models/make-lighthouse-model.mjs`:
// a tapering round tower in red and white bands on a granite foot, a green
// door, windows up the shaft where the stairs inside would be, a granite
// cornice on corbels carrying the gallery (the course's finish: a deck with an
// iron railing, open where the course comes in), on it the watch room with
// portholes, the lantern — glowing glass between iron mullions — under a red
// dome with a ventilator ball, a lightning rod and a weather vane.
// The measures the course depends on (shaft radius and height, gallery,
// opening, door, windows) are in tools/lib/lighthouse.mjs, shared with
// make-parkour-model.mjs, which winds its ramp round this shaft and prints
// where the prop goes and its yaw.
// The shaft is a polygon drawn round the true circle (its faces touch it), so
// the ramp's inner edge, laid along the circle, never leaves a gap.
// Collision: shaft, gallery deck, railing (a wall to bounce off), watch room +
// lantern + roof as one block. Writes
//   models/melon_racer/lighthouse/lighthouse.vmdl (+ .obj, _physics.obj)
//   materials/melon_racer/lighthouse/lighthouse_<part>.vmat (+ _color.png)
// Compile the .vmdl with resourcecompiler (see the output). Place it as a
// prop_static. Origin on the floor in the shaft's middle.
import { Box, Circle, Mesh, ObjText, Shape, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";
import { DOOR, GALLERY, SHAFT, ShaftRadius, WINDOW, WINDOWS } from "../lib/lighthouse.mjs";

// --- shape (units; the melon is ~14 across) ---
const H = SHAFT.height;
const FOOT = 160; // the granite foot
const BANDS = 7; // red and white above it, red first
const CORNICE = { drop: 56, out: 20 }; // the molding flaring out under the gallery
const CORBEL = { count: 16, drop: 72, width: 14 }; // brackets under the deck
const RAIL = { posts: 22, size: 5, bar: 6, mid: 20, inset: 6 };
const WATCH = { radius: 160, height: 96, cornice: 12, porthole: 12 };
const LANTERN = { pedestal: { radius: 140, height: 28 }, radius: 128, height: 160, mullion: 3.5, eave: 148 };
const DOME = { radius: 150, height: 120, steps: 6 };
const BALL = { radius: 18, steps: 6 };
const ROD = { height: 72, vane: 40 };

// --- tessellation: as low as still reads ---
const SHAFT_SIDES = 32; // the ramp follows it closely: round
const TOP_SIDES = 16; // watch room, lantern, roof
const GALLERY_SIDES = 32;
const BALL_SIDES = 12;

// --- look: the parkour's red and white, granite, graphite iron ---
const COLORS = {
    white: { rgb: [0xec, 0xec, 0xe8] },
    red: { rgb: [0xd8, 0x34, 0x2a] },
    stone: { rgb: [0xa8, 0xa2, 0x96] },
    iron: { rgb: [0x2b, 0x30, 0x38], metalness: 0.4 },
    glow: { rgb: [0xff, 0xe6, 0x80], tint: 0, glow: 2 },
    window: { rgb: [0x1c, 0x26, 0x30], metalness: 0.3 },
    door: { rgb: [0x2e, 0x5a, 0x44] },
    brass: { rgb: [0xb8, 0x8c, 0x3a], metalness: 0.6 },
};

const NAME = "lighthouse";
const MODEL_DIR = "models/melon_racer/lighthouse";
const MATERIAL_DIR = "materials/melon_racer/lighthouse";
const GENERATOR = "tools/models/make-lighthouse-model.mjs";

const Rad = deg => (deg * Math.PI) / 180;
const Out = deg => [Math.cos(Rad(deg)), Math.sin(Rad(deg)), 0];
const Along = deg => [-Math.sin(Rad(deg)), Math.cos(Rad(deg)), 0];
const UP = [0, 0, 1];
/** The polygon's radius for a true radius r: its faces touch the circle. */
const Around = (r, sides) => r / Math.cos(Math.PI / sides);
/** Mesh.Tube's polygon round Z has a corner every 360/sides degrees from 0: the nearest face's middle. */
const FaceAngle = (deg, sides) => { const step = 360 / sides; return step / 2 + Math.round((deg - step / 2) / step) * step; };

/** A frustum round Z from (z0, r0) to (z1, r1) as true radii, open at both ends, `sides` faces touching the circle. */
function Lathe(mesh, profile, sides, part, caps = false) {
    mesh.Tube(profile.map(([z]) => [0, 0, z]), i => Around(profile[i][1], sides), sides, part, caps, { slopedNormals: true });
}
/** A flat rectangle on the shaft's face at `deg`, its middle at height z, standing `out` off it (following the taper). */
function ShaftPanel(mesh, deg, z, width, height, out, part) {
    const a = FaceAngle(deg, SHAFT_SIDES), n = Out(a), u = Along(a);
    const At = (su, sz) => V3.Add(V3.Add(V3.Scale(n, ShaftRadius(z + sz) + out), V3.Scale(u, su)), [0, 0, z + sz]);
    const w = width / 2, h = height / 2;
    mesh.Face([At(-w, -h), At(w, -h), At(w, h), At(-w, h)], [[0, 0], [1, 0], [1, 1], [0, 1]], part);
}
/** A box against the shaft's face at `deg`: `out` its middle's distance off the face, half sizes [radial, along, up]. */
function ShaftBox(mesh, deg, z, out, half, part) {
    const a = FaceAngle(deg, SHAFT_SIDES);
    Box(mesh, V3.Add(V3.Scale(Out(a), ShaftRadius(z) + out), [0, 0, z]), [Out(a), Along(a), UP], half, part);
}
/** A ring sector round Z: rIn..rOut, from angle a0 to a1 (degrees), z0..z1. */
function Arc(mesh, rIn, rOut, a0, a1, steps, z0, z1, part) {
    const At = (r, i) => { const a = Rad(a0 + ((a1 - a0) * i) / steps); return [r * Math.cos(a), r * Math.sin(a)]; };
    const outline = [...Array.from({ length: steps + 1 }, (_, i) => At(rOut, i)), ...Array.from({ length: steps + 1 }, (_, i) => At(rIn, steps - i))];
    mesh.Extrude(Shape(outline), z0, z1, part, "z");
}
/** An upright polygon prism round Z (`sides` faces, one facing +X), true radius r. */
const Drum = (mesh, r, sides, z0, z1, part, topPart = part) => mesh.Extrude(Shape(Circle(0, 0, Around(r, sides), sides, Math.PI / sides)), z0, z1, part, "z", topPart);
/** A convex solid from its corner points: every face (lists of corner indices) turned to face away from the middle. */
function Solid(mesh, corners, faces, part) {
    const mid = V3.Scale(corners.reduce(V3.Add, [0, 0, 0]), 1 / corners.length);
    for (const face of faces) {
        let pts = face.map(i => corners[i]);
        const n = V3.Cross(V3.Sub(pts[1], pts[0]), V3.Sub(pts[2], pts[0]));
        if (V3.Dot(n, V3.Sub(pts[0], mid)) < 0) pts = pts.reverse();
        for (let i = 1; i + 1 < pts.length; i++) mesh.Tri(pts[0], pts[i], pts[i + 1], part);
    }
}

function Shaft(mesh) {
    Lathe(mesh, [[0, ShaftRadius(0)], [FOOT, ShaftRadius(FOOT)]], SHAFT_SIDES, "stone");
    for (let i = 0; i < BANDS; i++) {
        const z0 = FOOT + ((H - FOOT) * i) / BANDS, z1 = FOOT + ((H - FOOT) * (i + 1)) / BANDS;
        Lathe(mesh, [[z0, ShaftRadius(z0)], [z1, ShaftRadius(z1)]], SHAFT_SIDES, i % 2 ? "white" : "red");
    }
    // The door: a granite frame, the door, a little canopy over it.
    ShaftPanel(mesh, DOOR.angle, (DOOR.height + 20) / 2, DOOR.width + 24, DOOR.height + 20, 1.5, "stone");
    ShaftPanel(mesh, DOOR.angle, DOOR.height / 2, DOOR.width, DOOR.height, 2.5, "door");
    ShaftBox(mesh, DOOR.angle, DOOR.height + 26, 8, [8, DOOR.width / 2 + 16, 3], "stone");
    // The windows: frame, glass, sill and lintel.
    for (const [deg, z] of WINDOWS) {
        ShaftPanel(mesh, deg, z, WINDOW.width + 12, WINDOW.height + 12, 1.5, "stone");
        ShaftPanel(mesh, deg, z, WINDOW.width, WINDOW.height, 2.5, "window");
        ShaftBox(mesh, deg, z - WINDOW.height / 2 - 6, 3, [3, WINDOW.width / 2 + 9, 2], "stone");
        ShaftBox(mesh, deg, z + WINDOW.height / 2 + 7, 2.5, [2.5, WINDOW.width / 2 + 8, 3], "stone");
    }
    // The cornice flaring out under the gallery, the corbels under its deck.
    const zc = H - GALLERY.slab;
    Lathe(mesh, [[zc - CORNICE.drop, ShaftRadius(zc - CORNICE.drop)], [zc, ShaftRadius(zc) + CORNICE.out]], SHAFT_SIDES, "stone");
    for (let i = 0; i < CORBEL.count; i++) {
        const deg = (360 * (i + 0.5)) / CORBEL.count, n = Out(deg), u = Along(deg), w = CORBEL.width / 2;
        const rIn = ShaftRadius(zc - CORBEL.drop) - 2, rOut = GALLERY.radius - 16;
        const P = (r, s, z) => V3.Add(V3.Add(V3.Scale(n, r), V3.Scale(u, s)), [0, 0, z]);
        // A wedge: tall at the shaft, down to a point under the deck's edge.
        const corners = [P(rIn, -w, zc - CORBEL.drop), P(rIn, w, zc - CORBEL.drop), P(rIn, -w, zc), P(rIn, w, zc), P(rOut, -w, zc - 10), P(rOut, w, zc - 10), P(rOut, -w, zc), P(rOut, w, zc)];
        Solid(mesh, corners, [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]], "stone");
    }
}

function Gallery(mesh) {
    mesh.Extrude(Shape(Circle(0, 0, GALLERY.radius, GALLERY_SIDES)), H - GALLERY.slab, H, "stone", "z");
    // The railing, open over GALLERY.opening round +X: posts, a top and a middle bar.
    const a0 = GALLERY.opening / 2, a1 = 360 - GALLERY.opening / 2, steps = Math.ceil((a1 - a0) / (360 / GALLERY_SIDES));
    const r = GALLERY.radius - RAIL.inset;
    Arc(mesh, r - RAIL.size / 2, r + RAIL.size / 2, a0, a1, steps, H + GALLERY.rail - RAIL.bar, H + GALLERY.rail, "iron");
    Arc(mesh, r - 1.5, r + 1.5, a0, a1, steps, H + RAIL.mid - 2, H + RAIL.mid + 2, "iron");
    for (let i = 0; i < RAIL.posts; i++) {
        const deg = a0 + ((a1 - a0) * i) / (RAIL.posts - 1);
        Box(mesh, V3.Add(V3.Scale(Out(deg), r), [0, 0, H + GALLERY.rail / 2]), [Out(deg), Along(deg), UP], [RAIL.size / 2, RAIL.size / 2, GALLERY.rail / 2], "iron");
    }
}

function Top(mesh) {
    let z = H;
    // The watch room: portholes on three sides, a door towards the opening.
    Drum(mesh, WATCH.radius, TOP_SIDES, z, z + WATCH.height, "white");
    for (const deg of [90, 180, 270]) {
        const n = Out(deg), u = Along(deg), c = V3.Add(V3.Scale(n, WATCH.radius + 1), [0, 0, z + WATCH.height * 0.55]);
        const ring = Circle(0, 0, WATCH.porthole + 3, 8).map(([s, t]) => V3.Add(V3.Add(c, V3.Scale(u, s)), [0, 0, t]));
        const glass = Circle(0, 0, WATCH.porthole, 8).map(([s, t]) => V3.Add(V3.Add(V3.Add(c, V3.Scale(n, 1)), V3.Scale(u, s)), [0, 0, t]));
        mesh.Face(ring, ring.map(() => [0, 0]), "iron");
        mesh.Face(glass, glass.map(() => [0, 0]), "window");
    }
    const door = [[-20, 0], [20, 0], [20, 72], [-20, 72]].map(([s, t]) => [WATCH.radius + 1, s, z + t]);
    mesh.Face(door, [[0, 0], [1, 0], [1, 1], [0, 1]], "door");
    z += WATCH.height;
    Drum(mesh, WATCH.radius + 12, TOP_SIDES, z, z + WATCH.cornice, "red");
    z += WATCH.cornice;
    // The lantern: a pedestal, glowing glass between mullions, an eave.
    Drum(mesh, LANTERN.pedestal.radius, TOP_SIDES, z, z + LANTERN.pedestal.height, "red");
    z += LANTERN.pedestal.height;
    Drum(mesh, LANTERN.radius, TOP_SIDES, z, z + LANTERN.height, "glow");
    const glassMiddle = z + LANTERN.height / 2;
    for (const [x, y] of Circle(0, 0, Around(LANTERN.radius, TOP_SIDES), TOP_SIDES, Math.PI / TOP_SIDES)) {
        const deg = (Math.atan2(y, x) * 180) / Math.PI;
        Box(mesh, [x, y, z + LANTERN.height / 2], [Out(deg), Along(deg), UP], [LANTERN.mullion / 2, LANTERN.mullion / 2, LANTERN.height / 2], "iron");
    }
    z += LANTERN.height;
    Drum(mesh, LANTERN.eave, TOP_SIDES, z, z + 12, "red");
    z += 12;
    // The dome, the ventilator ball, the lightning rod with a weather vane.
    const dome = Array.from({ length: DOME.steps + 1 }, (_, i) => {
        const t = (i / DOME.steps) * Rad(84);
        return [z + DOME.height * Math.sin(t), DOME.radius * Math.cos(t)];
    });
    Lathe(mesh, dome, TOP_SIDES, "red", true);
    z += DOME.height - 4;
    const ball = Array.from({ length: BALL.steps + 1 }, (_, i) => {
        const t = Rad(-80 + (160 * i) / BALL.steps);
        return [z + BALL.radius + BALL.radius * Math.sin(t), BALL.radius * Math.cos(t)];
    });
    Lathe(mesh, ball, BALL_SIDES, "brass", true);
    z += 2 * BALL.radius;
    Box(mesh, [0, 0, z + ROD.height / 2], [[1, 0, 0], [0, 1, 0], UP], [1.5, 1.5, ROD.height / 2], "brass");
    Box(mesh, [4, 0, z + ROD.height * 0.6], [[1, 0, 0], [0, 1, 0], UP], [ROD.vane / 2, 0.75, 1.2], "brass");
    Box(mesh, [-ROD.vane / 2 + 8, 0, z + ROD.height * 0.6], [[1, 0, 0], [0, 1, 0], UP], [6, 0.75, 7], "brass");
    return { glassMiddle, top: z + ROD.height };
}

/** The collision: the shaft (the course's inner wall), the deck, the railing, the top as one block. */
function Physics() {
    const mesh = new Mesh();
    Lathe(mesh, [[0, ShaftRadius(0)], [H, ShaftRadius(H)]], SHAFT_SIDES, "white", true);
    mesh.Extrude(Shape(Circle(0, 0, GALLERY.radius, GALLERY_SIDES)), H - GALLERY.slab, H, "white", "z");
    const r = GALLERY.radius - RAIL.inset;
    Arc(mesh, r - RAIL.size / 2, r + RAIL.size / 2, GALLERY.opening / 2, 360 - GALLERY.opening / 2, Math.ceil((360 - GALLERY.opening) / (360 / GALLERY_SIDES)), H, H + GALLERY.rail, "white");
    Drum(mesh, WATCH.radius + 12, TOP_SIDES, H, H + WATCH.height + WATCH.cornice + LANTERN.pedestal.height + LANTERN.height + 12, "white");
    return mesh;
}

const mesh = new Mesh(64);
Shaft(mesh);
Gallery(mesh);
const { glassMiddle, top } = Top(mesh);
const physics = Physics();

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const obj = `${MODEL_DIR}/${NAME}.obj`, physicsObj = `${MODEL_DIR}/${NAME}_physics.obj`;
WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
for (const [part, { rgb, metalness = 0, tint = 1, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, metalness, tint, glow }));
}
console.log(`${NAME}.vmdl: ${mesh.triangleCount} triangles, collision ${physics.triangleCount}; shaft ${SHAFT.r0} -> ${SHAFT.r1} across ${H} up to the gallery (radius ${GALLERY.radius}), ${Math.round(top)} to the rod's tip`);
console.log(`light: a light_omni2 (warm, 255 230 128) in the lantern at 0 0 ${Math.round(glassMiddle)} from the origin; the beam turning round is up to Hammer (a light_spot parented to a func_rotating)`);
console.log(`place: prop_static, origin and yaw from make-parkour-model.mjs's output`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
