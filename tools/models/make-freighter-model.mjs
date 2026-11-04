// Builds the lighthouse parkour's container freighter as a model of its own —
// `node tools/models/make-freighter-model.mjs`: the hull of the parkour's
// freighter (make-parkour-model.mjs, 02_ships: same size, bands, bulbous bow,
// anchors, lifebuoys, bulwarks along the sides with the stern and the bow open
// to jump on and off), but instead of three fixed container stacks two gantry
// cranes, each carrying one container on its trolley — back and forth across
// the deck, a moving chicane: the two always on opposite sides.
//   shuttle   each trolley runs from one bulwark to the other and back
//             (SHUTTLE_SECONDS, held HOLD_SECONDS at each end), the second
//             crane half a cycle later; the container hanging under it lags
//             behind as it speeds up and slows down; looping
//   idle      both containers in the middle (one frame)
// Place it as a prop_dynamic with Idle Animation "shuttle", Idle Animation
// Loop Mode "Loop". A container is a wall like any other (bounces, wall
// jumps), being hit by one an impact like any other.
// Origin at the waterline (z 0) in the middle of the ship, the bow along +X;
// the deck DECK above it (the parkour's freighter deck: 224).
// Collision: the hull up to the deck, bulwarks, crane legs and beams on the
// root; each container on its own bone.
// ModelDoc turns an .smd 90 degrees round Z; it's written turned back (Unturn,
// like the swing anchor), so in Hammer every axis is as written here.
// Writes models/melon_racer/freighter/freighter.{smd,vmdl} (+ _shuttle/_idle.smd,
// _physics.obj, _physics_container_<n>.obj) and materials/melon_racer/freighter/freighter_<part>.vmat.
// Compile the .vmdl with resourcecompiler (see the output).
import { AxisBox, BindFrame, Beam, Circle, Mesh, MeshSmdTriangles, ObjText, Shape, SmdAnimationText, SmdText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the melon is ~14 across, a jump rises ~85) ---
const LENGTH = 896; // stern to stem along X
const WIDTH = 320; // across the deck
const DECK = 224; // above the waterline
const BOW = 160; // where the deck starts narrowing, back from the stem
const HULL = { keel: -64, bootTop: 10, sheer: 14 }; // the keel's depth, the dark band over the waterline, the stripe under the deck edge
const BOW_STATIONS = [0, 0.3, 0.55, 0.75, 0.9, 1]; // cross-sections along the bow, 0 where it starts narrowing
const BULWARK = { height: 32, thickness: 16 };
const CRANES = [-80, 128]; // the gantries' X (the parkour's two, between its stacks)
const GANTRY = { height: 256, beam: 18, leg: 4, legSpread: 40 }; // the beam's underside above the deck, its thickness; legs' radius, apart along X at the foot
const TROLLEY = { length: 24, width: 32, height: 12 };
const CONTAINER = { length: 112, width: 64, height: 60, lift: 10 }; // along X, across, high; its underside over the deck
const SPREADER = 6; // the frame on the container's roof the cables hold
const CLEARANCE = 4; // the least room between a swinging container and a bulwark

// --- animation ---
const FPS = 30;
const SHUTTLE_SECONDS = 10; // there and back
const HOLD_SECONDS = 1.5; // at each end
const LAG = 0.6; // how far the container swings back while the trolley speeds up: a share of the angle a real pendulum would
const GRAVITY = 800;

// --- tessellation ---
const CABLE_SIDES = 3;
const RIBS = 7; // corrugation ribs on each long side of a container

// --- look: the parkour's colors ---
const COLORS = {
    hull: { rgb: [0x26, 0x28, 0x2c] },
    antifouling: { rgb: [0x7a, 0x26, 0x20] },
    edge: { rgb: [0x2b, 0x30, 0x38] }, // graphite: the boot top, trolleys, cables
    white: { rgb: [0xec, 0xec, 0xe8] },
    steel: { rgb: [0x6e, 0x76, 0x7e], metalness: 0.3 }, // the deck
    yellow: { rgb: [0xf0, 0xb8, 0x24] }, // the gantries, the spreaders
    glass: { rgb: [0x22, 0x30, 0x3e], metalness: 0.4 },
    orange: { rgb: [0xe8, 0x7a, 0x1f] },
    container_1: { rgb: [0xd8, 0x34, 0x2a] }, // red
    container_2: { rgb: [0x3a, 0x8a, 0x4a] }, // green
};

const NAME = "freighter";
const MODEL_DIR = "models/melon_racer/freighter";
const MATERIAL_DIR = "materials/melon_racer/freighter";
const GENERATOR = "tools/models/make-freighter-model.mjs";

const X0 = -LENGTH / 2, X1 = LENGTH / 2, HALF = WIDTH / 2, INNER = HALF - BULWARK.thickness;
const BEAM_Z = DECK + GANTRY.height; // the gantry beam's underside
const TROLLEY_Z = BEAM_Z + GANTRY.beam; // the trolley rides on top of the beam: its underside
const CARGO_Z = DECK + CONTAINER.lift; // the container's underside
const TRAVEL = INNER - CONTAINER.width / 2 - CLEARANCE - 18; // the container's middle from the ship's middle at each end (18: room to swing, checked below)

/** A flat face from `points` turned to face `out`. */
function Quad(mesh, points, out, part) {
    const n = V3.Cross(V3.Sub(points[1], points[0]), V3.Sub(points[2], points[0]));
    if (V3.Dot(n, out) < 0) points = [...points].reverse();
    const nu = V3.Unit(n), across = Math.abs(nu[2]) > 0.7 ? null : V3.Unit(V3.Cross([0, 0, 1], nu));
    mesh.Face(points, points.map(p => (across ? [V3.Dot(p, across) / 128, p[2] / 128] : [p[0] / 128, p[1] / 128])), part);
}

/**
 * The hull lofted from cross-sections at five heights — keel, waterline, boot
 * top, the stripe's lower edge, deck — like the parkour's: flared, the stem
 * raked back, the transom narrowing below the deck. Returns HalfAt(x, z), its
 * half width there; adds a closed prism of the deck outline to `physics`.
 */
function Hull(mesh, physics) {
    const water = { z: 0, k: 0.86, sternK: 0.92, stern: 12, tip: BOW * 0.4, tipHalf: 4 };
    const top = { z: DECK, k: 1, sternK: 1, stern: 0, tip: 0, tipHalf: HALF / 2 };
    const Between = zz => Object.fromEntries(Object.keys(top).map(key => [key, water[key] + ((top[key] - water[key]) * zz) / DECK]));
    const keel = { z: HULL.keel, k: 0.5, sternK: 0.7, stern: 32, tip: BOW * 0.8, tipHalf: 3 };
    const levels = [keel, water, Between(HULL.bootTop), Between(DECK - HULL.sheer), top];
    const bands = ["antifouling", "edge", "hull", "white"];
    const aft = X0 + 96; // where the transom's narrowing ends
    const Station = (L, station) => {
        if (station === "stern") return [X0 + L.stern, L.k * L.sternK * HALF];
        if (station === "aft") return [aft, L.k * HALF];
        const s0 = X1 - BOW - L.tip * 0.6, s1 = X1 - L.tip;
        return [s0 + station * (s1 - s0), L.k * HALF + (L.tipHalf - L.k * HALF) * station ** 1.6];
    };
    const stations = ["stern", "aft", ...BOW_STATIONS];
    const pts = stations.map(station => levels.map(L => { const [x, w] = Station(L, station); return [-1, 1].map(side => [x, side * w, L.z]); }));
    for (let i = 0; i + 1 < stations.length; i++) {
        for (let l = 0; l + 1 < levels.length; l++) {
            for (const [k, side] of [[0, -1], [1, 1]]) { // in triangles: along the bow a quad isn't flat
                const a = pts[i][l][k], b = pts[i + 1][l][k], c = pts[i + 1][l + 1][k], d = pts[i][l + 1][k];
                Quad(mesh, [a, b, c], [0, side, 0], bands[l]);
                Quad(mesh, [a, c, d], [0, side, 0], bands[l]);
            }
        }
        Quad(mesh, [pts[i][0][0], pts[i + 1][0][0], pts[i + 1][0][1], pts[i][0][1]], [0, 0, -1], "antifouling");
        Quad(mesh, [pts[i][4][0], pts[i + 1][4][0], pts[i + 1][4][1], pts[i][4][1]], [0, 0, 1], "steel");
    }
    for (const [i, out] of [[0, [-1, 0, 0]], [stations.length - 1, [1, 0, 0]]]) { // the transom, the stem
        for (let l = 0; l + 1 < levels.length; l++) Quad(mesh, [pts[i][l][0], pts[i][l][1], pts[i][l + 1][1], pts[i][l + 1][0]], out, bands[l]);
    }
    // Collision: the deck's outline straight down to the waterline (under water nothing comes by).
    const outline = [...stations.map((_, i) => pts[i][4][1]), ...stations.map((_, i) => pts[i][4][0]).reverse()].map(([x, y]) => [x, y]);
    physics.Extrude(Shape(outline), -16, DECK, "hull", "z");
    return (x, zz) => {
        const L = zz >= 0 ? Between(Math.min(zz, DECK)) : keel;
        const [sStern, wStern] = Station(L, "stern"), [sAft, wAft] = Station(L, "aft"), [sBow] = Station(L, 0), [sTip] = Station(L, 1);
        if (x < sAft) return wStern + ((wAft - wStern) * (x - sStern)) / (sAft - sStern);
        return x < sBow ? wAft : Station(L, Math.min(1, (x - sBow) / (sTip - sBow)))[1];
    };
}

/** A ring facing out of the hull's side (side ±1): a lifebuoy at x, z, from y `thick` outwards. */
function SideRing(mesh, x, y, z, side, r, hole, thick, part, sides = 8) {
    const y1 = y + side * thick;
    mesh.Extrude([Shape(Circle(z, x, r, sides), [Circle(z, x, hole, sides)])[0]], Math.min(y, y1), Math.max(y, y1), part, "y");
}

const ship = new Mesh(128), shipPhysics = new Mesh();
const HalfAt = Hull(ship, shipPhysics);
// Bulwarks along the sides only: the stern and the bow stay open to jump on and off.
for (const side of [-1, 1]) {
    for (const target of [ship, shipPhysics]) AxisBox(target, [X0 + 32, Math.min(side * HALF, side * INNER), DECK], [X1 - BOW, Math.max(side * HALF, side * INNER), DECK + BULWARK.height], "hull");
}
// A white strake along the sides, lifebuoys on the bulwarks.
for (const side of [-1, 1]) {
    const w = HalfAt(0, DECK - 40);
    AxisBox(ship, [X0 + LENGTH * 0.04, Math.min(side * (w - 6), side * (w + 5)), DECK - 44], [X1 - BOW, Math.max(side * (w - 6), side * (w + 5)), DECK - 36], "white");
    for (const f of [0.08, 0.72]) SideRing(ship, X0 + LENGTH * f, side * HALF, DECK + 16, side, 10, 6, 3, "orange");
}
// A bulbous bow under the water, the anchors in their hawses on both sides of the bow.
ship.Tube([[X1 - 150, 0, -42], [X1 - 96, 0, -40], [X1 - 52, 0, -36], [X1 - 26, 0, -34], [X1 - 12, 0, -34]], i => [12, 22, 22, 16, 1][i], 8, "antifouling", true, { slopedNormals: true });
for (const side of [-1, 1]) {
    const x = X1 - BOW + 36, w = HalfAt(x, DECK - 40), Y = (a, b) => [Math.min(side * a, side * b), Math.max(side * a, side * b)];
    const [ya, yb] = Y(w - 4, w + 2), [yc, yd] = Y(w - 2, w + 5);
    AxisBox(ship, [x - 12, ya, DECK - 50], [x + 12, yb, DECK - 26], "edge");
    AxisBox(ship, [x - 3, yc, DECK - 96], [x + 3, yd, DECK - 38], "steel");
    AxisBox(ship, [x - 16, yc, DECK - 104], [x + 16, yd, DECK - 96], "steel");
}
// The gantries: two legs a side on the bulwarks, leaning in to the beam, the crane driver's cab under one end.
for (const x of CRANES) {
    for (const side of [-1, 1]) {
        for (const dx of [-GANTRY.legSpread, GANTRY.legSpread]) {
            const foot = [x + dx, side * (HALF - 8), DECK + BULWARK.height], head = [x + dx / 4, side * (HALF - 12), BEAM_Z];
            ship.Tube([foot, head], GANTRY.leg, 4, "yellow");
            Beam(shipPhysics, foot, head, GANTRY.leg * 2, GANTRY.leg * 2, "yellow", [0, 1, 0]);
        }
    }
    for (const target of [ship, shipPhysics]) AxisBox(target, [x - 14, -(HALF + 4), BEAM_Z], [x + 14, HALF + 4, TROLLEY_Z], "yellow");
    AxisBox(ship, [x - 14, HALF - 44, BEAM_Z - 36], [x + 14, HALF - 12, BEAM_Z], "white");
    AxisBox(ship, [x - 15, HALF - 40, BEAM_Z - 28], [x + 15, HALF - 16, BEAM_Z - 12], "glass");
}

/** A crane's moving part around x — trolley, cables, spreader, container — in its middle position (y 0). */
function BuildLoad(mesh, physics, x, part) {
    const { length: l, width: w, height: h } = CONTAINER, top = CARGO_Z + h;
    // The trolley on the beam, its wheels' housings hanging over both edges.
    AxisBox(mesh, [x - 18, -TROLLEY.width / 2, TROLLEY_Z], [x + 18, TROLLEY.width / 2, TROLLEY_Z + TROLLEY.height], "edge");
    for (const dx of [-17, 17]) AxisBox(mesh, [x + dx - 2, -TROLLEY.width / 2 + 2, BEAM_Z - 4], [x + dx + 2, TROLLEY.width / 2 - 2, TROLLEY_Z], "edge");
    // Two cables from under the trolley's ends down to the spreader.
    for (const dx of [-14, 14]) mesh.Tube([[x + dx, 0, BEAM_Z - 4], [x + dx * 2.5, 0, top + SPREADER]], 0.8, CABLE_SIDES, "edge", false);
    // The spreader: a yellow frame over the roof, a beam across at each end.
    AxisBox(mesh, [x - l / 2 + 4, -4, top], [x + l / 2 - 4, 4, top + SPREADER], "yellow");
    for (const dx of [-l / 2 + 14, l / 2 - 14]) AxisBox(mesh, [x + dx - 4, -w / 2 + 4, top], [x + dx + 4, w / 2 - 4, top + SPREADER], "yellow");
    // The container: a box, ribbed along its long sides, a frame round its door end (to the stern), the doors' bars.
    for (const target of [mesh, physics]) AxisBox(target, [x - l / 2, -w / 2, CARGO_Z], [x + l / 2, w / 2, top], part);
    const rib = (l - 16) / RIBS;
    for (const side of [-1, 1]) for (let i = 0; i < RIBS; i++) {
        const rx = x - l / 2 + 8 + rib * (i + 0.5);
        AxisBox(mesh, [rx - rib / 4, Math.min(side * w / 2, side * (w / 2 + 1.5)), CARGO_Z + 4], [rx + rib / 4, Math.max(side * w / 2, side * (w / 2 + 1.5)), top - 4], part);
    }
    AxisBox(mesh, [x - l / 2 - 1.5, -w / 2, CARGO_Z], [x - l / 2, w / 2, top], "edge");
    for (const dy of [-w / 4, w / 4]) AxisBox(mesh, [x - l / 2 - 3, dy - 1, CARGO_Z + 4], [x - l / 2 - 1.5, dy + 1, top - 4], "steel");
}

// --- skeleton: the ship on the root, per crane a trolley running across and the load swinging under it ---
// ModelDoc turns an .smd 90 degrees around Z ((x, y, z) -> (-y, x, z)): written turned back.
const Unturn = ([x, y, z]) => [y, -x, z];
const BONES = [{ name: "root", parent: -1, bind: [0, 0, 0] }];
CRANES.forEach((x, i) => {
    BONES.push({ name: `trolley_${i + 1}`, parent: 0, bind: Unturn([x, 0, BEAM_Z]) });
    BONES.push({ name: `container_${i + 1}`, parent: BONES.length - 1, bind: [0, 0, 0] });
});
const TrolleyBone = i => 1 + 2 * i, LoadBone = i => 2 + 2 * i;

/** Where trolley `i` is t seconds into the shuttle (its y) and how far its load swings round X (degrees, + towards +Y). */
function Shuttle(i, t) {
    const move = SHUTTLE_SECONDS / 2 - HOLD_SECONDS; // one way
    const Y = tt => {
        let u = (((tt / SHUTTLE_SECONDS + i / 2) % 1) + 1) % 1 * SHUTTLE_SECONDS; // the second crane half a cycle on
        const back = u >= SHUTTLE_SECONDS / 2;
        if (back) u -= SHUTTLE_SECONDS / 2;
        const f = u < HOLD_SECONDS ? 0 : (1 - Math.cos((Math.PI * (u - HOLD_SECONDS)) / move)) / 2; // eased in and out
        return (back ? 1 : -1) * TRAVEL * (1 - 2 * f);
    };
    const dt = 1 / FPS, acceleration = (Y(t + dt) - 2 * Y(t) + Y(t - dt)) / (dt * dt);
    return { y: Y(t), swing: -LAG * Math.atan2(acceleration, GRAVITY) * (180 / Math.PI) }; // lags behind: swings against the acceleration
}
const Rad = d => (d * Math.PI) / 180;
/** The skeleton t seconds in (null: the bind pose, both in the middle). */
function ShuttleFrame(t) {
    const frame = BindFrame(BONES);
    if (t === null) return frame;
    CRANES.forEach((x, i) => {
        const { y, swing } = Shuttle(i, t);
        frame[TrolleyBone(i)].pos = Unturn([x, y, BEAM_Z]);
        frame[LoadBone(i)].rot = [0, -Rad(swing), 0]; // round Hammer's X = the file's -Y
    });
    return frame;
}

const loads = CRANES.map((x, i) => {
    const mesh = new Mesh(64), physics = new Mesh();
    BuildLoad(mesh, physics, x, `container_${i + 1}`);
    return { mesh, physics };
});
// Every frame must keep the swinging containers off the bulwarks (both ways round, so a mirrored rotation can't sneak in).
const frames = Math.round(SHUTTLE_SECONDS * FPS);
let closest = Infinity, steepest = 0;
loads.forEach(({ physics }, i) => {
    for (let f = 0; f < frames; f++) {
        const { y, swing } = Shuttle(i, f / FPS);
        steepest = Math.max(steepest, Math.abs(swing));
        for (const sign of [1, -1]) {
            const a = Rad(sign * swing);
            const ys = physics.v.map(([, py, pz]) => { const dz = pz - BEAM_Z; return y + py * Math.cos(a) - dz * Math.sin(a); });
            const room = INNER - Math.max(...ys.map(Math.abs));
            if (room < CLEARANCE) throw new Error(`container ${i + 1} comes within ${room.toFixed(1)} of a bulwark (${(f / FPS).toFixed(2)} s in): lower TRAVEL or LAG`);
            closest = Math.min(closest, room);
        }
    }
});

const Turned = tris => tris.map(tri => ({ ...tri, corners: tri.corners.map(c => ({ ...c, p: Unturn(c.p), n: Unturn(c.n) })) }));
const triangles = Turned([...MeshSmdTriangles(ship, NAME, 0), ...loads.flatMap(({ mesh }, i) => MeshSmdTriangles(mesh, NAME, LoadBone(i)))]);
const animations = [
    { name: "shuttle", frames: Array.from({ length: frames }, (_, f) => ShuttleFrame(f / FPS)) }, // the last frame would repeat the first: left out
    { name: "idle", frames: [ShuttleFrame(null)] },
].map(a => ({ ...a, file: `${MODEL_DIR}/${NAME}_${a.name}.smd`, looping: true }));
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`${MODEL_DIR}/${NAME}.smd`, SmdText(BONES, triangles));
for (const a of animations) WriteAddonFile(a.file, SmdAnimationText(BONES, a.frames));
// In Hammer's frame like the render mesh (written turned back), so no { smd: true } turn here.
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics.obj`, ObjText(shipPhysics, NAME, GENERATOR));
loads.forEach(({ physics }, i) => WriteAddonFile(`${MODEL_DIR}/${NAME}_physics_container_${i + 1}.obj`, ObjText(physics, NAME, GENERATOR)));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({
    name: NAME,
    mesh: `${MODEL_DIR}/${NAME}.smd`,
    physicsObj: [
        { file: `${MODEL_DIR}/${NAME}_physics.obj`, bone: "" },
        ...loads.map((_, i) => ({ file: `${MODEL_DIR}/${NAME}_physics_container_${i + 1}.obj`, bone: `container_${i + 1}` })),
    ],
    materials,
    animations: animations.map(({ name, file, looping }) => ({ name, file, looping })),
    surfaceProp: "metal",
}));
for (const [part, { rgb, metalness = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, metalness, tint: 0 }));
}
console.log(`${triangles.length} triangles (ship ${ship.triangleCount}, per crane load ${loads[0].mesh.triangleCount}; collision ${shipPhysics.triangleCount} + ${loads.map(l => l.physics.triangleCount).join(" + ")}); `
    + `shuttle ${animations[0].frames.length} frames (${SHUTTLE_SECONDS} s, held ${HOLD_SECONDS} s at each end), swinging up to ${steepest.toFixed(1)} deg, at its closest ${closest.toFixed(0)} off a bulwark`);
console.log(`${LENGTH} long, ${WIDTH} wide, the deck ${DECK} above the origin (waterline); the containers ${CONTAINER.length} x ${CONTAINER.width} x ${CONTAINER.height}, ${CONTAINER.lift} over the deck, `
    + `their middles +-${TRAVEL.toFixed(0)} across: ${(INNER - TRAVEL - CONTAINER.width / 2).toFixed(0)} free beside one at an end`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
