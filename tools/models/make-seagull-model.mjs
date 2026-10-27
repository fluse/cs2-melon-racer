// Builds a herring gull sitting on its nest Ã¢â‚¬â€ `node tools/models/make-seagull-model.mjs`:
// an eye-catcher on a ledge of the lighthouse parkour, low-poly and
// flat-shaded like the coast plants (make-coast-plant-model.mjs): every part
// a faceted blob Ã¢â‚¬â€ a convex polytope from seeded planes (tools/lib/inflatable.mjs),
// turned into place. Two models, same origin (the ledge's floor under the nest's middle):
//   seagull_nest  a nest of straw tufts round a flat bed, twigs sticking out, three olive eggs
//                 (visible without the gull); collision one low blob round it
//   seagull       the gull sitting, facing +X: white body, grey folded wings, black wing tips crossing
//                 over the tail, white head, yellow beak with a red spot; its belly SEAT up, so on the
//                 nest it sits at the same origin (alone on a rock: drop it SEAT)
// The gull's bones: root, body (at its belly), head (at the neck, a child of
// body). Animations:
//   wobble  looping, WOBBLE_SECONDS: the body sways and breathes, the head looks round Ã¢â‚¬â€ ahead, left,
//           ahead, right with its head cocked, a dip to preen Ã¢â‚¬â€, the idle wobble
//   idle    sitting still (one frame)
// Place it as a prop_dynamic with Idle Animation "wobble", Idle Animation Loop
// Mode "Loop"; several in view: give each its own start (the random start
// cycle keyvalue) so they don't look round in step. Collision: one blob round
// body and head on the root (the wobble is too small to matter).
// ModelDoc turns an .smd 90 degrees round Z; it's written turned back (Unturn,
// like the swing anchor), so in Hammer every axis is as written here.
// Writes models/melon_racer/seagull/seagull.{smd,vmdl} (+ _wobble/_idle.smd, _physics.obj),
// seagull_nest.{obj,vmdl} (+ _physics.obj) and materials/melon_racer/seagull/seagull_<part>.vmat.
// Compile the .vmdl files with resourcecompiler (see the output).
import { Polytope, PolytopePlanes } from "../lib/inflatable.mjs";
import { BindFrame, Beam, Mesh, MeshSmdTriangles, ObjText, SeededRandom, SmdAnimationText, SmdText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the melon is ~14 across): a gull ~34 long, sitting ---
const SEAT = 4; // the gull's belly over the origin: down in the nest's hollow
const BODY = { at: [0, 0, 7.5], half: [13, 8, 6.5], planes: 14 };
const WING = { at: [-3, 5, 10.8], half: [12, 3.6, 4.4], pitch: -12, planes: 10 }; // one side; mirrored for the other
const MANTLE = { at: [-2, 0, 13.4], half: [10.5, 5.5, 2.8], pitch: -10, planes: 9 }; // the grey back between the wings
const WING_TIP = { at: [-15.5, 2.4, 11.4], half: [7, 1.8, 1.8], yaw: 14, pitch: -10, planes: 8 }; // crossing over the tail
const TAIL = { at: [-13, 0, 9.2], half: [5, 4, 1.8], pitch: -14, planes: 8 };
const NECK = [8.5, 0, 12]; // the head bone's pivot
const HEAD = { at: [12, 0, 17.5], half: [5.2, 4.2, 4.8], planes: 12 };
const BEAK = { root: 15.8, tip: 22.5, z: 16.6, width: 1.5, height: 1.5, hook: 1.2 };
const EYE = { at: [14.2, 3.5, 18.8], size: 0.8 };
const NEST = { radius: 15, tufts: 9, tuft: [6.5, 4.5, 3.6], bed: [14, 14, 2], twigs: 8, eggs: 3 };

// --- the wobble ---
const FPS = 30;
const WOBBLE_SECONDS = 8;
// The head's way round: [share of the cycle, yaw (left +), pitch (down +), roll (cocked, towards +Y up)] in degrees, eased between.
const HEAD_KEYS = [
    [0, 0, 0, 0], [0.12, 0, 0, 0],
    [0.2, 38, -4, 0], [0.34, 38, -4, 0], // looking left
    [0.42, 0, 0, 0], [0.5, 0, 0, 0],
    [0.58, -34, 0, 16], [0.7, -34, 0, 16], // right, its head cocked
    [0.76, 0, 0, 0],
    [0.82, 10, 34, 0], [0.87, 4, 30, 0], // a dip, preening
    [0.93, 0, 0, 0], [1, 0, 0, 0],
];
const BODY_SWAY = 2.5; // degrees to each side, twice a cycle
const BODY_BREATH = 1.2; // degrees nose up and down, four breaths a cycle
const BODY_BOB = 0.25; // units up and down with each breath

const COLORS = {
    white: [0xf2, 0xf0, 0xea],
    grey: [0x9c, 0xa6, 0xb0], // a herring gull's mantle
    black: [0x24, 0x24, 0x26],
    beak: [0xf0, 0xc2, 0x30],
    red: [0xd2, 0x34, 0x2a],
    straw: [0xbc, 0xa2, 0x66],
    straw_dark: [0x7e, 0x68, 0x42],
    twig: [0x5e, 0x48, 0x32],
    egg: [0x8c, 0x88, 0x5c],
};

const NAME = "seagull";
const MODEL_DIR = "models/melon_racer/seagull";
const MATERIAL_DIR = "materials/melon_racer/seagull";
const GENERATOR = "tools/models/make-seagull-model.mjs";
const Rad = d => (d * Math.PI) / 180;

/** p turned `yaw` round Z, `pitch` round Y (nose down +) and `roll` round X, in that order of application: roll, pitch, yaw. */
function Turn([x, y, z], { yaw = 0, pitch = 0, roll = 0 }) {
    const r = Rad(roll), p = Rad(pitch), w = Rad(yaw);
    [y, z] = [y * Math.cos(r) - z * Math.sin(r), y * Math.sin(r) + z * Math.cos(r)];
    [x, z] = [x * Math.cos(p) + z * Math.sin(p), -x * Math.sin(p) + z * Math.cos(p)];
    return [x * Math.cos(w) - y * Math.sin(w), x * Math.sin(w) + y * Math.cos(w), z];
}

/** A faceted blob: a polytope over the ellipsoid `half`, turned by `turn` and moved to `at`, into every mesh of `targets`. */
function Blob(targets, { at, half, planes, ...turn }, seed, part) {
    const cut = PolytopePlanes({ half, lift: 0, seed }, { count: planes, minZ: -0.95, angleJitter: 0.25, depthJitter: 0.08, sink: half[2] * 0.9 });
    for (const { corners } of Polytope(cut)) {
        const p = corners.map(c => V3.Add(Turn(c, turn), at));
        for (let i = 1; i + 1 < p.length; i++) for (const mesh of targets) mesh.Tri(p[0], p[i], p[i + 1], part);
    }
}
/** The same blob mirrored to -Y (its triangles turned round, so they still face out). */
function MirroredBlob(mesh, blob, seed, part) {
    const half = new Mesh(64);
    Blob([half], blob, seed, part);
    for (const tris of Object.values(half.tris)) for (const tri of tris) {
        const [a, b, c] = tri.map(([v]) => half.v[v - 1]).map(([x, y, z]) => [x, -y, z]);
        mesh.Tri(a, c, b, part);
    }
}
/** A closed solid from its corners as triangles (each turned to face away from `inside`). */
function Solid(mesh, tris, inside, part) {
    for (const [a, b, c] of tris) {
        const n = V3.Cross(V3.Sub(b, a), V3.Sub(c, a)), mid = V3.Scale(V3.Add(V3.Add(a, b), c), 1 / 3);
        if (V3.Dot(n, V3.Sub(mid, inside)) >= 0) mesh.Tri(a, b, c, part); else mesh.Tri(a, c, b, part);
    }
}

/** The gull: body and wings into `body`, head, beak and eyes into `head` Ã¢â‚¬â€ all SEAT up. */
function BuildGull(body, head) {
    const Up = blob => ({ ...blob, at: V3.Add(blob.at, [0, 0, SEAT]) });
    Blob([body], Up(BODY), 3, "white");
    Blob([body], Up(TAIL), 7, "white");
    Blob([body], Up(MANTLE), 9, "grey");
    Blob([body], Up(WING), 11, "grey");
    MirroredBlob(body, Up(WING), 11, "grey");
    Blob([body], Up(WING_TIP), 13, "black");
    MirroredBlob(body, Up(WING_TIP), 17, "black");
    Blob([body], Up({ at: [7.5, 0, 12.5], half: [4.5, 4, 5], pitch: -30, planes: 8 }), 19, "white"); // the neck, into the head
    Blob([head], Up(HEAD), 23, "white");
    // The beak: a wedge from the head forward, its tip hooked down, the red spot under its end.
    const z = BEAK.z + SEAT, w = BEAK.width, h = BEAK.height;
    const root = [[BEAK.root, -w, z + h], [BEAK.root, w, z + h], [BEAK.root, w, z - h], [BEAK.root, -w, z - h]];
    const end = [BEAK.tip - 1.5, 0, z + h * 0.4], hook = [BEAK.tip, 0, z - BEAK.hook], chin = [BEAK.tip - 2.5, 0, z - h * 0.9];
    Solid(head, [
        [root[0], root[1], end], [root[1], root[2], end], [root[3], root[0], end],
        [root[2], root[3], chin], [root[2], chin, end], [root[3], end, chin],
        [end, chin, hook], [root[0], root[3], root[2]], [root[0], root[2], root[1]],
    ], [BEAK.root + 2, 0, z], "beak");
    head.Tri([BEAK.tip - 3.4, -0.9, z - h * 0.75], [BEAK.tip - 2.2, 0, z - h * 1.05], [BEAK.tip - 3.4, 0.9, z - h * 0.75], "red");
    for (const s of [-1, 1]) { // eyes: a tiny black pyramid each side
        const c = [EYE.at[0], s * EYE.at[1], EYE.at[2] + SEAT], r = EYE.size;
        const base = [[c[0] - r, c[1], c[2] - r], [c[0] + r, c[1], c[2] - r], [c[0], c[1], c[2] + r]], tip = [c[0], c[1] + s * r, c[2]];
        Solid(head, [[base[0], base[1], tip], [base[1], base[2], tip], [base[2], base[0], tip]], [c[0], c[1] - s, c[2]], "black");
    }
}

/** The nest: a flat bed, straw tufts round it, twigs sticking out, eggs in the hollow. */
function BuildNest(mesh, physics) {
    const random = SeededRandom(29);
    Blob([mesh], { at: [0, 0, 0.6], half: NEST.bed, planes: 9 }, 31, "straw_dark");
    for (let i = 0; i < NEST.tufts; i++) {
        const a = (2 * Math.PI * i) / NEST.tufts + random() * 0.3, r = NEST.radius * (0.9 + 0.2 * random());
        Blob([mesh], { at: [r * Math.cos(a), r * Math.sin(a), 2.6], half: NEST.tuft.map(n => n * (0.85 + 0.3 * random())), yaw: (a * 180) / Math.PI + 90, planes: 8 }, 37 + i, i % 3 ? "straw" : "straw_dark");
    }
    for (let i = 0; i < NEST.twigs; i++) { // sticking out of the rim, roughly along it
        const a = (2 * Math.PI * (i + 0.5)) / NEST.twigs + random() * 0.4, r = NEST.radius + 2, along = a + Math.PI / 2 + (random() - 0.5) * 0.8;
        const mid = [r * Math.cos(a), r * Math.sin(a), 3 + 2 * random()], half = 8 + 5 * random();
        const dir = [Math.cos(along), Math.sin(along), (random() - 0.5) * 0.3];
        Beam(mesh, V3.Sub(mid, V3.Scale(dir, half)), V3.Add(mid, V3.Scale(dir, half)), 1, 1, "twig");
    }
    for (let i = 0; i < NEST.eggs; i++) {
        const a = (2 * Math.PI * i) / NEST.eggs + 0.4;
        Blob([mesh], { at: [4 * Math.cos(a), 4 * Math.sin(a), 3.2], half: [3, 2.3, 2.3], yaw: (a * 180) / Math.PI, planes: 8 }, 53 + i, "egg");
    }
    Blob([physics], { at: [0, 0, 1], half: [NEST.radius + 6, NEST.radius + 6, 5], planes: 8 }, 61, "straw");
}

// --- skeleton and animations ---
// ModelDoc turns an .smd 90 degrees around Z ((x, y, z) -> (-y, x, z)): written turned back.
const Unturn = ([x, y, z]) => [y, -x, z];
const BELLY = [0, 0, SEAT];
const NECK_AT = V3.Add(NECK, [0, 0, SEAT]);
const BONES = [
    { name: "root", parent: -1, bind: [0, 0, 0] },
    { name: "body", parent: 0, bind: Unturn(BELLY) },
    { name: "head", parent: 1, bind: Unturn(V3.Sub(NECK_AT, BELLY)) },
];
const BODY_BONE = 1, HEAD_BONE = 2;
/** A bone's rotation in the file's frame from Hammer's yaw (round Z), pitch (round Y, nose down +), roll (round X). */
const Rot = ({ yaw = 0, pitch = 0, roll = 0 }) => [Rad(pitch), -Rad(roll), Rad(yaw)];
const Ease = t => t * t * (3 - 2 * t);
/** The head's [yaw, pitch, roll] at share f of the cycle, eased between HEAD_KEYS. */
function HeadAt(f) {
    const i = HEAD_KEYS.findIndex(([t], k) => k + 1 < HEAD_KEYS.length && f >= t && f <= HEAD_KEYS[k + 1][0]);
    const [t0, ...a] = HEAD_KEYS[i], [t1, ...b] = HEAD_KEYS[i + 1], e = Ease((f - t0) / (t1 - t0 || 1));
    return a.map((n, k) => n + (b[k] - n) * e);
}
function WobbleFrame(f) {
    const frame = BindFrame(BONES), t = 2 * Math.PI * f;
    frame[BODY_BONE].pos = Unturn(V3.Add(BELLY, [0, 0, BODY_BOB * Math.sin(4 * t)]));
    frame[BODY_BONE].rot = Rot({ roll: BODY_SWAY * Math.sin(2 * t), pitch: BODY_BREATH * Math.sin(4 * t) });
    const [yaw, pitch, roll] = HeadAt(f);
    frame[HEAD_BONE].rot = Rot({ yaw, pitch, roll });
    return frame;
}

const body = new Mesh(32), head = new Mesh(32);
BuildGull(body, head);
const gullPhysics = new Mesh();
Blob([gullPhysics], { at: [1, 0, 10 + SEAT], half: [17, 10, 10], planes: 10 }, 71, "white");
const nest = new Mesh(32), nestPhysics = new Mesh();
BuildNest(nest, nestPhysics);

const Turned = tris => tris.map(tri => ({ ...tri, corners: tri.corners.map(c => ({ ...c, p: Unturn(c.p), n: Unturn(c.n) })) }));
const triangles = Turned([...MeshSmdTriangles(body, NAME, BODY_BONE), ...MeshSmdTriangles(head, NAME, HEAD_BONE)]);
const frames = Math.round(WOBBLE_SECONDS * FPS);
const animations = [
    { name: "wobble", frames: Array.from({ length: frames }, (_, i) => WobbleFrame(i / frames)) }, // the last frame would repeat the first: left out
    { name: "idle", frames: [BindFrame(BONES)] },
].map(a => ({ ...a, file: `${MODEL_DIR}/${NAME}_${a.name}.smd`, looping: true }));
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
const Used = (...meshes) => Object.fromEntries(meshes.flatMap(m => Object.keys(m.tris)).map(p => [p, materials[p]]));

WriteAddonFile(`${MODEL_DIR}/${NAME}.smd`, SmdText(BONES, triangles));
for (const a of animations) WriteAddonFile(a.file, SmdAnimationText(BONES, a.frames));
// In Hammer's frame like the render mesh (written turned back), so no { smd: true } turn here.
WriteAddonFile(`${MODEL_DIR}/${NAME}_physics.obj`, ObjText(gullPhysics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({
    name: NAME,
    mesh: `${MODEL_DIR}/${NAME}.smd`,
    physicsObj: [{ file: `${MODEL_DIR}/${NAME}_physics.obj`, bone: "" }],
    materials: Used(body, head),
    animations: animations.map(({ name, file, looping }) => ({ name, file, looping })),
}));
const nestName = `${NAME}_nest`;
WriteAddonFile(`${MODEL_DIR}/${nestName}.obj`, ObjText(nest, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${nestName}_physics.obj`, ObjText(nestPhysics, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${nestName}.vmdl`, VmdlText({ name: NAME, mesh: `${MODEL_DIR}/${nestName}.obj`, physicsObj: `${MODEL_DIR}/${nestName}_physics.obj`, materials: Used(nest) }));
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
console.log(`${NAME}.vmdl: ${triangles.length} triangles (body ${body.triangleCount}, head ${head.triangleCount}; collision ${gullPhysics.triangleCount}), animations ${animations.map(a => `${a.name} (${a.frames.length})`).join(", ")}`);
console.log(`${nestName}.vmdl: ${nest.triangleCount} triangles, collision ${nestPhysics.triangleCount}; ${2 * (NEST.radius + NEST.tuft[0])} across`);
console.log(`the gull sits ${SEAT} up (its belly): on the nest at the nest's origin, alone ${SEAT} lower`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl" (and ${nestName}.vmdl)`);
