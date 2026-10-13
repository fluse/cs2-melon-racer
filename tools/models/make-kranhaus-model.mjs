// Builds a crane house after Cologne's Kranhaeuser in the Rheinauhafen as
// mesh geometry for Hammer — `node tools/models/make-kranhaus-model.mjs`: an
// upside-down L, HEIGHT tall. A tower of FLOORS floors stands at one end; on
// top of it the arm (ARM_FLOORS floors) reaches out along +X, carried halfway
// by a second leg — a glazed stair tower, an open passage between it and the
// tower — and cantilevering past that. A canyon splits the arm's end down
// the middle: cut into its end face, CANYON.length back along the arm, through
// the concrete slab under it up to the roof. Every glass facade of tower and arm is
// hung with balconies, checkered: on each floor every other bay, shifted by
// one bay from floor to floor, the Kranhaus' staggered look. White slab
// edges (the balconies only their slabs), a white concrete frame lining the
// inside of the L — a pillar at the tower's inner edge and a slab under the
// arm, one module / one floor thick, standing proud of the facades — a low parapet
// round the flat roof.
// Writes
//   models/melon_racer/kranhaus.dmx  for Hammer's File > Import: edit it like
//                                    any mesh, collision from the mesh itself
//   materials/melon_racer/kranhaus/kranhaus_<part>.vmat (+ _color.png; the
//                                    facades textures of 4 x 4 window modules,
//                                    one module FLOOR wide and one floor high)
// Origin: on the floor, in the middle of the tower's outer (-X) face; the arm
// runs along +X. The roof is flat with a parapet PARAPET high all round (a
// wall melons bounce off): it can be driven on.
import { DmxText, Mesh, SeededRandom, Shape, SolidPng, VmatText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

// --- The building ---
const HEIGHT = 1600; // floor to the parapet's top
const FLOORS = 17; // ground floor included
const ARM_FLOORS = 7; // the top floors, the arm
const PARAPET = 32; // round the roof
const FLOOR = (HEIGHT - PARAPET) / FLOORS; // one floor's height, and one window module's width
// Lengths in window modules, so the facade textures line up with every corner.
const MODULES = { tower: 7, gap: 4, stair: 3, cantilever: 6, depth: 6 }; // along X: tower (its last module the concrete pillar), the open passage under the arm, stair tower, the cantilever past it; across: the depth of tower and arm
const CANYON = { width: 1, length: 6 }; // modules: the canyon in the middle of the arm's end, how wide and how far back along the arm
const STAIR_DEPTH = 4; // modules: the stair tower is set back from the arm's faces
const FRAME = FLOOR; // the concrete frame: the pillar one module wide, the slab under the arm (the arm's lowest floor) one floor high
const FRAME_PROUD = 8; // how far it stands out of the facades

// --- The balconies ---
const BAY = 2; // modules per balcony bay
const BALCONY = { depth: 48, gap: 16, slab: 8 }; // out from the facade; gap between neighbours; slab thickness

const COLORS = {
    slab: [0xe6, 0xe5, 0xe0], // balcony slabs, the parapet: white
    roof: [0x86, 0x86, 0x82], // gravel
    concrete: [0xe4, 0xe2, 0xdc], // the frame inside the L: white
};
const METAL = {};

const NAME = "kranhaus";
const MATERIAL_DIR = "materials/melon_racer/kranhaus";
const GENERATOR = "tools/models/make-kranhaus-model.mjs";

const TILE = 4; // modules per texture repeat, each way
const mesh = new Mesh(TILE * FLOOR);
/** A rectangle's outline [x0, y0]..[x1, y1], counter-clockwise. */
const RectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** Extrudes shapes upwards as a shell of its own (the building's solids touch and overlap; see Mesh.NewShell). */
function Solid(shapes, z0, z1, part, topPart = part) {
    mesh.NewShell();
    mesh.Extrude(shapes, z0, z1, part, "z", topPart);
}
/** An upright box: x0..x1, y0..y1, z0..z1 (the bounds in either order). */
const Box = (x0, y0, x1, y1, z0, z1, part, topPart = part) =>
    Solid(Shape(RectPts(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1))), z0, z1, part, topPart);

// --- Body: tower, concrete frame, stair tower (the passage open), the arm with the canyon, the parapet ---
const towerL = MODULES.tower * FLOOR, gapL = MODULES.gap * FLOOR, stairL = MODULES.stair * FLOOR;
const armL = (MODULES.tower + MODULES.gap + MODULES.stair + MODULES.cantilever) * FLOOR;
const halfD = (MODULES.depth * FLOOR) / 2;
const armBottom = (FLOORS - ARM_FLOORS) * FLOOR, armFloorsZ = armBottom + FRAME, roofZ = FLOORS * FLOOR;
const pillarX = towerL - FRAME, canyonX = armL - CANYON.length * FLOOR, canyonY = (CANYON.width * FLOOR) / 2; // the canyon from canyonX to the arm's end, its walls at +-canyonY
const P = FRAME_PROUD;
Box(0, -halfD, pillarX, halfD, 0, armFloorsZ, "facade");
Box(pillarX, -halfD - P, towerL + P, halfD + P, 0, armBottom, "concrete"); // the pillar
Box(towerL + gapL, -(STAIR_DEPTH * FLOOR) / 2, towerL + gapL + stairL, (STAIR_DEPTH * FLOOR) / 2, 0, armBottom, "stair");
/** The arm's floor plan from x0, inset by t (outset where negative): a rectangle with the canyon cut into its end. */
const ArmPlan = (t, x0 = 0) => [
    [x0 + t, -halfD + t], [armL - t, -halfD + t], [armL - t, -canyonY - t], [canyonX - t, -canyonY - t],
    [canyonX - t, canyonY + t], [armL - t, canyonY + t], [armL - t, halfD - t], [x0 + t, halfD - t],
];
Solid(Shape(ArmPlan(-P, pillarX + P)), armBottom, armFloorsZ, "concrete"); // the slab under the arm, standing proud into the canyon too
Solid(Shape(ArmPlan(0)), armFloorsZ, roofZ, "facade", "roof");
Solid(Shape(ArmPlan(0), [ArmPlan(BALCONY.slab)]), roofZ, HEIGHT, "slab");

// --- Balconies on every glass facade ---
// A face: the plane `axis` = `at`, its outside towards `out`, running from..to
// along the other horizontal axis, with balconies on floors first..last.
const faces = [
    { axis: "x", at: 0, out: -1, from: -halfD, to: halfD, floors: [1, FLOORS - 1] }, // the tower's outer face, the arm's end above it
    ...[-1, 1].flatMap(out => [
        { axis: "y", at: out * halfD, out, from: 0, to: pillarX, floors: [1, FLOORS - 1] }, // the tower's sides up to the roof
        { axis: "y", at: out * halfD, out, from: pillarX, to: armL, floors: [FLOORS - ARM_FLOORS + 1, FLOORS - 1] }, // the arm's sides above the slab
    ]),
    ...[[-halfD, -canyonY], [canyonY, halfD]].map(([from, to]) => ( // the arm's end, both sides of the canyon
        { axis: "x", at: armL, out: 1, from, to, floors: [FLOORS - ARM_FLOORS + 1, FLOORS - 1] })),
];
let balconies = 0;
for (const face of faces) {
    /** A point `s` along the face, `o` out from it, as [x, y]. */
    const At = (s, o) => (face.axis === "y" ? [s, face.at + face.out * o] : [face.at + face.out * o, s]);
    const bayL = BAY * FLOOR, bays = Math.floor((face.to - face.from) / bayL);
    const margin = (face.to - face.from - bays * bayL) / 2;
    const { depth: d, gap, slab } = BALCONY;
    for (let f = face.floors[0]; f <= face.floors[1]; f++) {
        const z = f * FLOOR;
        for (let b = 0; b < bays; b++) {
            if ((b + f) % 2) continue;
            const s0 = face.from + margin + b * bayL + gap / 2, s1 = s0 + bayL - gap;
            const [x0, y0] = At(s0, -1), [x1, y1] = At(s1, d);
            Box(x0, y0, x1, y1, z - slab, z, "slab");
            balconies++;
        }
    }
}

// --- The facade textures: 4 x 4 window modules, 128 px each ---
const PX = 128, random = SeededRandom(0x4b72);
/** A TILE x TILE texture; `Module(mx, my, cell)` paints one pixel of a module, `cell` that module's own random values. */
function Facade(Module) {
    const cells = Array.from({ length: TILE * TILE }, () => [random(), random(), random()]);
    return EncodePng(TILE * PX, TILE * PX, (px, py) => {
        const cell = cells[Math.floor(py / PX) * TILE + Math.floor(px / PX)];
        const noise = ((px * 7 + py * 13) % 5) - 2;
        return [...Module(px % PX, py % PX, cell).map(c => Math.max(0, Math.min(255, Math.round(c + noise)))), 255];
    });
}
const Mix = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
// Floor-to-ceiling glass between white slab edges (half at each end of a module, so the edge sits on the floor line whichever way V runs), a mullion in the middle, some blinds down.
const facadeColor = Facade((mx, my, [blind, shade]) => {
    if (my < 9 || my >= PX - 9) return [0xdc, 0xdb, 0xd5];
    if (mx < 3 || mx >= PX - 3 || (mx >= 62 && mx < 66)) return [0xc0, 0xc3, 0xc6];
    const t = (my - 9) / (PX - 18);
    if (blind < 0.3 && t < 0.25 + blind * 2) return Mix([0xc8, 0xbe, 0xa8], [0xb0, 0xa6, 0x92], t);
    return Mix([0x5a, 0x6c, 0x78], [0x2c, 0x38, 0x42], t).map(c => c + (shade - 0.5) * 16);
});
// The stair tower: light glass in a grid of mullions and transoms.
const stairColor = Facade((mx, my, [, shade]) => {
    if (mx % 32 < 3 || my < 4 || my >= PX - 4 || (my >= 62 && my < 65)) return [0xb4, 0xb9, 0xbd];
    return Mix([0x86, 0xa2, 0xb2], [0x5e, 0x78, 0x88], (my % 64) / 64).map(c => c + (shade - 0.5) * 12);
});
const textures = { facade: facadeColor, stair: stairColor, ...Object.fromEntries(Object.entries(COLORS).map(([part, rgb]) => [part, SolidPng(rgb)])) };

const materials = Object.fromEntries(Object.keys(textures).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(mesh, NAME, materials));
for (const [part, png] of Object.entries(textures)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, png);
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, metalness: METAL[part] ?? 0 }));
}
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles; ${HEIGHT} high, ${FLOORS} floors of ${FLOOR.toFixed(1)}; `
    + `arm ${armL.toFixed(0)} long from z ${armBottom.toFixed(0)}, ${(MODULES.depth * FLOOR).toFixed(0)} deep, cantilevering ${(MODULES.cantilever * FLOOR).toFixed(0)}, a canyon ${(CANYON.width * FLOOR).toFixed(0)} wide and ${(CANYON.length * FLOOR).toFixed(0)} long in its end; `
    + `tower ${towerL.toFixed(0)}, open passage ${gapL.toFixed(0)}, stair tower ${stairL.toFixed(0)} along X; ${balconies} balconies`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the floor in the middle of the tower's outer face, the arm along +X)`);
