// Shared by the model generators in tools/ (make-logo-model.mjs,
// make-checkpoint-model.mjs): a small mesh builder (extruded 2D shapes,
// single triangles) and the files a Hammer model needs — the .obj, the
// ModelDoc .vmdl and plain or glowing .vmat materials. Coordinates are
// Source units, Z up; ObjText writes them the way ModelDoc reads an OBJ.
import { mkdirSync, writeFileSync } from "node:fs";
import earcut from "earcut";
import { EncodePng } from "./png.mjs";

/** Signed area of a 2D polygon: > 0 counter-clockwise (y up). */
export const Area = c => c.reduce((s, p, i) => {
    const q = c[(i + 1) % c.length];
    return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

// Extrusion axis -> (2D u, 2D v, depth d) to 3D, chosen so a counter-clockwise
// 2D shape faces the +axis direction (cyclic: x -> (y, z), y -> (z, x), z -> (x, y)).
const AXES = {
    x: (u, v, d) => [d, u, v],
    y: (u, v, d) => [v, d, u],
    z: (u, v, d) => [u, v, d],
};

export class Mesh {
    /** @param {number} uvTile units one texture repeat covers */
    constructor(uvTile = 128) {
        this.uvTile = uvTile;
        this.v = [];
        this.vt = [];
        this.vn = [];
        /** @type {Record<string, number[][][]>} triangles per material part */
        this.tris = {};
        this.smoothCos = Math.cos((35 * Math.PI) / 180);
    }

    // OBJ indices are 1-based.
    #Add(arr, val) { arr.push(val); return arr.length; }
    #Part(part) { return (this.tris[part] ??= []); }

    /** One flat-shaded triangle, counter-clockwise seen from its front; UVs projected along its main axis. */
    Tri(a, b, c, part) {
        const e1 = b.map((n, i) => n - a[i]), e2 = c.map((n, i) => n - a[i]);
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const len = Math.hypot(...n);
        const ni = this.#Add(this.vn, n.map(x => x / len));
        const axis = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
        const [ui, vi] = [[1, 2], [2, 0], [0, 1]][axis];
        this.#Part(part).push([a, b, c].map(p => [
            this.#Add(this.v, p),
            this.#Add(this.vt, [p[ui] / this.uvTile, p[vi] / this.uvTile]),
            ni,
        ]));
    }

    /**
     * Flat 2D shapes ({ outer, holes }) at depth d along `axis`, facing +axis
     * (facing -1: -axis) — one side only, e.g. a decal-like layer on a cap.
     */
    Cap(shapes, d, part, axis = "x", facing = 1) {
        const To = AXES[axis];
        const out = this.#Part(part);
        const normal = this.#Add(this.vn, To(0, 0, facing));
        for (const s of shapes) {
            const flat = [s.outer, ...s.holes].flat();
            const holeIdx = [];
            let n = s.outer.length;
            for (const h of s.holes) { holeIdx.push(n); n += h.length; }
            const t = earcut(flat.flat(), holeIdx, 2);
            const verts = flat.map(([u, v]) => this.#Add(this.v, To(u, v, d)));
            const uvs = flat.map(([u, v]) => this.#Add(this.vt, [u / this.uvTile, v / this.uvTile]));
            for (let i = 0; i < t.length; i += 3) {
                let [a, b, c] = [t[i], t[i + 1], t[i + 2]];
                if ((Area([flat[a], flat[b], flat[c]]) < 0) === (facing > 0)) [b, c] = [c, b];
                out.push([a, b, c].map(k => [verts[k], uvs[k], normal]));
            }
        }
    }

    /**
     * Extrudes 2D shapes ({ outer, holes }: outer counter-clockwise, holes
     * clockwise) along `axis` from depth d0 to d1, both caps and the sides —
     * smooth along curves, hard at corners sharper than 35°. The front cap (d1)
     * can get its own part, `frontPart`.
     */
    Extrude(shapes, d0, d1, part, axis = "x", frontPart = part) {
        const To = AXES[axis];
        const out = this.#Part(part);
        this.Cap(shapes, d1, frontPart, axis);
        this.Cap(shapes, d0, part, axis, -1);
        for (const pts of shapes.flatMap(s => [s.outer, ...s.holes])) {
            const n = pts.length;
            const edgeN = pts.map((p, i) => {
                const q = pts[(i + 1) % n];
                const du = q[0] - p[0], dv = q[1] - p[1], len = Math.hypot(du, dv);
                return [dv / len, -du / len]; // outward: outers CCW, holes CW
            });
            const Corner = (i, e) => { // normal at point i for edge e (i's own edge or the one before)
                const other = e === i ? edgeN[(i - 1 + n) % n] : edgeN[i];
                const mine = edgeN[e];
                if (mine[0] * other[0] + mine[1] * other[1] < this.smoothCos) return mine;
                const u = mine[0] + other[0], v = mine[1] + other[1], len = Math.hypot(u, v);
                return [u / len, v / len];
            };
            let along = 0;
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const p = pts[i], q = pts[j];
                const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
                const nP = Corner(i, i), nQ = Corner(j, i);
                const pf = this.#Add(this.v, To(p[0], p[1], d1)), pb = this.#Add(this.v, To(p[0], p[1], d0));
                const qf = this.#Add(this.v, To(q[0], q[1], d1)), qb = this.#Add(this.v, To(q[0], q[1], d0));
                const np = this.#Add(this.vn, To(nP[0], nP[1], 0)), nq = this.#Add(this.vn, To(nQ[0], nQ[1], 0));
                const u0 = along / this.uvTile, u1 = (along + len) / this.uvTile;
                const v0 = d0 / this.uvTile, v1 = d1 / this.uvTile;
                along += len;
                const tf = this.#Add(this.vt, [u0, v1]), tb = this.#Add(this.vt, [u0, v0]);
                const uf = this.#Add(this.vt, [u1, v1]), ub = this.#Add(this.vt, [u1, v0]);
                // Outward normal with edge p->q: counter-clockwise seen from outside is pb, qb, qf, pf.
                out.push([[pb, tb, np], [qb, ub, nq], [qf, uf, nq]]);
                out.push([[pb, tb, np], [qf, uf, nq], [pf, tf, np]]);
            }
        }
    }

    get triangleCount() { return Object.values(this.tris).reduce((s, t) => s + t.length, 0); }
}

/** A rectangle with its corners cut off by `chamfer` (an octagon if it's big enough), counter-clockwise. */
export function ChamferedRect(cu, cv, w, h, chamfer) {
    const u0 = cu - w / 2, u1 = cu + w / 2, v0 = cv - h / 2, v1 = cv + h / 2, c = chamfer;
    if (c <= 0) return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    return [[u0 + c, v0], [u1 - c, v0], [u1, v0 + c], [u1, v1 - c], [u1 - c, v1], [u0 + c, v1], [u0, v1 - c], [u0, v0 + c]];
}

/**
 * The mesh as an .obj, its parts as materials named `<name>_<part>`. ModelDoc
 * reads an OBJ as Y up and turns (x, y, z) into Source (z, x, y), so Source
 * (x, y, z) is written as (y, z, x).
 */
export function ObjText(mesh, name, generator) {
    const fmt = n => (Math.abs(n) < 1e-9 ? 0 : +n.toFixed(5));
    const face = tri => "f " + tri.map(c => c.join("/")).join(" ");
    return [
        `# AUTO-GENERATED by ${generator} — edit the script, not this file.`,
        "# Y up (OBJ convention): ModelDoc turns (x, y, z) into Source (z, x, y), so this is Source (y, z, x).",
        `o ${name}_mesh`,
        ...mesh.v.map(([x, y, z]) => `v ${[y, z, x].map(fmt).join(" ")}`),
        ...mesh.vt.map(t => `vt ${t.map(fmt).join(" ")}`),
        ...mesh.vn.map(([x, y, z]) => `vn ${[y, z, x].map(fmt).join(" ")}`),
        ...Object.entries(mesh.tris).flatMap(([part, tris]) => [`usemtl ${name}_${part}`, ...tris.map(face)]),
        "",
    ].join("\n");
}

/**
 * A ModelDoc .vmdl: the render mesh from `obj`, collision from `physicsObj`
 * (a concave mesh), each `<name>_<part>` material remapped to materials[part].
 */
export function VmdlText({ name, obj, physicsObj, materials }) {
    const remaps = Object.entries(materials).flatMap(([part, vmat]) => [
        `\t\t\t\t\t\t{ from = "${name}_${part}.vmat" to = "${vmat}" },`,
        `\t\t\t\t\t\t{ from = "${name}_${part}" to = "${vmat}" },`,
    ]).join("\n");
    return `<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:modeldoc36:version{972dada4-b828-45a4-bb93-7795cf0585da} -->
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
${remaps}
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
						filename = "${obj}"
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
						name = "${name}"
						parent_bone = ""
						surface_prop = "default"
						collision_tags = "solid"
						recenter_on_parent_bone = false
						offset_origin = [ 0.0, 0.0, 0.0 ]
						offset_angles = [ 0.0, 0.0, 0.0 ]
						align_origin_x_type = "None"
						align_origin_y_type = "None"
						align_origin_z_type = "None"
						filename = "${physicsObj}"
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
}

/**
 * A csgo_complex .vmat in a solid color texture `texture`; with `glow` (self
 * illumination brightness) it lights itself, like the map's glow* materials.
 */
export function VmatText({ texture, generator, metalness = 0, glow = 0 }) {
    const illum = glow ? `
	F_SELF_ILLUM 1
	g_flSelfIllumAlbedoFactor "1.000"
	g_flSelfIllumBrightness "${glow.toFixed(3)}"
	g_flSelfIllumScale "1.000"
	g_vSelfIllumTint "[1.000000 1.000000 1.000000 1.000000]"
	TextureSelfIllumMask "materials/glowwhite.png"
` : "";
    return `// AUTO-GENERATED by ${generator}

Layer0
{
	shader "csgo_complex.vfx"
${illum}
	g_flModelTintAmount "1.000"
	g_vColorTint "[1.000000 1.000000 1.000000 0.000000]"
	TextureColor "${texture}"

	g_flMetalness "${metalness.toFixed(3)}"
	TextureRoughness "materials/default/default_rough.tga"
	TextureNormal "materials/default/default_normal.tga"
}
`;
}

/** A 4x4 PNG in one color. */
export const SolidPng = rgb => EncodePng(4, 4, () => [...rgb, 255]);

/** Writes `path` (relative to the addon root), creating its folder. */
export function WriteAddonFile(path, data) {
    const url = new URL(`../${path}`, import.meta.url);
    mkdirSync(new URL(".", url), { recursive: true });
    writeFileSync(url, data);
    console.log(`wrote ${path}`);
}
