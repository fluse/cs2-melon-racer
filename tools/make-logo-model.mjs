// Builds the logo lettering as a 3D model for Hammer — `node tools/make-logo-model.mjs`:
// MELON RACER in Bungee (tools/fonts/, like the logo), slanted like the
// logo's banner, extruded into holo letters (FACE_MATERIAL, the gates'
// holo_dashes) standing in a lime green outline — the letters grown by
// OUTLINE_WIDTH and merged, like the logo's text stroke. Writes
//   models/melon_racer/logo_text.obj   the mesh (render + collision)
//   models/melon_racer/logo_text.vmdl  the ModelDoc model Hammer places
//   materials/melon_racer/logo_text_outline.vmat + _color.png (and
//   logo_text_face.vmat in FACE_COLOR when FACE_MATERIAL is "")
// Compile the model once with resourcecompiler (see the end of the output),
// then place it in Hammer as a prop_static. Origin: bottom center of the
// text, halfway through its depth; the letters read correctly looking at the
// prop's front (+X, the way a prop with angles 0 0 0 faces).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import earcut from "earcut";
import ClipperLib from "clipper-lib";
import { EncodePng } from "./png.mjs";

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
const UV_TILE = 128; // units one texture repeat covers (the holo textures are 512 px)
// The letters' material: an existing one (the gates' holo look), or "" for a
// plain one in FACE_COLOR written next to the outline's.
const FACE_MATERIAL = "materials/melon_racer/holo_dashes.vmat";
const FACE_COLOR = [0xee, 0xf4, 0xe8];
const OUTLINE_COLOR = [0xaa, 0xff, 0x33];

const ROOT = new URL("../", import.meta.url);
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

const Area = c => c.reduce((s, p, i) => {
    const q = c[(i + 1) % c.length];
    return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

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
 * with the letters themselves cut out — a ring around them, so translucent
 * letters (the holo face material) show what's behind them, not the outline.
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

// Mesh: 2D (x, y) -> model space (depth, x, y): front faces +X, text runs
// along +Y (the viewer's right when looking at the front), y up is +Z.
const allPts = [...letters, ...outline].flatMap(s => [s.outer, ...s.holes].flat());
const minU = Math.min(...allPts.map(p => p[0])), maxU = Math.max(...allPts.map(p => p[0]));
const v = [], vt = [], vn = [];
const tris = { face: [], outline: [] };
const Vec = (arr, val) => (arr.push(val), arr.length); // OBJ indices are 1-based
const fmt = n => (Math.abs(n) < 1e-9 ? 0 : +n.toFixed(5));
const N_FRONT = Vec(vn, [1, 0, 0]);
const N_BACK = Vec(vn, [-1, 0, 0]);
const UV = p => Vec(vt, [(p[0] - minU) / UV_TILE, p[1] / UV_TILE]);
const cosSmooth = Math.cos((SMOOTH_ANGLE * Math.PI) / 180);

/** Extrudes 2D shapes from depth x0 (back) to x1 (front) into tris[part]. */
function Extrude(shapes, x0, x1, part) {
    const out = tris[part];
    // Front and back caps
    for (const s of shapes) {
        const flat = [s.outer, ...s.holes].flat();
        const holeIdx = [];
        let n = s.outer.length;
        for (const h of s.holes) { holeIdx.push(n); n += h.length; }
        const t = earcut(flat.flat(), holeIdx, 2);
        const front = flat.map(([y, z]) => Vec(v, [x1, y, z]));
        const back = flat.map(([y, z]) => Vec(v, [x0, y, z]));
        const uvs = flat.map(UV);
        for (let i = 0; i < t.length; i += 3) {
            let [a, b, c] = [t[i], t[i + 1], t[i + 2]];
            // Counter-clockwise seen from +X: in the (y, z) plane that's CCW in 2D.
            if (Area([flat[a], flat[b], flat[c]]) < 0) [b, c] = [c, b];
            out.push([[front[a], uvs[a], N_FRONT], [front[b], uvs[b], N_FRONT], [front[c], uvs[c], N_FRONT]]);
            out.push([[back[a], uvs[a], N_BACK], [back[c], uvs[c], N_BACK], [back[b], uvs[b], N_BACK]]);
        }
    }
    // Sides: a quad per contour edge, smooth along curves, hard at corners.
    for (const pts of shapes.flatMap(s => [s.outer, ...s.holes])) {
        const n = pts.length;
        const edgeN = pts.map((p, i) => {
            const q = pts[(i + 1) % n];
            const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
            return [dy / len, -dx / len]; // outward: outers CCW, holes CW
        });
        const Corner = (i, e) => { // normal at point i for edge e (i's own edge or the one before)
            const other = e === i ? edgeN[(i - 1 + n) % n] : edgeN[i];
            const mine = edgeN[e];
            if (mine[0] * other[0] + mine[1] * other[1] < cosSmooth) return mine;
            const x = mine[0] + other[0], y = mine[1] + other[1], len = Math.hypot(x, y);
            return [x / len, y / len];
        };
        let along = 0;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const p = pts[i], q = pts[j];
            const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
            const nP = Corner(i, i), nQ = Corner(j, i);
            const vertex = (pt, x) => Vec(v, [x, pt[0], pt[1]]);
            const pf = vertex(p, x1), pb = vertex(p, x0);
            const qf = vertex(q, x1), qb = vertex(q, x0);
            const np = Vec(vn, [0, nP[0], nP[1]]), nq = Vec(vn, [0, nQ[0], nQ[1]]);
            const u0 = along / UV_TILE, u1 = (along + len) / UV_TILE, v0 = x0 / UV_TILE, v1 = x1 / UV_TILE;
            along += len;
            const tf = Vec(vt, [u0, v1]), tb = Vec(vt, [u0, v0]), uf = Vec(vt, [u1, v1]), ub = Vec(vt, [u1, v0]);
            // Outward normal (0, ny, nz) with edge p->q: CCW seen from outside is pb, qb, qf, pf.
            out.push([[pb, tb, np], [qb, ub, nq], [qf, uf, nq]]);
            out.push([[pb, tb, np], [qf, uf, nq], [pf, tf, np]]);
        }
    }
}

// The outline ring is the full depth; the letters fill its inside and stand
// LETTER_RAISE out in front of it.
Extrude(outline, -DEPTH / 2, DEPTH / 2, "outline");
Extrude(letters, -DEPTH / 2, DEPTH / 2 + (outline.length ? LETTER_RAISE : 0), "face");

const face = tri => "f " + tri.map(c => c.join("/")).join(" ");
const obj = [
    "# AUTO-GENERATED by tools/make-logo-model.mjs — edit the script, not this file.",
    "# Y up (OBJ convention): ModelDoc turns (x, y, z) into Source (z, x, y), so this is Source (y, z, x).",
    `o letters`,
    ...v.map(([x, y, z]) => `v ${[y, z, x].map(fmt).join(" ")}`),
    ...vt.map(t => `vt ${t.map(fmt).join(" ")}`),
    ...vn.map(([x, y, z]) => `vn ${[y, z, x].map(fmt).join(" ")}`),
    `usemtl ${NAME}_face`,
    ...tris.face.map(face),
    `usemtl ${NAME}_outline`,
    ...tris.outline.map(face),
    "",
].join("\n");

const MATERIALS = { face: FACE_MATERIAL || `${MATERIAL_DIR}/${NAME}_face.vmat`, outline: `${MATERIAL_DIR}/${NAME}_outline.vmat` };
const remap = part => [
    `\t\t\t\t\t\t{ from = "${NAME}_${part}.vmat" to = "${MATERIALS[part]}" },`,
    `\t\t\t\t\t\t{ from = "${NAME}_${part}" to = "${MATERIALS[part]}" },`,
].join("\n");

const vmdl = `<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:modeldoc36:version{972dada4-b828-45a4-bb93-7795cf0585da} -->
{
	rootNode =
	{
		_class = "RootNode"
		children =
		[
			{
				_class = "MaterialGroupList"
				children =
				[
					{
						_class = "DefaultMaterialGroup"
						remaps =
						[
${remap("face")}
${remap("outline")}
						]
						use_global_default = false
						global_default_material = ""
					},
				]
			},
			{
				_class = "RenderMeshList"
				children =
				[
					{
						_class = "RenderMeshFile"
						filename = "${MODEL_DIR}/${NAME}.obj"
						import_translation = [ 0.0, 0.0, 0.0 ]
						import_rotation = [ 0.0, 0.0, 0.0 ]
						import_scale = 1.0
						align_origin_x_type = "None"
						align_origin_y_type = "None"
						align_origin_z_type = "None"
						parent_bone = ""
						import_filter =
						{
							exclude_by_default = false
							exception_list = [  ]
						}
					},
				]
			},
			{
				_class = "PhysicsShapeList"
				children =
				[
					{
						_class = "PhysicsMeshFile"
						name = "${NAME}"
						parent_bone = ""
						surface_prop = "default"
						collision_tags = "solid"
						recenter_on_parent_bone = false
						offset_origin = [ 0.0, 0.0, 0.0 ]
						offset_angles = [ 0.0, 0.0, 0.0 ]
						align_origin_x_type = "None"
						align_origin_y_type = "None"
						align_origin_z_type = "None"
						filename = "${MODEL_DIR}/${NAME}.obj"
						import_scale = 1.0
						maxMeshVertices = 0
						qemError = 0.0
						import_filter =
						{
							exclude_by_default = false
							exception_list = [  ]
						}
					},
				]
			},
		]
		model_archetype = ""
		primary_associated_entity = ""
		anim_graph_name = ""
		base_model_name = ""
	}
}
`;

const vmat = texture => `// AUTO-GENERATED by tools/make-logo-model.mjs

Layer0
{
	shader "csgo_complex.vfx"

	g_flModelTintAmount "1.000"
	g_vColorTint "[1.000000 1.000000 1.000000 0.000000]"
	TextureColor "${texture}"

	g_flMetalness "0.000"
	TextureRoughness "materials/default/default_rough.tga"
	TextureNormal "materials/default/default_normal.tga"
}
`;

const Write = (path, data) => {
    const url = new URL(path, ROOT);
    mkdirSync(new URL(".", url), { recursive: true });
    writeFileSync(url, data);
    console.log(`wrote ${path}`);
};
const solid = rgb => EncodePng(4, 4, () => [...rgb, 255]);

Write(`${MODEL_DIR}/${NAME}.obj`, obj);
Write(`${MODEL_DIR}/${NAME}.vmdl`, vmdl);
for (const [part, rgb] of [["face", FACE_MATERIAL ? null : FACE_COLOR], ["outline", OUTLINE_COLOR]]) {
    if (!rgb) continue;
    Write(`${MATERIAL_DIR}/${NAME}_${part}_color.png`, solid(rgb));
    Write(`${MATERIAL_DIR}/${NAME}_${part}.vmat`, vmat(`${MATERIAL_DIR}/${NAME}_${part}_color.png`));
}
console.log(`${tris.face.length + tris.outline.length} triangles, ${(maxU - minU).toFixed(1)} x ${DEPTH + (outline.length ? LETTER_RAISE : 0)} x ${CAP_HEIGHT + 2 * OUTLINE_WIDTH} units (width x depth x height)`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}.vmdl"`);
