// Builds Cologne's TV tower, the Colonius, as mesh geometry for Hammer —
// `node tools/models/make-colonius-model.mjs`: a slim concrete shaft, tapering
// up from a flared foot, carrying the pulpit (the basket: flat underneath and
// narrowest there, its sides leaning out up to the roof, bands of windows
// round it), above it two open steel
// platforms on diagonal struts with antennas on their rims, then the white
// upper shaft narrowing into the antenna mast with its orange and white bands
// to the tip, HEIGHT high in all.
// Writes
//   models/melon_racer/colonius.dmx  for Hammer's File > Import: edit it like
//                                    any mesh, collision from the mesh itself
//   materials/melon_racer/colonius/colonius_<part>.vmat (+ _color.png)
// Origin: on the floor in the middle of the shaft. Round, so it faces nowhere.
import { Circle, DmxText, Mesh, SeededRandom, Shape, SolidPng, VmatText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

const HEIGHT = 3000; // floor to the mast's tip (the real one: 266 m, so about 11 units a metre)

// --- Tessellation: sides around ---
const SHAFT_SIDES = 24;
const BASKET_SIDES = 32;
const STRUT_SIDES = 4;

// --- The column, bottom up: [z, radius, part of the stretch up to the next ring] ---
// Proportions measured off a side-on photo (the tower 420 px = HEIGHT).
const BASKET_BOTTOM = 1778, BASKET_TOP = 2000; // the pulpit, its roof at BASKET_TOP
const COLUMN = [
    [0, 88, "concrete"], // the foot, a little flared
    [20, 82, "concrete"], // the shaft, tapering up through the basket to the upper platform
    [2185, 47, "white"],
    [2191, 43, "white"], // the white upper shaft
    [2785, 28, "white"],
    [2805, 16, "white"], // the shoulder into the mast
    [2840, 13, "orange"],
    [2880, 11, "white"],
    [2910, 9.5, "orange"],
    [HEIGHT - 9, 6, "orange"],
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
    [3, 186, "concrete"],
    [9, 196, "concrete"],
    [16, 201, "concrete"],
    [...EDGE, "concrete"], // the rounded edge
    [66, Side(66), "glass"], // the lowest window band
    [100, Side(100), "concrete"],
    [116, Side(116), "glass"], // the big windows
    [155, Side(155), "concrete"],
    [173, Side(173), "glass"], // the small windows under the top band
    [196, Side(196), "concrete"],
    [BASKET_TOP - BASKET_BOTTOM, BASKET_RIM],
];
// --- The open platforms above the basket, each on struts from the shaft `drop` below it ---
const PLATFORMS = [
    { z: 2080, radius: 215, drop: 40, struts: 20, antennas: 8 },
    { z: 2180, radius: 152, drop: 100, struts: 16, antennas: 8 },
];
const PLATFORM_THICKNESS = 9;
const STRUT_RADIUS = 2.4;
const RAIL = { height: 15, radius: 1.5 };
const ANTENNA = { height: 60, radius: 2 };

const COLORS = {
    roof: [0x8a, 0x8a, 0x86],
    steel: [0x8c, 0x91, 0x96],
    white: [0xe8, 0xe8, 0xe5],
    orange: [0xe2, 0x5a, 0x2e],
};
const METAL = { steel: 0.5 };

const NAME = "colonius";
const MATERIAL_DIR = "materials/melon_racer/colonius";
const GENERATOR = "tools/models/make-colonius-model.mjs";

const mesh = new Mesh(128);
const START = Math.PI / 2; // Circle's start angle matching the rings Mesh.Tube lays round a vertical axis

/** A round solid of its own along z through `rings` ([z, radius, part]), flat caps at both ends (the bottom one `bottomPart`, the top `topPart`). */
function Lathe(rings, sides, bottomPart, topPart) {
    mesh.NewShell();
    for (let i = 0; i + 1 < rings.length; i++) {
        const [z0, r0, part] = rings[i], [z1, r1] = rings[i + 1];
        mesh.Tube([[0, 0, z0], [0, 0, z1]], k => (k ? r1 : r0), sides, part, false, { slopedNormals: true });
    }
    const [zb, rb] = rings[0], [zt, rt] = rings[rings.length - 1];
    mesh.Cap(Shape(Circle(0, 0, rb, sides, START)), zb, bottomPart, "z", -1);
    mesh.Cap(Shape(Circle(0, 0, rt, sides, START)), zt, topPart, "z", 1);
}
/** The column's radius at height z (between its rings). */
function ColumnRadius(z) {
    for (let i = 0; i + 1 < COLUMN.length; i++) {
        const [z0, r0] = COLUMN[i], [z1, r1] = COLUMN[i + 1];
        if (z <= z1) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
    }
    return COLUMN[COLUMN.length - 1][1];
}
/** A thin round rod between two points, a shell of its own. */
function Rod(a, b, radius, part) {
    mesh.NewShell();
    mesh.Tube([a, b], radius, STRUT_SIDES, part, true);
}
const OnCircle = (r, angle, z) => [r * Math.cos(angle), r * Math.sin(angle), z];

// --- Column and basket ---
Lathe(COLUMN, SHAFT_SIDES, "concrete", "orange");
Lathe(BASKET.map(([dz, r, part]) => [BASKET_BOTTOM + dz, r, part]), BASKET_SIDES, "concrete", "roof");

// --- Platforms: a steel ring round the shaft, a rail on its rim, struts under it, antennas on it ---
let antennas = 0;
for (const p of PLATFORMS) {
    const inner = ColumnRadius(p.z) - 1; // a little into the shaft, so no gap shows
    mesh.NewShell();
    mesh.Extrude(Shape(Circle(0, 0, p.radius, BASKET_SIDES, START), [Circle(0, 0, inner, SHAFT_SIDES, START)]), p.z - PLATFORM_THICKNESS, p.z, "steel", "z");
    mesh.NewShell();
    const railZ = p.z + RAIL.height, railR = p.radius - RAIL.radius;
    mesh.Tube(Array.from({ length: BASKET_SIDES + 1 }, (_, k) => OnCircle(railR, (2 * Math.PI * k) / BASKET_SIDES, railZ)), RAIL.radius, STRUT_SIDES, "steel", false);
    for (let k = 0; k < BASKET_SIDES; k += 2) {
        const a = (2 * Math.PI * k) / BASKET_SIDES;
        Rod(OnCircle(railR, a, p.z), OnCircle(railR, a, railZ), RAIL.radius, "steel");
    }
    for (let k = 0; k < p.struts; k++) {
        const a = (2 * Math.PI * (k + 0.5)) / p.struts, low = p.z - PLATFORM_THICKNESS - p.drop;
        Rod(OnCircle(ColumnRadius(low) - 1, a, low), OnCircle(p.radius - 6, a, p.z - PLATFORM_THICKNESS), STRUT_RADIUS, "steel");
    }
    for (let k = 0; k < p.antennas; k++) {
        const a = (2 * Math.PI * (k + 0.25)) / p.antennas, r = p.radius - 10;
        Rod(OnCircle(r, a, p.z), OnCircle(r, a, p.z + ANTENNA.height * (k % 2 ? 0.7 : 1)), ANTENNA.radius, "white");
        antennas++;
    }
}

// --- Textures: 128 px for 128 units ---
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
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, metalness: METAL[part] ?? 0 }));
}
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles; ${HEIGHT} high, the shaft ${COLUMN[1][1] * 2} across above its foot, `
    + `the basket ${BASKET_BOTTOM}..${BASKET_TOP} (${BASKET[BASKET.length - 1][1] * 2} across), platforms at ${PLATFORMS.map(p => p.z).join(" + ")}, ${antennas} antennas`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the floor in the middle of the shaft)`);
