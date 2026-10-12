// Shared by the model generators in tools/ (make-logo-model.mjs,
// make-checkpoint-model.mjs, make-podium-model.mjs, ...): a small mesh builder
// (extruded 2D shapes, single triangles), 2D outlines to feed it (Shape,
// Circle, RadialOutline, Slot, ChamferedRect) and the files Hammer needs — the
// .obj and ModelDoc .vmdl of a model, a .dmx to import as mesh geometry, and
// plain or glowing .vmat materials. Coordinates are
// Source units, Z up; ObjText writes them the way ModelDoc reads an OBJ.
import { createHash } from "node:crypto";
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

    /** One corner: a new vertex, texcoord and normal. */
    #Corner(p, n, uv) {
        return [this.#Add(this.v, p), this.#Add(this.vt, uv), this.#Add(this.vn, n)];
    }

    /** A smooth-shaded triangle of three corners, turned so it faces the way its normals point. */
    #SmoothTri(a, b, c, part) {
        const [pa, pb, pc] = [a, b, c].map(k => this.v[k[0] - 1]);
        const n = V3.Cross(V3.Sub(pb, pa), V3.Sub(pc, pa));
        if (Math.hypot(...n) < 1e-9) return;
        const avg = V3.Add(V3.Add(this.vn[a[2] - 1], this.vn[b[2] - 1]), this.vn[c[2] - 1]);
        this.#Part(part).push(V3.Dot(n, avg) >= 0 ? [a, b, c] : [a, c, b]);
    }

    /**
     * A round tube along `centers` (3D points), smooth all around: `radius` a
     * number or radius(i) per point, `sides` around; with `caps` both ends
     * closed flat. Bends without twisting (each ring's frame follows the last).
     * `slopedNormals`: where the radius changes along the tube, the normals
     * tilt with the surface (a rounded end, a pinched seam, a lathed profile
     * on a straight line of centers) instead of pointing straight out.
     */
    Tube(centers, radius, sides, part, caps = true, { slopedNormals = false } = {}) {
        const R = typeof radius === "function" ? radius : () => radius;
        const n = centers.length;
        const tangents = centers.map((_, i) => V3.Unit(V3.Sub(centers[Math.min(i + 1, n - 1)], centers[Math.max(i - 1, 0)])));
        let normal = V3.Unit(V3.Cross(tangents[0], Math.abs(tangents[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
        let along = 0;
        const rings = centers.map((c, i) => {
            const t = tangents[i];
            normal = V3.Unit(V3.Sub(normal, V3.Scale(t, V3.Dot(normal, t)))); // the last frame, turned onto this tangent
            const side = V3.Cross(t, normal);
            if (i > 0) along += Math.hypot(...V3.Sub(c, centers[i - 1]));
            const r = R(i);
            const prev = Math.max(i - 1, 0), next = Math.min(i + 1, n - 1);
            const slope = slopedNormals ? (R(next) - R(prev)) / Math.hypot(...V3.Sub(centers[next], centers[prev])) : 0;
            const ring = [];
            for (let k = 0; k <= sides; k++) { // k = sides repeats k = 0 with u = 1, for the UV seam
                const phi = (2 * Math.PI * k) / sides;
                const radial = V3.Add(V3.Scale(normal, Math.cos(phi)), V3.Scale(side, Math.sin(phi)));
                const shade = slope ? V3.Unit(V3.Sub(radial, V3.Scale(t, slope))) : radial;
                ring.push(this.#Corner(V3.Add(c, V3.Scale(radial, r)), shade, [(k / sides) * ((2 * Math.PI * r) / this.uvTile), along / this.uvTile]));
            }
            return { c, t, ring };
        });
        for (let i = 0; i + 1 < n; i++) {
            for (let k = 0; k < sides; k++) {
                const a = rings[i].ring[k], b = rings[i].ring[k + 1], c = rings[i + 1].ring[k + 1], d = rings[i + 1].ring[k];
                this.#SmoothTri(a, b, c, part);
                this.#SmoothTri(a, c, d, part);
            }
        }
        if (!caps) return;
        for (const [{ c, t, ring }, dir] of [[rings[0], -1], [rings[n - 1], 1]]) {
            const out = V3.Scale(t, dir);
            const center = this.#Corner(c, out, [0, 0]);
            const flat = ring.map(([v, vt]) => this.#Corner(this.v[v - 1], out, this.vt[vt - 1]));
            for (let k = 0; k < sides; k++) this.#SmoothTri(center, flat[k], flat[k + 1], part);
        }
    }

    /**
     * A smooth surface through `grid` (rows of 3D points, all the same
     * length; row i + 1 runs next to row i), normals from the neighbouring
     * points — a canopy, a flag. With `away` (a 3D point) it faces away from
     * that point, `flip` turns it around (the other side of a two-sided
     * surface: the same grid again, flipped). UVs run 0..1 across the columns
     * and down the rows, times `uvScale`. With `wrap` the columns go all the
     * way round (each row's last point is its first again): smooth over that
     * seam too.
     */
    Surface(grid, part, { away, flip = false, uvScale = [1, 1], wrap = false } = {}) {
        const rows = grid.length, cols = grid[0].length;
        const Next = j => (wrap && j === cols - 1 ? 1 : Math.min(j + 1, cols - 1));
        const Prev = j => (wrap && j === 0 ? cols - 2 : Math.max(j - 1, 0));
        const corners = grid.map((row, i) => row.map((p, j) => {
            const du = V3.Sub(row[Next(j)], row[Prev(j)]);
            const dv = V3.Sub(grid[Math.min(i + 1, rows - 1)][j], grid[Math.max(i - 1, 0)][j]);
            let n = V3.Cross(du, dv);
            if (Math.hypot(...n) < 1e-9) n = away ? V3.Sub(p, away) : [0, 0, 1];
            n = V3.Unit(n);
            if (away && V3.Dot(n, V3.Sub(p, away)) < 0) n = V3.Scale(n, -1);
            if (flip) n = V3.Scale(n, -1);
            return this.#Corner(p, n, [(j / (cols - 1)) * uvScale[0], (i / (rows - 1)) * uvScale[1]]);
        }));
        for (let i = 0; i + 1 < rows; i++) {
            for (let j = 0; j + 1 < cols; j++) {
                const a = corners[i][j], b = corners[i][j + 1], c = corners[i + 1][j + 1], d = corners[i + 1][j];
                this.#SmoothTri(a, b, c, part);
                this.#SmoothTri(a, c, d, part);
            }
        }
    }

    /** A cone from a round `base` (center, `radius`, `sides`) to the point `tip`, smooth-shaded, its base closed flat. */
    Cone(base, tip, radius, sides, part) {
        const axis = V3.Sub(tip, base), height = Math.hypot(...axis), up = V3.Unit(axis);
        const normal = V3.Unit(V3.Cross(up, Math.abs(up[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
        const side = V3.Cross(up, normal);
        const Radial = phi => V3.Add(V3.Scale(normal, Math.cos(phi)), V3.Scale(side, Math.sin(phi)));
        const SideNormal = phi => V3.Unit(V3.Add(V3.Scale(Radial(phi), height), V3.Scale(up, radius)));
        const down = V3.Scale(up, -1);
        const center = this.#Corner(base, down, [0, 0]);
        for (let k = 0; k < sides; k++) {
            const p0 = (2 * Math.PI * k) / sides, p1 = (2 * Math.PI * (k + 1)) / sides;
            const b0 = V3.Add(base, V3.Scale(Radial(p0), radius)), b1 = V3.Add(base, V3.Scale(Radial(p1), radius));
            const uv = p => [p / (2 * Math.PI), 0];
            this.#SmoothTri(
                this.#Corner(b0, SideNormal(p0), uv(p0)),
                this.#Corner(b1, SideNormal(p1), uv(p1)),
                this.#Corner(tip, SideNormal((p0 + p1) / 2), [(p0 + p1) / (4 * Math.PI), 1]),
                part,
            );
            this.#SmoothTri(center, this.#Corner(b1, down, [0, 0]), this.#Corner(b0, down, [0, 0]), part);
        }
    }

    get triangleCount() { return Object.values(this.tris).reduce((s, t) => s + t.length, 0); }
}

/** 3D vector helpers ([x, y, z] arrays). */
export const V3 = {
    Add: (a, b) => a.map((n, i) => n + b[i]),
    Sub: (a, b) => a.map((n, i) => n - b[i]),
    Scale: (a, s) => a.map(n => n * s),
    Dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    Cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    Unit: a => a.map(n => n / Math.hypot(...a)),
};

/**
 * A helix's centerline around the Z axis through (x, y): from z0 to z1 in
 * `turns` turns, `stepsPerTurn` points each — a coil spring for Mesh.Tube.
 */
export function Helix(x, y, radius, z0, z1, turns, stepsPerTurn) {
    const steps = Math.round(turns * stepsPerTurn);
    return Array.from({ length: steps + 1 }, (_, i) => {
        const a = (2 * Math.PI * i) / stepsPerTurn;
        return [x + radius * Math.cos(a), y + radius * Math.sin(a), z0 + ((z1 - z0) * i) / steps];
    });
}

/**
 * Shapes as Mesh.Extrude/Cap want them: one outline with optional holes, the
 * outline turned counter-clockwise and the holes clockwise whichever way they
 * were drawn.
 */
export function Shape(outer, holes = []) {
    const Turn = (pts, ccw) => ((Area(pts) > 0) === ccw ? pts : [...pts].reverse());
    return [{ outer: Turn(outer, true), holes: holes.map(h => Turn(h, false)) }];
}

/** A circle (or regular polygon) of `sides` points around (u, v), counter-clockwise, the first at angle `start` (radians). */
export const Circle = (u, v, r, sides, start = 0) => Array.from({ length: sides }, (_, i) => {
    const a = start + (2 * Math.PI * i) / sides;
    return [u + r * Math.cos(a), v + r * Math.sin(a)];
});

/**
 * An outline around (u, v) made of one profile repeated `count` times — saw
 * teeth, gear teeth, a star, a scalloped edge. `profile` is a list of [t, r]:
 * t in [0, 1) is the position within one repeat (counter-clockwise), r the
 * radius there. Counter-clockwise, the first repeat starting at `start`.
 */
export function RadialOutline(u, v, count, profile, start = 0) {
    const pts = [];
    for (let k = 0; k < count; k++) {
        for (const [t, r] of profile) {
            const a = start + (2 * Math.PI * (k + t)) / count;
            pts.push([u + r * Math.cos(a), v + r * Math.sin(a)]);
        }
    }
    return pts;
}

/** A point at `radius` and `angle` (radians) around (u, v). */
export const Polar = (u, v, radius, angle) => [u + radius * Math.cos(angle), v + radius * Math.sin(angle)];

/** A slot (a 2D capsule): rounded ends of `radius` around points a and b, `endSides` points per end, counter-clockwise. */
export function Slot(a, b, radius, endSides = 6) {
    const dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const End = (c, from) => Array.from({ length: endSides + 1 }, (_, i) => Polar(c[0], c[1], radius, from + (Math.PI * i) / endSides));
    return [...End(b, dir - Math.PI / 2), ...End(a, dir + Math.PI / 2)];
}

/** A rectangle with its corners cut off by `chamfer` (an octagon if it's big enough), counter-clockwise. */
export function ChamferedRect(cu, cv, w, h, chamfer) {
    const u0 = cu - w / 2, u1 = cu + w / 2, v0 = cv - h / 2, v1 = cv + h / 2, c = chamfer;
    if (c <= 0) return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    return [[u0 + c, v0], [u1 - c, v0], [u1, v0 + c], [u1, v1 - c], [u1 - c, v1], [u0 + c, v1], [u0, v1 - c], [u0, v0 + c]];
}

/** A seeded random 0..1 (mulberry32): the same numbers on every run, so a generator's output doesn't change. */
export function SeededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The mesh as an .obj, its parts as materials named `<name>_<part>`. ModelDoc
 * reads an OBJ as Y up and turns (x, y, z) into Source (z, x, y), so Source
 * (x, y, z) is written as (y, z, x).
 *
 * `smd`: the collision of a model whose render mesh is an .smd. ModelDoc
 * turns an .smd 90 degrees around Z on import (its root bone gets a +90
 * degree yaw: (x, y, z) -> (-y, x, z)), but not an .obj — without the same
 * turn here the collision stands crosswise to what's drawn (the bouncer's
 * paddle was only as wide as it is thick; checked in the compiled .vmdl_c).
 */
export function ObjText(mesh, name, generator, { smd = false } = {}) {
    const fmt = n => (Math.abs(n) < 1e-9 ? 0 : +n.toFixed(5));
    const face = tri => "f " + tri.map(c => c.join("/")).join(" ");
    const Turn = ([x, y, z]) => (smd ? [-y, x, z] : [x, y, z]);
    return [
        `# AUTO-GENERATED by ${generator} - edit the script, not this file.`,
        "# Y up (OBJ convention): ModelDoc turns (x, y, z) into Source (z, x, y), so this is Source (y, z, x).",
        ...(smd ? ["# Turned +90 degrees around Z like ModelDoc turns the model's .smd render mesh."] : []),
        `o ${name}_mesh`,
        ...mesh.v.map(p => Turn(p)).map(([x, y, z]) => `v ${[y, z, x].map(fmt).join(" ")}`),
        ...mesh.vt.map(t => `vt ${t.map(fmt).join(" ")}`),
        ...mesh.vn.map(p => Turn(p)).map(([x, y, z]) => `vn ${[y, z, x].map(fmt).join(" ")}`),
        ...Object.entries(mesh.tris).flatMap(([part, tris]) => [`usemtl ${name}_${part}`, ...tris.map(face)]),
        "",
    ].join("\n");
}

// --- SMD: a mesh skinned to a skeleton, and its animations (Source
// coordinates, Z up; rotations in radians, X Y Z). The parser takes no comment
// lines, so SMD files carry no AUTO-GENERATED banner. Bones are
// [{ name, parent (index, -1 for the root), bind (position relative to the parent) }],
// a frame is one { pos, rot } per bone, relative to its parent. ---
const SmdNum = n => (Math.abs(n) < 1e-7 ? 0 : n).toFixed(6);
const SmdNodes = bones => ["nodes", ...bones.map((b, i) => `${i} "${b.name}" ${b.parent}`), "end"];
const SmdSkeleton = frames => ["skeleton", ...frames.flatMap((frame, time) => [
    `time ${time}`,
    ...frame.map(({ pos, rot }, i) => `${i} ${pos.map(SmdNum).join(" ")} ${rot.map(SmdNum).join(" ")}`),
]), "end"];

/** The bind pose as a frame: every bone at its `bind` position, unrotated. */
export const BindFrame = bones => bones.map(b => ({ pos: b.bind, rot: [0, 0, 0] }));

/** An animation .smd: the skeleton in each of `frames`, one per animation frame. */
export const SmdAnimationText = (bones, frames) => ["version 1", ...SmdNodes(bones), ...SmdSkeleton(frames), ""].join("\n");

/**
 * A reference .smd (the render mesh): the skeleton in its bind pose and
 * `triangles`, each { material, corners: [{ p, n, uv, weights: [[bone, weight]] }] },
 * counter-clockwise seen from the front.
 */
export function SmdText(bones, triangles) {
    return [
        "version 1",
        ...SmdNodes(bones),
        ...SmdSkeleton([BindFrame(bones)]),
        "triangles",
        ...triangles.flatMap(({ material, corners }) => [
            material,
            ...corners.map(({ p, n, uv, weights }) => {
                const parent = weights.reduce((best, w) => (w[1] > best[1] ? w : best))[0];
                return `${parent} ${p.map(SmdNum).join(" ")} ${n.map(SmdNum).join(" ")} ${SmdNum(uv[0])} ${SmdNum(1 - uv[1])} ${weights.length} ${weights.map(([b, w]) => `${b} ${SmdNum(w)}`).join(" ")}`;
            }),
        ]),
        "end",
        "",
    ].join("\n");
}

/**
 * A Mesh's triangles as SmdText wants them, materials named `<name>_<part>`
 * like ObjText's. `bone` is the bone every corner hangs on, or
 * bone(position, part) giving each corner's weights ([[bone, weight]]) —
 * e.g. a spring blended between its two ends.
 */
export function MeshSmdTriangles(mesh, name, bone) {
    const Weights = typeof bone === "function" ? bone : () => [[bone, 1]];
    return Object.entries(mesh.tris).flatMap(([part, tris]) => tris.map(tri => ({
        material: `${name}_${part}`,
        corners: tri.map(([v, vt, vn]) => ({ p: mesh.v[v - 1], n: mesh.vn[vn - 1], uv: mesh.vt[vt - 1], weights: Weights(mesh.v[v - 1], part) })),
    })));
}

/** One AnimationList entry of VmdlText. */
const AnimFile = ({ name, file, looping }) => `					{
						_class = "AnimFile"
						name = "${name}"
						activity_name = ""
						activity_weight = 1
						weight_list_name = ""
						fade_in_time = 0.1
						fade_out_time = 0.1
						looping = ${looping}
						delta = false
						worldSpace = false
						hidden = false
						anim_markup_ordered = false
						disable_compression = false
						source_filename = "${file}"
						start_frame = -1
						end_frame = -1
						framerate = -1.0
						reverse = false
					},`;

/**
 * A ModelDoc .vmdl: the render mesh from `mesh` (an .obj, or an .smd with a
 * skeleton), collision from `physicsObj` (a concave mesh, `surfaceProp`; none
 * without one — the model is never solid; or a list [{ file, bone }] of
 * meshes, each moving with its bone — model space, bind pose), each
 * `<name>_<part>` material remapped to materials[part]; with `animations`
 * ([{ name, file (an .smd from SmdAnimationText), looping }]) also an
 * animation list — the first one is listed first. For a physics prop that
 * moves: `hulls` ([{ file, surfaceProp }], each one convex piece — a
 * dynamic body can't use a concave mesh, Valve's own carts are built the
 * same way) in place of `physicsObj`, and `body` ({ mass, linearDamping,
 * angularDamping }) for its mass (kg) and damping.
 */
export function VmdlText({ name, mesh, physicsObj, materials, animations = [], surfaceProp = "default", hulls = [], body }) {
    const remaps = Object.entries(materials).flatMap(([part, vmat]) => [
        `\t\t\t\t\t\t\t{ from = "${name}_${part}.vmat" to = "${vmat}" },`,
        `\t\t\t\t\t\t\t{ from = "${name}_${part}" to = "${vmat}" },`,
    ]).join("\n");
    const shapes = !physicsObj ? [] : typeof physicsObj === "string" ? [{ file: physicsObj, bone: "" }] : physicsObj;
    const physicsList = shapes.length ? `
			{
				_class = "PhysicsShapeList"
				children =
				[${shapes.map(({ file, bone }, i) => `
					{
						_class = "PhysicsMeshFile"
						name = "${i === 0 ? name : `${name}_${i}`}"
						parent_bone = "${bone}"
						surface_prop = "${surfaceProp}"
						collision_tags = "solid"
						recenter_on_parent_bone = false
						offset_origin = [ 0.0, 0.0, 0.0 ]
						offset_angles = [ 0.0, 0.0, 0.0 ]
						align_origin_x_type = "None"
						align_origin_y_type = "None"
						align_origin_z_type = "None"
						filename = "${file}"
						import_scale = 1.0
						maxMeshVertices = 0
						qemError = 0.0
						import_filter =
						{
							exclude_by_default = false
							exception_list = [  ]
						}
					},`).join("")}
				]
			},` : "";
    const hullList = hulls.length ? `
			{
				_class = "PhysicsShapeList"
				children =
				[${hulls.map(({ file, surfaceProp: prop = surfaceProp }, i) => `
					{
						_class = "PhysicsHullFile"
						filename = "${file}"
						parent_bone = ""
						surface_prop = "${prop}"
						collision_tags = "solid"
						name = "${name}_hull_${i}"
					},`).join("")}
				]
			},` : "";
    const bodyMarkup = body ? `
			{
				_class = "PhysicsBodyMarkupList"
				children =
				[
					{
						_class = "PhysicsBodyMarkup"
						target_body = ""
						mass_override = ${body.mass.toFixed(3)}
						inertia_scale = 1.0
						linear_damping = ${body.linearDamping.toFixed(2)}
						angular_damping = ${body.angularDamping.toFixed(2)}
						use_mass_center_override = false
						mass_center_override = [ 0.0, 0.0, 0.0 ]
					},
				]
			},` : "";
    const animationList = animations.length ? `
			{
				_class = "AnimationList"
				children =
				[
${animations.map(AnimFile).join("\n")}
				]
				default_root_bone_name = ""
			},` : "";
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
						filename = "${mesh}"
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
			},${animationList}${physicsList}${hullList}${bodyMarkup}
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
 * A csgo_complex .vmat with the color texture `texture` (and optionally a
 * `normal` map, OpenGL style, and a `roughness` map); with `glow` (self
 * illumination brightness) it lights itself, like the map's glow* materials —
 * all over, or only where `glowMask` is white. `tint` is how much an entity's
 * render color tints it (0 = not at all).
 */
export function VmatText({ texture, generator, metalness = 0, glow = 0, glowMask = "materials/glowwhite.png", tint = 1, normal = "materials/default/default_normal.tga", roughness = "materials/default/default_rough.tga" }) {
    const illum = glow ? `
	F_SELF_ILLUM 1
	g_flSelfIllumAlbedoFactor "1.000"
	g_flSelfIllumBrightness "${glow.toFixed(3)}"
	g_flSelfIllumScale "1.000"
	g_vSelfIllumTint "[1.000000 1.000000 1.000000 1.000000]"
	TextureSelfIllumMask "${glowMask}"
` : "";
    return `// AUTO-GENERATED by ${generator}

Layer0
{
	shader "csgo_complex.vfx"
${illum}
	g_flModelTintAmount "${tint.toFixed(3)}"
	g_vColorTint "[1.000000 1.000000 1.000000 0.000000]"
	TextureColor "${texture}"

	g_flMetalness "${metalness.toFixed(3)}"
	TextureRoughness "${roughness}"
	TextureNormal "${normal}"
}
`;
}

/** A 4x4 PNG in one color. */
export const SolidPng = rgb => EncodePng(4, 4, () => [...rgb, 255]);

// Material and model sources the resource compiler reads as text: a non-ASCII
// character in one, even in a comment, compiles "OK" but renders as the error
// checkerboard. (KV3 particles, .vpcf, take UTF-8 comments fine.)
const ASCII_ONLY = /\.(vmat|vmdl|obj|smd|dmx)$/i;

/** Writes `path` (relative to the addon root), creating its folder; refuses non-ASCII asset sources. */
export function WriteAddonFile(path, data) {
    if (ASCII_ONLY.test(path) && typeof data === "string") {
        const i = [...data].findIndex(ch => ch.charCodeAt(0) > 127);
        if (i >= 0) {
            const line = data.slice(0, i).split("\n").length;
            throw new Error(`${path}: non-ASCII "${[...data][i]}" in line ${line} - the engine would show the error checkerboard; use plain ASCII`);
        }
    }
    const url = new URL(`../../${path}`, import.meta.url);
    mkdirSync(new URL(".", url), { recursive: true });
    writeFileSync(url, data);
    console.log(`wrote ${path}`);
}

/**
 * Coplanar triangles (vertex loops, counter-clockwise) of a region that can't
 * be one face — it has a hole, like a ring — merged into as few faces as
 * greedily found: two faces join across an edge only when that edge is all
 * they share (exactly its two vertices), so every result stays a simple
 * polygon without holes; a ring ends up as a couple of curved strips.
 */
function MergeHoleFree(triangles) {
    const polys = triangles.map(t => [...t]);
    const alive = polys.map(() => true);
    const owners = new Map(); // undirected edge -> poly ids using it
    const EdgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
    const AddEdges = id => {
        const p = polys[id];
        p.forEach((a, j) => {
            const k = EdgeKey(a, p[(j + 1) % p.length]);
            if (!owners.has(k)) owners.set(k, new Set());
            owners.get(k).add(id);
        });
    };
    const RemoveEdges = id => {
        const p = polys[id];
        p.forEach((a, j) => owners.get(EdgeKey(a, p[(j + 1) % p.length]))?.delete(id));
    };
    polys.forEach((_, id) => AddEdges(id));
    // Starts at `from`, ends at `to`: the loop rotated, so the edge to->from is the closing one.
    const Rotate = (p, from) => { const i = p.indexOf(from); return [...p.slice(i), ...p.slice(0, i)]; };
    let merged = true;
    while (merged) {
        merged = false;
        for (const [, ids] of owners) {
            if (ids.size !== 2) continue;
            const [a, b] = [...ids];
            const A = polys[a], B = polys[b];
            const shared = A.filter(v => B.includes(v));
            if (shared.length !== 2) continue;
            // In A the shared edge runs u->v, in B v->u.
            const [s0, s1] = shared;
            const iu = A.indexOf(s0);
            const [u, v] = A[(iu + 1) % A.length] === s1 ? [s0, s1] : [s1, s0];
            const a1 = Rotate(A, v); // v ... u
            const b1 = Rotate(B, u); // u ... v
            RemoveEdges(a);
            RemoveEdges(b);
            polys[a] = [...a1, ...b1.slice(1, -1)];
            alive[b] = false;
            AddEdges(a);
            merged = true;
            break; // the edge map changed under the loop
        }
    }
    return polys.filter((_, id) => alive[id]);
}

/**
 * The mesh as a keyvalues2 .dmx model for Hammer's File → Import (editable
 * mesh geometry instead of a placed model), each part's faces using
 * materials[part]. Vertices are welded, and coplanar neighbouring triangles
 * of one part merge into one polygon (a side becomes one quad, a cap one
 * n-gon) so it edits like a hand-built mesh; a region with a hole stays
 * triangles. Coordinates are Source units, Z up, as in the mesh.
 */
export function DmxText(mesh, name, materials) {
    const positions = [], weld = new Map();
    const Weld = p => {
        const k = p.map(n => n.toFixed(4)).join(" ");
        if (!weld.has(k)) { weld.set(k, positions.length); positions.push(p); }
        return weld.get(k);
    };
    const posOf = mesh.v.map(Weld); // mesh vertex (0-based) -> welded index
    // Face-vertex streams: each corner its position, normal and texcoord index.
    const fvPos = [], fvNormal = [], fvUv = [];
    const faceSets = [];
    for (const [part, tris] of Object.entries(mesh.tris)) {
        const faces = [];
        const corners = tris.map(t => t.map(([v, vt, vn]) => ({ p: posOf[v - 1], vt: vt - 1, vn: vn - 1 })));
        const Emit = loop => {
            for (const c of loop) { faces.push(fvPos.length); fvPos.push(c.p); fvNormal.push(c.vn); fvUv.push(c.vt); }
            faces.push(-1);
        };
        // Group by plane, then by shared edges.
        const groups = new Map();
        corners.forEach((tri, i) => {
            const [a, b, c] = tri.map(t => positions[t.p]);
            const e1 = b.map((n, j) => n - a[j]), e2 = c.map((n, j) => n - a[j]);
            const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            const len = Math.hypot(...n);
            if (len < 1e-9) return; // degenerate
            const u = n.map(x => x / len);
            const k = `${u.map(x => x.toFixed(3)).join(",")}|${(u[0] * a[0] + u[1] * a[1] + u[2] * a[2]).toFixed(2)}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(i);
        });
        for (const members of groups.values()) {
            const parent = new Map(members.map(i => [i, i]));
            const Find = i => {
                while (parent.get(i) !== i) i = parent.get(i);
                return i;
            };
            const byEdge = new Map();
            for (const i of members) {
                const t = corners[i];
                for (let j = 0; j < 3; j++) {
                    const a = t[j].p, b = t[(j + 1) % 3].p;
                    const e = a < b ? `${a}_${b}` : `${b}_${a}`;
                    if (byEdge.has(e)) parent.set(Find(i), Find(byEdge.get(e)));
                    else byEdge.set(e, i);
                }
            }
            const regions = new Map();
            for (const i of members) {
                const r = Find(i);
                if (!regions.has(r)) regions.set(r, []);
                regions.get(r).push(i);
            }
            for (const region of regions.values()) {
                if (region.length === 1) { Emit(corners[region[0]]); continue; }
                // Boundary: directed edges whose reverse isn't in the region.
                const directed = new Set(), cornerAt = new Map();
                for (const i of region) {
                    corners[i].forEach((c, j) => {
                        directed.add(`${c.p}>${corners[i][(j + 1) % 3].p}`);
                        cornerAt.set(c.p, c);
                    });
                }
                const next = new Map();
                let simple = true;
                for (const e of directed) {
                    const [a, b] = e.split(">").map(Number);
                    if (directed.has(`${b}>${a}`)) continue;
                    if (next.has(a)) simple = false;
                    next.set(a, b);
                }
                const loop = [];
                if (simple && next.size) {
                    let p = next.keys().next().value;
                    do { loop.push(p); p = next.get(p); } while (p !== undefined && p !== loop[0] && loop.length <= next.size);
                    simple = p === loop[0] && loop.length === next.size;
                }
                if (simple) Emit(loop.map(p => cornerAt.get(p)));
                else for (const poly of MergeHoleFree(region.map(i => corners[i].map(c => c.p)))) Emit(poly.map(p => cornerAt.get(p)));
            }
        }
        faceSets.push({ part, faces });
    }

    // Deterministic ids, so re-running the script changes only what changed.
    let idCount = 0;
    const Id = () => {
        const h = createHash("md5").update(`${name}:${idCount++}`).digest("hex");
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
    };
    const fmt = n => (Math.abs(n) < 1e-9 ? "0" : String(+n.toFixed(5)));
    const Arr = (type, items) => `"${type}"\n\t[\n${items.map(s => `\t\t"${s}"`).join(",\n")}\n\t]`;
    const Refs = ids => `"element_array"\n\t[\n${ids.map(id => `\t\t"element" "${id}"`).join(",\n")}\n\t]`;
    const Element = (type, id, elementName, lines) => [`"${type}"`, "{", `\t"id" "elementid" "${id}"`, `\t"name" "string" "${elementName}"`, ...lines.map(l => `\t${l}`), "}"].join("\n");
    const Transform = (id, elementName) => Element("DmeTransform", id, elementName, ['"position" "vector3" "0 0 0"', '"orientation" "quaternion" "0 0 0 1"']);
    const ids = { root: Id(), model: Id(), dag: Id(), mesh: Id(), data: Id(), modelTf: Id(), dagTf: Id(), tfList: Id(), baseModelTf: Id(), baseDagTf: Id() };
    const sets = faceSets.map(s => ({ ...s, id: Id(), material: Id() }));
    return [
        "<!-- dmx encoding keyvalues2 1 format model 22 -->",
        Element("DmElement", ids.root, "root", [`"skeleton" "element" "${ids.model}"`, `"model" "element" "${ids.model}"`]),
        Element("DmeModel", ids.model, name, [
            `"transform" "element" "${ids.modelTf}"`,
            '"shape" "element" ""',
            '"visible" "bool" "1"',
            `"children" ${Refs([ids.dag])}`,
            `"jointList" ${Refs([ids.model, ids.dag])}`,
            `"baseStates" ${Refs([ids.tfList])}`,
            '"upAxis" "string" "Z"',
        ]),
        Element("DmeTransformList", ids.tfList, "bind", [`"transforms" ${Refs([ids.baseModelTf, ids.baseDagTf])}`]),
        Transform(ids.modelTf, name),
        Transform(ids.dagTf, `${name}_mesh`),
        Transform(ids.baseModelTf, name),
        Transform(ids.baseDagTf, `${name}_mesh`),
        Element("DmeDag", ids.dag, `${name}_mesh`, [
            `"transform" "element" "${ids.dagTf}"`,
            `"shape" "element" "${ids.mesh}"`,
            '"visible" "bool" "1"',
            `"children" ${Refs([])}`,
        ]),
        Element("DmeMesh", ids.mesh, `${name}_mesh`, [
            '"visible" "bool" "1"',
            `"currentState" "element" "${ids.data}"`,
            `"baseStates" ${Refs([ids.data])}`,
            `"faceSets" ${Refs(sets.map(s => s.id))}`,
        ]),
        Element("DmeVertexData", ids.data, "bind", [
            `"vertexFormat" ${Arr("string_array", ["position$0", "normal$0", "texcoord$0"])}`,
            '"jointCount" "int" "0"',
            '"flipVCoordinates" "bool" "0"',
            `"position$0" ${Arr("vector3_array", positions.map(p => p.map(fmt).join(" ")))}`,
            `"position$0Indices" ${Arr("int_array", fvPos)}`,
            `"normal$0" ${Arr("vector3_array", mesh.vn.map(n => n.map(fmt).join(" ")))}`,
            `"normal$0Indices" ${Arr("int_array", fvNormal)}`,
            `"texcoord$0" ${Arr("vector2_array", mesh.vt.map(t => t.map(fmt).join(" ")))}`,
            `"texcoord$0Indices" ${Arr("int_array", fvUv)}`,
        ]),
        ...sets.map(s => Element("DmeFaceSet", s.id, s.part, [`"faces" ${Arr("int_array", s.faces)}`, `"material" "element" "${s.material}"`])),
        ...sets.map(s => Element("DmeMaterial", s.material, s.part, [`"mtlName" "string" "${materials[s.part].replace(/\.vmat$/, "")}"`])),
        "",
    ].join("\n\n");
}
