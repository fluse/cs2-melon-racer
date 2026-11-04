// Builds the dock of Cologne's Rheinauhafen as mesh geometry for Hammer —
// `node tools/models/make-harbor-dock-model.mjs`: the long narrow peninsula
// between the harbor basin (west) and the Rhine (east), from the pointed tip
// at the Schokoladenmuseum in the north, under the Severinsbruecke, past the
// Kranhaeuser down to where the basin ends in the south. Its outline is traced
// off a top-down map image (OUTLINE, in that image's pixels, SCALE units per
// pixel), turned straight (the strip along Y, not slanted as on the map) and
// stretched to LENGTH x WIDTH; it stands HEIGHT tall: stone quay walls, a
// flat paved top. Kept coarse for the 3D skybox: the traced points as they
// are, no smoothing, no edge details.
// Writes
//   models/melon_racer/harbor_dock.dmx  for Hammer's File > Import: edit it
//                                       like any mesh, collision from the mesh
//   materials/melon_racer/harbor_dock/harbor_dock_<part>.vmat (+ _color.png;
//                                       one texture repeat per UV_TILE units)
// Origin: on the floor (the river bed), in the middle of the south end; north
// is +Y, the Rhine on the +X side — the same way round as bridge.dmx (its
// road along X, the river along Y), which crosses the dock at BRIDGE_PY.
import { DmxText, Mesh, SeededRandom, Shape, VmatText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

// --- The dock ---
const HEIGHT = 50; // the river bed to the paved top
const LENGTH = 24000; // south end to the tip, along Y
const WIDTH = 3600; // across X at the widest
const UV_TILE = 256; // units per texture repeat

// The outline in the image's pixels (x east, y south), one open chain from the
// south end's west corner up the basin side, round the tip and down the Rhine
// side to the south end's east corner; the south end itself is a straight cut.
const OUTLINE = [
    [214, 772], [224, 705], [238, 620], [250, 545], [260, 470], [270, 400], [280, 330], // basin side, south of the bridge
    [286, 260], [290, 190], [294, 135], [318, 104], [346, 74], [372, 42], // basin side, north of the bridge, past the swing bridge to the tip
    [388, 34], [399, 58], [392, 115], [378, 180], [360, 245], // round the tip, down the Rhine side past the museum
    [342, 320], [330, 400], [318, 490], [304, 580], [294, 660], [286, 730], [282, 784], // Rhine side, south of the bridge
];
const BRIDGE_PY = 290; // where the Severinsbruecke crosses, in the image (for the console)

const COLORS = {
    quay: { base: [0x6a, 0x66, 0x60], mortar: [0x48, 0x45, 0x41], vary: 14 }, // the quay walls: dark stone in courses
    paving: { base: [0x9a, 0x96, 0x8e], mortar: [0x74, 0x71, 0x6b], vary: 10 }, // the top: square paving slabs
};

const NAME = "harbor_dock";
const MATERIAL_DIR = "materials/melon_racer/harbor_dock";
const GENERATOR = "tools/models/make-harbor-dock-model.mjs";

// Image pixels to units: north up (+Y), then turned so the strip's main axis
// (the outline's principal axis) runs straight along Y, then stretched to
// LENGTH x WIDTH with the origin in the middle of the south end.
const flipped = OUTLINE.map(([px, py]) => [px, -py]);
const mean = [0, 1].map(k => flipped.reduce((s, p) => s + p[k], 0) / flipped.length);
const [sxx, syy, sxy] = flipped.reduce(([a, b, c], [x, y]) => [a + (x - mean[0]) ** 2, b + (y - mean[1]) ** 2, c + (x - mean[0]) * (y - mean[1])], [0, 0, 0]);
const axisAngle = 0.5 * Math.atan2(2 * sxy, sxx - syy); // the main axis' angle from +X
const turn = Math.PI / 2 - axisAngle, cos = Math.cos(turn), sin = Math.sin(turn);
let straight = flipped.map(([x, y]) => [(x - mean[0]) * cos - (y - mean[1]) * sin, (x - mean[0]) * sin + (y - mean[1]) * cos]);
if (straight[0][1] > Math.max(...straight.map(p => p[1])) - 1e-6) straight = straight.map(([x, y]) => [-x, -y]); // the tip north
const sx = straight.map(p => p[0]), sy = straight.map(p => p[1]);
const scale = [WIDTH / (Math.max(...sx) - Math.min(...sx)), LENGTH / (Math.max(...sy) - Math.min(...sy))];
const south = [(straight[0][0] + straight.at(-1)[0]) / 2, Math.min(...sy)];
const ToUnits = ([x, y]) => [(x - south[0]) * scale[0], (y - south[1]) * scale[1]];
const outline = straight.map(ToUnits);

const mesh = new Mesh(UV_TILE);
mesh.Extrude(Shape(outline), 0, HEIGHT, "quay", "z", "paving");

// --- Textures, 128 px = 128 units: blocks in a running bond (quay, coping) or square slabs (paving) ---
const random = SeededRandom(0x7a4f);
/** Stones `w` x `h` px with `joint` px of mortar, every other row shifted by `shift` of a stone. */
function Stones({ base, mortar, vary }, w, h, joint, shift) {
    const shades = Array.from({ length: 256 }, () => (random() - 0.5) * 2 * vary);
    return EncodePng(128, 128, (px, py) => {
        const row = Math.floor(py / h), bx = (px + (row % 2) * shift * w) % 128;
        if (py % h < joint || bx % w < joint) return [...mortar, 255];
        const s = shades[(row * 16 + Math.floor(bx / w)) % shades.length] + ((px * 7 + py * 13) % 5) - 2;
        return [...base.map(c => Math.max(0, Math.min(255, Math.round(c + s)))), 255];
    });
}
const textures = {
    quay: Stones(COLORS.quay, 64, 16, 2, 0.5),
    paving: Stones(COLORS.paving, 32, 32, 2, 0),
};

const materials = Object.fromEntries(Object.keys(textures).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(mesh, NAME, materials));
for (const [part, png] of Object.entries(textures)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, png);
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
/** The dock's width across X at a height y (units): between the outline's crossings. */
const WidthAt = y => {
    const hits = [];
    outline.forEach((p, i) => {
        const q = outline[(i + 1) % outline.length];
        if ((p[1] - y) * (q[1] - y) < 0) hits.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
    });
    return hits.length >= 2 ? Math.max(...hits) - Math.min(...hits) : 0;
};
const bridgeY = ToUnits(straight[OUTLINE.findIndex(p => p[1] <= BRIDGE_PY)])[1];
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles; ${HEIGHT} high, ${(Math.max(...ys) - Math.min(...ys)).toFixed(0)} long (Y), `
    + `x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}; ${WidthAt(LENGTH * 0.05).toFixed(0)} wide near the south end, ${WidthAt(bridgeY + 1).toFixed(0)} under the bridge; `
    + `${outline.length} outline points`);
console.log(`the Severinsbruecke crosses at y ${bridgeY.toFixed(0)}`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the floor in the middle of the south end, north +Y, the Rhine on +X)`);
