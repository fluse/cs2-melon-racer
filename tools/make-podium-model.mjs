// Builds the hub's winners' podium as mesh geometry for Hammer —
// `node tools/make-podium-model.mjs`: three rubber steps side by side, the
// winner's in the middle and highest, 2nd on the viewer's left, 3rd on the
// right. Each step has a top plate in its place's color with a glowing band
// in the guide-line green under it, and its place number on the front in
// Bungee (the logo's font), glowing in the place's color. All colors are
// the map's palette (docs/GAME_CI.md): 1st checkpoint gold, 2nd heal cyan,
// 3rd start-gate magenta. Writes
//   models/melon_racer/podium.dmx  for Hammer's File → Import: edit it like any
//                                  mesh, collision from the mesh itself
//   materials/melon_racer/podium/podium_<part>.vmat (+ _color.png, except the body:
//   it uses BODY_TEXTURES, ambientCG's Rubber004, CC0 — https://ambientcg.com/view?id=Rubber004,
//   the 1K PNG's Color, NormalGL and Roughness maps, copied in as they are)
// Origin: on the floor, under the middle of the winner's step; the front
// (numbers) faces +X. Turned in Hammer, give the podium_spawn_<place>
// info_targets the same yaw; the output lists their spots
// (docs/mapping-api/05-hub.md).
import { BUNGEE, LoadFont, TextShapes } from "./font.mjs";
import { ChamferedRect, DmxText, Mesh, SolidPng, VmatText, WriteAddonFile } from "./model.mjs";

// y: the step's center (+Y is the viewer's right looking at the front).
const STEP_WIDTH = 112; // units along Y, per step
const STEPS = [
    { place: 1, y: 0, height: 100, part: "first", color: [0xff, 0xca, 0x4f] }, // checkpoint
    { place: 2, y: -STEP_WIDTH, height: 72, part: "second", color: [0x64, 0xfb, 0xdf] }, // heal
    { place: 3, y: STEP_WIDTH, height: 48, part: "third", color: [0xf7, 0x0b, 0xc0] }, // start gate
];
const STEP_DEPTH = 112; // units along X, front to back
const STEP_CHAMFER = 2; // a small groove where two steps meet
const PLATE_HEIGHT = 5; // the colored top plate
const PLATE_OVERHANG = 1.5; // how far the plate reaches past the step
const BAND_HEIGHT = 3; // the glowing band right under the plate
const BAND_OUT = 0.6; // how far it stands out of the step
const DIGIT_HEIGHT = 22; // units, the place number's height
const DIGIT_TOP_GAP = 8; // units from the band down to the number's top, the same on every step
const DIGIT_RAISE = 2; // how far it stands out in front of the step
const BODY_TEXTURES = {
    texture: "materials/melon_racer/surfaces/rubber004_color.png",
    normal: "materials/melon_racer/surfaces/rubber004_normal.png",
    roughness: "materials/melon_racer/surfaces/rubber004_rough.png",
};
const UV_TILE = 128; // units one texture repeat covers (the rubber; the other parts are one color)
const GLOW_COLOR = [0x90, 0xff, 0x50]; // guide lines
const GLOW_BRIGHTNESS = 2;
const SPAWN_HEIGHT = 24; // podium_spawn_<place>: this far above the plate

const NAME = "podium";
const MODEL_DIR = "models/melon_racer";
const MATERIAL_DIR = "materials/melon_racer/podium";
const GENERATOR = "tools/make-podium-model.mjs";

const font = LoadFont(BUNGEE);
const Shape = outer => [{ outer, holes: [] }];

/** An upright block of the steps' footprint around (0, y), grown by `grow`, from z0 to z1. */
function Block(mesh, y, grow, z0, z1, part) {
    const outline = ChamferedRect(0, y, STEP_DEPTH + 2 * grow, STEP_WIDTH + 2 * grow, STEP_CHAMFER + grow / 2);
    mesh.Extrude(Shape(outline), z0, z1, part, "z");
}

/** `text` centered on u of the front plane (u = Y, v = Z), its top at v. */
function TopAlignedText(text, u, v) {
    const shapes = TextShapes(font, text, DIGIT_HEIGHT);
    const pts = shapes.flatMap(s => [s.outer, ...s.holes].flat());
    const [minU, maxU] = [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0]))];
    const maxV = Math.max(...pts.map(p => p[1]));
    const du = u - (minU + maxU) / 2, dv = v - maxV;
    const Move = c => c.map(([a, b]) => [a + du, b + dv]);
    return shapes.map(s => ({ outer: Move(s.outer), holes: s.holes.map(Move) }));
}

const render = new Mesh(UV_TILE);
for (const { place, y, height, part } of STEPS) {
    const plateBottom = height - PLATE_HEIGHT;
    Block(render, y, 0, 0, plateBottom - BAND_HEIGHT, "body");
    Block(render, y, BAND_OUT, plateBottom - BAND_HEIGHT, plateBottom, "glow");
    Block(render, y, PLATE_OVERHANG, plateBottom, height, part);
    // The number on the front (+X), centered across the step, just below the band;
    // its back sunk a unit into the step so no gap shows at the edges.
    const front = STEP_DEPTH / 2;
    render.Extrude(TopAlignedText(String(place), y, plateBottom - BAND_HEIGHT - DIGIT_TOP_GAP), front - 1, front + DIGIT_RAISE, `${part}_glow`, "x");
}

const materials = Object.fromEntries(Object.keys(render.tris).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`${MODEL_DIR}/${NAME}.dmx`, DmxText(render, NAME, materials));
WriteAddonFile(materials.body, VmatText({ generator: GENERATOR, ...BODY_TEXTURES }));
for (const [part, rgb, options] of [
    ["glow", GLOW_COLOR, { glow: GLOW_BRIGHTNESS }],
    ...STEPS.flatMap(s => [[s.part, s.color, {}], [`${s.part}_glow`, s.color, { glow: GLOW_BRIGHTNESS }]]),
]) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, ...options }));
}

console.log(`${render.triangleCount} triangles, ${3 * STEP_WIDTH} wide, ${STEP_DEPTH} deep, ${Math.max(...STEPS.map(s => s.height))} high`);
console.log("podium_spawn_<place> info_targets, relative to the podium's origin (not turned):");
for (const { place, y, height } of STEPS) console.log(`  podium_spawn_${place}: 0 ${y} ${height + SPAWN_HEIGHT}`);
