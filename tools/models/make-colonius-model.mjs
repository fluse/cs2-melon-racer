// Builds Cologne's TV tower, the Colonius, as mesh geometry for Hammer —
// `node tools/models/make-colonius-model.mjs`: a slim concrete shaft, tapering
// up, carrying the pulpit (the basket: flat underneath and narrowest there,
// its sides leaning out up to the roof, bands of windows round it), above it
// two open steel platforms, then the white upper shaft with the glowing
// magenta Telekom T on all four sides, narrowing into the antenna mast with
// its orange and white bands to the tip, HEIGHT high in all. For the 3D
// skybox, so kept to about TRIANGLE_BUDGET triangles: few sides round, few
// rings, no struts, antennas or rails (thinner than a unit at SCALE), no
// bottom on the floor.
// Writes
//   models/melon_racer/colonius.dmx  for Hammer's File > Import: edit it like
//                                    any mesh, collision from the mesh itself
//   materials/melon_racer/colonius/colonius_<part>.vmat (+ _color.png)
// Origin: on the floor in the middle of the shaft. The logos face 67.5, 157.5, 247.5 and 337.5 degrees.
import { Circle, DmxText, Mesh, SeededRandom, Shape, SolidPng, VmatText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

const HEIGHT = 3000; // floor to the mast's tip (the real one: 266 m, so about 11 units a metre)
const TRIANGLE_BUDGET = 500;
// The whole tower is built at HEIGHT and then shrunk by SCALE (textures with it);
// every measure below is before that.
const SCALE = 2 / 9;

// --- Tessellation: sides around ---
const SHAFT_SIDES = 8;
const BASKET_SIDES = 12;
const PLATFORM_SIDES = 8;

// --- The column, bottom up: [z, radius, part of the stretch up to the next ring] ---
// Proportions measured off a side-on photo (the tower 420 px = HEIGHT).
const BASKET_BOTTOM = 1778, BASKET_TOP = 2000; // the pulpit, its roof at BASKET_TOP
const COLUMN = [
    [0, 82, "concrete"], // the shaft, tapering up through the basket to the upper platform
    [2185, 45, "white"], // the white upper shaft
    [2785, 28, "white"],
    [2805, 16, "orange"], // the shoulder into the mast
    [2880, 11, "white"],
    [2910, 9.5, "orange"],
    [HEIGHT, 1.5],
];
// --- The basket, bottom up from BASKET_BOTTOM: [dz, radius, part up to the next ring] ---
// Flat underneath and narrowest there, a rounded lower edge, then the sides
// leaning out all the way up to the widest ring at the roof.
const BASKET_FLAT = 172, BASKET_RIM = 268; // the flat underside's radius, the roof's
const EDGE = [24, 204]; // [dz, radius] where the rounded lower edge meets the sides
/** The side's radius dz above the bottom, from the rounded edge out to the rim, a little convex. */
const Side = dz => EDGE[1] + (BASKET_RIM - EDGE[1]) * ((dz - EDGE[0]) / (BASKET_TOP - BASKET_BOTTOM - EDGE[0])) ** 0.8;
const BASKET = [
    [0, BASKET_FLAT, "concrete"], // the flat underside (the bottom cap)
    [...EDGE, "concrete"], // the rounded edge
    [66, Side(66), "glass"], // the lowest window band
    [100, Side(100), "concrete"],
    [116, Side(116), "glass"], // the big windows
    [155, Side(155), "concrete"],
    [BASKET_TOP - BASKET_BOTTOM, BASKET_RIM],
];
// --- The open platforms above the basket: steel rings round the shaft ---
const PLATFORMS = [
    { z: 2080, radius: 215 },
    { z: 2180, radius: 152 },
];
const PLATFORM_THICKNESS = 9;

// --- The Telekom T on the white upper shaft, on four of its faces (each centered on one): ---
// the T (crossbar, stem) with its "digits": one square left of the stem, two
// right, on the baseline. Rects [u0, u1, v0, v1] from its bottom middle, times
// LOGO_SIZE; u runs round the shaft (wider than a face, it bends round its corners).
const LOGO_Z = 2330; // its baseline
const LOGO_SIZE = 0.4; // about 40 wide (a face and a bit): space between the four
const LOGO_FACES = [7, 1, 3, 5]; // the shaft's faces k (between corners k and k + 1): their middles at 67.5, 157.5, 247.5, 337.5 degrees
const LOGO_GAP = 1.5; // off the shaft's surface
const LOGO = [
    [-48, 48, 92, 116], // the crossbar
    [-12, 12, 0, 92], // the stem
    [-36, -24, 0, 12], // the digits
    [24, 36, 0, 12],
    [42, 54, 0, 12],
];
const LOGO_GLOW = 4;

const COLORS = {
    roof: [0x8a, 0x8a, 0x86],
    steel: [0x8c, 0x91, 0x96],
    white: [0xe8, 0xe8, 0xe5],
    orange: [0xe2, 0x5a, 0x2e],
    logo: [0xe2, 0x00, 0x74], // Telekom magenta
};
const METAL = { steel: 0.5 };
const GLOW = { logo: LOGO_GLOW };

const NAME = "colonius";
const MATERIAL_DIR = "materials/melon_racer/colonius";
const GENERATOR = "tools/models/make-colonius-model.mjs";

const mesh = new Mesh(128);
const START = Math.PI / 2; // Circle's start angle matching the rings Mesh.Tube lays round a vertical axis

/** A round solid of its own along z through `rings` ([z, radius, part]), flat caps at both ends (the bottom one `bottomPart`, none if null; the top `topPart`). */
function Lathe(rings, sides, bottomPart, topPart) {
    mesh.NewShell();
    for (let i = 0; i + 1 < rings.length; i++) {
        const [z0, r0, part] = rings[i], [z1, r1] = rings[i + 1];
        mesh.Tube([[0, 0, z0], [0, 0, z1]], k => (k ? r1 : r0), sides, part, false, { slopedNormals: true });
    }
    const [zb, rb] = rings[0], [zt, rt] = rings[rings.length - 1];
    if (bottomPart) mesh.Cap(Shape(Circle(0, 0, rb, sides, START)), zb, bottomPart, "z", -1);
    mesh.Cap(Shape(Circle(0, 0, rt, sides, START)), zt, topPart, "z", 1);
}
/** The column's radius at height z (between its rings; to its corners). */
function ColumnRadius(z) {
    for (let i = 0; i + 1 < COLUMN.length; i++) {
        const [z0, r0] = COLUMN[i], [z1, r1] = COLUMN[i + 1];
        if (z <= z1) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
    }
    return COLUMN[COLUMN.length - 1][1];
}
/** The shaft's corner k at height z, `grow` further out (the rings Mesh.Tube lays round a vertical axis start at START). */
const ShaftCorner = (k, z, grow = 0) => {
    const a = START + (2 * Math.PI * k) / SHAFT_SIDES, r = ColumnRadius(z) + grow;
    return [r * Math.cos(a), r * Math.sin(a), z];
};

// --- Column and basket ---
Lathe(COLUMN, SHAFT_SIDES, null, "orange"); // stands on the floor: no bottom
Lathe(BASKET.map(([dz, r, part]) => [BASKET_BOTTOM + dz, r, part]), BASKET_SIDES, "concrete", "roof");

// --- Platforms: a steel ring round the shaft ---
for (const p of PLATFORMS) {
    const inner = ColumnRadius(p.z) - 1; // a little into the shaft, so no gap shows
    mesh.NewShell();
    mesh.Extrude(Shape(Circle(0, 0, p.radius, PLATFORM_SIDES, START), [Circle(0, 0, inner, SHAFT_SIDES, START)]), p.z - PLATFORM_THICKNESS, p.z, "steel", "z");
}

// --- The logos: laid flat onto the shaft's faces, LOGO_GAP off them, bent only at its corners ---
// Round the shaft in face units: s = k + 0.5 is face k's middle (between corners k and k + 1).
const faceWidth = 2 * ColumnRadius(LOGO_Z) * Math.sin(Math.PI / SHAFT_SIDES); // at the baseline
/**
 * A point of the logo at s (face units round the shaft), height z: on face
 * floor(s) of the shaft grown LOGO_GAP outwards (so the pieces on two faces
 * meet at the corner between them), following the taper.
 */
function OnShaft(s, z, k = Math.floor(s)) {
    const f = s - k, grow = LOGO_GAP / Math.cos(Math.PI / SHAFT_SIDES);
    const a = ShaftCorner(k, z, grow), b = ShaftCorner(k + 1, z, grow);
    return [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * f);
}
let logoFaces = 0;
for (const face of LOGO_FACES) {
    mesh.NewShell();
    for (const [u0, u1, v0, v1] of LOGO) {
        const s0 = face + 0.5 + (u0 * LOGO_SIZE) / faceWidth, s1 = face + 0.5 + (u1 * LOGO_SIZE) / faceWidth;
        const z0 = LOGO_Z + v0 * LOGO_SIZE, z1 = LOGO_Z + v1 * LOGO_SIZE;
        // Cut at the shaft's corners, so every piece lies flat on one face.
        const cuts = [s0];
        for (let c = Math.floor(s0) + 1; c < s1; c++) cuts.push(c);
        cuts.push(s1);
        for (let i = 0; i + 1 < cuts.length; i++) {
            const a = cuts[i], b = cuts[i + 1], k = Math.floor(a); // a piece ending on a corner is still on face k
            // Counter-clockwise seen from outside (s grows to the right there).
            mesh.Face([OnShaft(a, z0, k), OnShaft(b, z0, k), OnShaft(b, z1, k), OnShaft(a, z1, k)], [[0, 0], [1, 0], [1, 1], [0, 1]], "logo");
            logoFaces++;
        }
    }
}

// --- Shrunk to SCALE, the UVs kept: the textures shrink along ---
mesh.v = mesh.v.map(p => p.map(c => c * SCALE)); // new arrays: some corners share one

// --- Textures: 128 px for 128 units (before SCALE) ---
const PX = 128, random = SeededRandom(0xc010);
const Noisy = (Pixel) => EncodePng(PX, PX, (px, py) => [...Pixel(px, py).map(c => Math.max(0, Math.min(255, Math.round(c + ((px * 7 + py * 13) % 5) - 2)))), 255]);
// Exposed concrete: faint formwork joints every 32 units up the shaft, a little mottling.
const blotches = Array.from({ length: 16 }, () => random());
const concreteColor = Noisy((px, py) => {
    const joint = py % 32 === 0 ? -14 : 0;
    const mottle = (blotches[(Math.floor(px / 32) + 4 * Math.floor(py / 32)) % 16] - 0.5) * 10;
    return [0xb0, 0xad, 0xa6].map(c => c + joint + mottle);
});
// Window bands: panes 16 units wide between light mullions, no transoms (the bands' heights differ, so nothing may depend on V).
const panes = Array.from({ length: PX / 16 }, () => random());
const glassColor = Noisy((px) => {
    if (px % 16 < 2) return [0xb8, 0xbb, 0xbe];
    return [0x3a, 0x48, 0x52].map(c => c + (panes[Math.floor(px / 16)] - 0.5) * 18);
});
const textures = { concrete: concreteColor, glass: glassColor, ...Object.fromEntries(Object.entries(COLORS).map(([part, rgb]) => [part, SolidPng(rgb)])) };

const materials = Object.fromEntries(Object.keys(textures).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(mesh, NAME, materials));
for (const [part, png] of Object.entries(textures)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, png);
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, metalness: METAL[part] ?? 0, glow: GLOW[part] ?? 0 }));
}
const perPart = Object.entries(mesh.tris).map(([part, tris]) => `${part} ${tris.length}`).join(", ");
const Scaled = units => Math.round(units * SCALE);
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles (budget ${TRIANGLE_BUDGET}; ${perPart}); scaled ${SCALE.toFixed(3)}: `
    + `${Scaled(HEIGHT)} high, the shaft ${Scaled(COLUMN[0][1] * 2)} across at the floor, `
    + `the basket ${Scaled(BASKET_BOTTOM)}..${Scaled(BASKET_TOP)} (${Scaled(BASKET[BASKET.length - 1][1] * 2)} across), platforms at ${PLATFORMS.map(p => Scaled(p.z)).join(" + ")}, `
    + `the Telekom T at ${Scaled(LOGO_Z)}..${Scaled(LOGO_Z + Math.max(...LOGO.map(r => r[3])) * LOGO_SIZE)} on 4 sides (${logoFaces} faces)`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the floor in the middle of the shaft)`);
