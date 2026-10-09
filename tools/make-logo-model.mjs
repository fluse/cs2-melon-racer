// Builds the logo lettering as a 3D model for Hammer — `node tools/make-logo-model.mjs`:
// MELON RACER in Bungee (tools/fonts/, like the logo), slanted like the
// logo's banner, extruded into solid letters (FACE_COLOR) standing in a lime
// green outline — the letters grown by OUTLINE_WIDTH and merged, like the
// logo's text stroke. The letters' fronts get an opaque copy of a holo
// material (HOLO_SOURCE, the gates' holo_dashes): same textures, scrolling and
// glow, but FACE_COLOR where the gates show glass. Not the translucent
// material itself: a see-through letter showed the sky, its own back and the
// outline's walls, and as a layer just in front of the letters it z-fought
// and sorted badly (grain, colored patches). Writes
//   models/melon_racer/logo_text.obj   the mesh (render + collision)
//   models/melon_racer/logo_text.vmdl  the ModelDoc model Hammer places
//   materials/melon_racer/logo_text_{face,outline}.vmat + _color.png
//   materials/melon_racer/logo_text_holo.vmat + _color.png (from HOLO_SOURCE —
//   re-run after changing it or its textures)
// Compile the model once with resourcecompiler (see the end of the output),
// then place it in Hammer as a prop_static. Origin: bottom center of the
// text, halfway through its depth; the letters read correctly looking at the
// prop's front (+X, the way a prop with angles 0 0 0 faces).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import ClipperLib from "clipper-lib";
import { Area, Mesh, ObjText, SolidPng, VmatText, VmdlText, WriteAddonFile } from "./model.mjs";
import { DecodePng, EncodePng } from "./png.mjs";

const TEXT = "MELON RACER";
const CAP_HEIGHT = 64; // units, height of a capital letter
const DEPTH = 16; // units, front to back
const SLANT_DEGREES = 10; // the logo banner's skewX(-10)
const LETTER_SPACING = 2; // units added between letters
const CURVE_STEP = 2; // units per straight segment along a curve
const SMOOTH_ANGLE = 35; // degrees: corners sharper than this stay hard on the sides
const OUTLINE_WIDTH = 4; // units the outline reaches past the letters (0 = no outline)
const OUTLINE_ARC_TOLERANCE = 0.25; // units, how finely its round corners are cut
const LETTER_RAISE = 3; // units the letters stand out in front of the outline
// Units one texture repeat covers (the holo textures are 512 px): much finer
// and the thin dashes break up into sparkle from any distance.
const UV_TILE = 256;
// The holo material the letters' fronts copy ("" = plain FACE_COLOR fronts):
// its textures are <name>_{color,trans,illum}.png next to it (tools/make-holo.mjs).
const HOLO_SOURCE = "materials/melon_racer/holo_dashes.vmat";
const FACE_COLOR = [0x1f, 0x24, 0x2b]; // the letters' body, and the holo's glass: dark, so the glowing dashes stand out
// Swaps colors in the copied holo: every holo pixel is a mix of its gradient's
// two colors (GRADIENT in tools/make-holo.mjs) and white (the dash cores), so
// mapping those three (white stays) recolors it exactly. Only the logo's copy.
const HOLO_RECOLOR = [
    { from: [57, 255, 20], to: [57, 255, 20] }, // toxic green, kept
    { from: [170, 40, 255], to: [0xff, 0x0e, 0xff] }, // ultraviolet -> magenta
];
const OUTLINE_COLOR = [0xaa, 0xff, 0x33];

const FONT = fileURLToPath(new URL("./fonts/Bungee-Regular.ttf", import.meta.url));
const MODEL_DIR = "models/melon_racer";
const MATERIAL_DIR = "materials/melon_racer";
const NAME = "logo_text";

const font = opentype.parse(readFileSync(FONT).buffer);
const capUnits = font.tables.os2.sCapHeight || font.unitsPerEm * 0.7;
const scale = CAP_HEIGHT / capUnits;
const slant = Math.tan((SLANT_DEGREES * Math.PI) / 180);

/** Closed contours of one glyph at pen x, in units, y up, curves flattened. */
function GlyphContours(glyph, penX) {
    const contours = [];
    let cur = null;
    let last = [0, 0];
    const P = (x, y) => [penX + x * scale, y * scale];
    const segments = (p0, p1) => Math.max(2, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / CURVE_STEP));
    for (const c of glyph.getPath(0, 0, font.unitsPerEm).commands) {
        // getPath is y-down at font size = unitsPerEm, so coordinates are font units.
        if (c.type === "M") {
            cur = [P(c.x, -c.y)];
            contours.push(cur);
            last = cur[0];
        } else if (c.type === "L") {
            last = P(c.x, -c.y);
            cur.push(last);
        } else if (c.type === "Q") {
            const p1 = P(c.x1, -c.y1);
            const p2 = P(c.x, -c.y);
            const n = segments(last, p2);
            for (let i = 1; i <= n; i++) {
                const t = i / n;
                const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
                cur.push([a * last[0] + b * p1[0] + d * p2[0], a * last[1] + b * p1[1] + d * p2[1]]);
            }
            last = p2;
        } else if (c.type === "C") {
            const p1 = P(c.x1, -c.y1);
            const p2 = P(c.x2, -c.y2);
            const p3 = P(c.x, -c.y);
            const n = segments(last, p3);
            for (let i = 1; i <= n; i++) {
                const t = i / n, u = 1 - t;
                const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
                cur.push([
                    a * last[0] + b * p1[0] + d * p2[0] + e * p3[0],
                    a * last[1] + b * p1[1] + d * p2[1] + e * p3[1],
                ]);
            }
            last = p3;
        }
    }
    return contours.map(Clean).filter(c => c.length >= 3);
}

/** Drops the closing duplicate and points too close to the one before. */
function Clean(contour) {
    const out = [];
    for (const p of contour) {
        const q = out[out.length - 1];
        if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) out.push(p);
    }
    while (out.length > 1 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) <= 1e-4) out.pop();
    return out;
}

function Inside(pt, c) {
    let inside = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
        const [xi, yi] = c[i], [xj, yj] = c[j];
        if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** Groups a glyph's contours into shapes: outer CCW, its holes CW. */
function Shapes(contours) {
    // Nesting depth decides outer (even) vs hole (odd), whatever the font's winding.
    const depth = contours.map((c, i) => contours.filter((o, j) => j !== i && Inside(c[0], o)).length);
    const shapes = [];
    contours.forEach((c, i) => {
        if (depth[i] % 2) return;
        shapes.push({ outer: Area(c) > 0 ? c : [...c].reverse(), holes: [], index: i });
    });
    contours.forEach((c, i) => {
        if (!(depth[i] % 2)) return;
        const parents = shapes.filter(s => depth[s.index] === depth[i] - 1 && Inside(c[0], s.outer));
        const parent = parents.sort((a, b) => Math.abs(Area(a.outer)) - Math.abs(Area(b.outer)))[0];
        if (parent) parent.holes.push(Area(c) < 0 ? c : [...c].reverse());
    });
    return shapes;
}

// Lay out the text: font 2D (x right, y up), slanted (tops lean right) and
// centered on its bottom center, still as 2D shapes.
const glyphShapes = [];
let pen = 0;
for (const glyph of font.stringToGlyphs(TEXT)) {
    glyphShapes.push(...Shapes(GlyphContours(glyph, pen)));
    pen += glyph.advanceWidth * scale + LETTER_SPACING;
}
const Slant = c => c.map(([x, y]) => [x + slant * y, y]);
const slanted = glyphShapes.map(s => ({ outer: Slant(s.outer), holes: s.holes.map(Slant) }));
const allX = slanted.flatMap(s => [s.outer, ...s.holes].flat()).map(p => p[0]);
const centerX = (Math.min(...allX) + Math.max(...allX)) / 2;
const Center = c => c.map(([x, y]) => [x - centerX, y]);
const letters = slanted.map(s => ({ outer: Center(s.outer), holes: s.holes.map(Center) }));

/**
 * The outline: the letters grown by OUTLINE_WIDTH (round corners) and merged,
 * with the letters themselves cut out — a ring around them.
 */
function Outline(shapes) {
    const S = 1000; // Clipper works on integers
    const paths = shapes.flatMap(s => [s.outer, ...s.holes]).map(c => c.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) })));
    const offset = new ClipperLib.ClipperOffset(2, OUTLINE_ARC_TOLERANCE * S);
    offset.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const grown = new ClipperLib.Paths();
    offset.Execute(grown, OUTLINE_WIDTH * S);
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(grown, ClipperLib.PolyType.ptSubject, true);
    clipper.AddPaths(paths, ClipperLib.PolyType.ptClip, true);
    const tree = new ClipperLib.PolyTree();
    clipper.Execute(ClipperLib.ClipType.ctDifference, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    const out = [];
    const ToPts = node => Clean(node.Contour().map(p => [p.X / S, p.Y / S]));
    const Walk = node => {
        for (const outer of node.Childs()) {
            const c = ToPts(outer);
            const shape = { outer: Area(c) > 0 ? c : [...c].reverse(), holes: [] };
            for (const hole of outer.Childs()) {
                const h = ToPts(hole);
                shape.holes.push(Area(h) < 0 ? h : [...h].reverse());
                Walk(hole); // islands inside a hole
            }
            out.push(shape);
        }
    };
    Walk(tree);
    return out;
}
const outline = OUTLINE_WIDTH > 0 ? Outline(letters) : [];

// Model space: front faces +X, text runs along +Y (the viewer's right when
// looking at the front), y up is +Z — the 2D shapes extruded along X. The
// outline ring is the full depth; the letters fill its inside and stand
// LETTER_RAISE out in front of it.
const mesh = new Mesh(UV_TILE);
mesh.smoothCos = Math.cos((SMOOTH_ANGLE * Math.PI) / 180);
mesh.Extrude(outline, -DEPTH / 2, DEPTH / 2, "outline");
const front = DEPTH / 2 + (outline.length ? LETTER_RAISE : 0);
mesh.Extrude(letters, -DEPTH / 2, front, "face", "x", HOLO_SOURCE ? "holo" : "face");

const GENERATOR = "tools/make-logo-model.mjs";
const OBJ = `${MODEL_DIR}/${NAME}.obj`;
WriteAddonFile(OBJ, ObjText(mesh, NAME, GENERATOR));
WriteAddonFile(`${MODEL_DIR}/${NAME}.vmdl`, VmdlText({
    name: NAME,
    obj: OBJ,
    physicsObj: OBJ,
    materials: {
        face: `${MATERIAL_DIR}/${NAME}_face.vmat`,
        outline: `${MATERIAL_DIR}/${NAME}_outline.vmat`,
        ...(HOLO_SOURCE ? { holo: `${MATERIAL_DIR}/${NAME}_holo.vmat` } : {}),
    },
}));
for (const [part, rgb] of [["face", FACE_COLOR], ["outline", OUTLINE_COLOR]]) {
    WriteAddonFile(`${MATERIAL_DIR}/${NAME}_${part}_color.png`, SolidPng(rgb));
    WriteAddonFile(`${MATERIAL_DIR}/${NAME}_${part}.vmat`, VmatText({ texture: `${MATERIAL_DIR}/${NAME}_${part}_color.png`, generator: GENERATOR }));
}
if (HOLO_SOURCE) WriteOpaqueHolo();

/**
 * logo_text_holo: HOLO_SOURCE without its translucency. The color texture is
 * the holo's color over FACE_COLOR, as much as the holo is opaque there; the
 * self-illum mask, scrolling and the rest of the material stay the source's.
 */
function WriteOpaqueHolo() {
    // The linear map taking HOLO_RECOLOR's two `from` colors and white to their
    // `to` colors and white: M = To · From⁻¹, the colors as columns.
    const white = [255, 255, 255];
    const From = [...HOLO_RECOLOR.map(r => r.from), white];
    const To = [...HOLO_RECOLOR.map(r => r.to), white];
    const Col = (cols, row, col) => cols[col][row];
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const F = [0, 1, 2].map(r => [0, 1, 2].map(c => Col(From, r, c))); // rows
    const d = det(F);
    const inv = [0, 1, 2].map(r => [0, 1, 2].map(c => { // adjugate / det
        const m = F.filter((_, i) => i !== c).map(row => row.filter((_, j) => j !== r));
        return ((r + c) % 2 ? -1 : 1) * (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / d;
    }));
    const M = [0, 1, 2].map(r => [0, 1, 2].map(c => [0, 1, 2].reduce((s, k) => s + Col(To, r, k) * inv[k][c], 0)));
    const Recolor = rgb => M.map(row => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]);

    const base = HOLO_SOURCE.replace(/\.vmat$/, "");
    const Load = suffix => DecodePng(readFileSync(new URL(`../${base}_${suffix}.png`, import.meta.url)));
    const color = Load("color"), trans = Load("trans");
    const texture = `${MATERIAL_DIR}/${NAME}_holo_color.png`;
    WriteAddonFile(texture, EncodePng(color.width, color.height, (x, y) => {
        const i = y * color.width + x;
        const a = trans.data[i * trans.channels] / 255;
        const holo = Recolor([0, 1, 2].map(c => color.data[i * color.channels + c]));
        return [0, 1, 2].map(c => Math.round(Math.min(255, Math.max(0, FACE_COLOR[c] + (holo[c] - FACE_COLOR[c]) * a)))).concat(255);
    }));
    const source = readFileSync(new URL(`../${HOLO_SOURCE}`, import.meta.url), "utf8");
    // Line by line: the source has \r\n line endings (Hammer's), which trip up multiline regexes.
    const lines = source.split(/\r?\n/)
        .filter(l => !/^\s*(F_TRANSLUCENT|g_flOpacityScale|TextureTranslucency)\b|---- Translucent ----/.test(l))
        .map(l => /AUTO-GENERATED/.test(l) ? `// AUTO-GENERATED by ${GENERATOR} from ${HOLO_SOURCE}, without its translucency` : l)
        .map(l => l.replace(/^(\s*TextureColor\s+)".*"/, `$1"${texture}"`));
    // The empty "Translucent" { } group under VariableState.
    const group = lines.findIndex(l => l.trim() === '"Translucent"');
    if (group >= 0 && lines[group + 1]?.trim() === "{" && lines[group + 2]?.trim() === "}") lines.splice(group, 3);
    WriteAddonFile(`${MATERIAL_DIR}/${NAME}_holo.vmat`, lines.join("\n"));
}

const xs = [...letters, ...outline].flatMap(s => [s.outer, ...s.holes].flat()).map(p => p[0]);
console.log(`${mesh.triangleCount} triangles, ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)} x ${DEPTH + (outline.length ? LETTER_RAISE : 0)} x ${CAP_HEIGHT + 2 * OUTLINE_WIDTH} units (width x depth x height)`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
