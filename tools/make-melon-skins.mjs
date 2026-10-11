// Generates the melon skins — `node tools/make-melon-skins.mjs`: a skin is
// one plain surface (gold) or painted by place on the melon's 3D surface
// (football, golf, honey, camo — see WriteSurfacePng), so shapes and
// noise run on across the texture's two discs without a seam; camo also
// keeps the rind's light and shade from the melon's own texture
// (melon_default_color.png, decompiled from CS2's watermelon). Per skin it writes
//   materials/melon_racer/melon/melon_<skin>.vmat (+ its textures)
//   models/melon_racer/melon/melon_<skin>.vmdl — a copy of melon.vmdl with
//     the material remapped, so the mesh, collision and break pieces stay one
// The skins don't take the paint color (tint 0): a painted gold melon would
// no longer be gold. The outline glow still shows the paint color.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DecodePng, EncodePng } from "./png.mjs";
import { SolidPng, VmatText, WriteAddonFile } from "./model.mjs";
import { ReadDmxElements } from "../test/helpers/vmap.mjs";

const GENERATOR = "tools/make-melon-skins.mjs";
const MAT_DIR = "materials/melon_racer/melon";
const MODEL_DIR = "models/melon_racer/melon";
const BASE_MATERIAL = `${MAT_DIR}/melon_default.vmat`;
// The rind's relief (WriteRindNormal), for the plain melon (melon_default.vmat
// points at it) and the skins that keep the rind (camo).
const RIND_NORMAL = `${MAT_DIR}/melon_rind_normal.png`;
// The skins' texture size: four times the source's 256 — at 512 the
// football's laces were visibly stair-stepped in-game.
const SIZE = 1024;
// Samples per texel side for the skins painted by place (WriteSurfacePng):
// 3 = 9 samples averaged, smooth edges on hard shapes.
const SUPERSAMPLE = 3;

const source = DecodePng(readFileSync(new URL(`../${MAT_DIR}/melon_default_color.png`, import.meta.url)));
const baseModel = readFileSync(new URL(`../${MODEL_DIR}/melon.vmdl`, import.meta.url), "utf8");

const clamp01 = v => Math.min(1, Math.max(0, v));
const byte = v => Math.round(clamp01(v) * 255);
const lerp = (a, b, t) => a + (b - a) * t;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** The source color at (u, v) in 0..1, bilinear, as 0..1 floats. */
function Sample(u, v) {
    const { width, height, channels, data } = source;
    const x = clamp01(u) * (width - 1), y = clamp01(v) * (height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const at = (px, py, c) => data[(py * width + px) * channels + c] / 255;
    return [0, 1, 2].map(c => lerp(lerp(at(x0, y0, c), at(x1, y0, c), x - x0), lerp(at(x0, y1, c), at(x1, y1, c), x - x0), y - y0));
}
const Luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const IsRind = c => c[1] > c[0] && c[1] > 0.12; // green, not the flesh's red or the black around the discs

// How light the rind is between its dark stripes and light ones: the 5th and
// 95th percentile of the green (rind) pixels' brightness, so the stripes
// map onto 0..1 whatever the source's exposure.
const rindLumas = [];
for (let i = 0; i < source.width * source.height; i++) {
    const p = [0, 1, 2].map(c => source.data[i * source.channels + c] / 255);
    if (IsRind(p)) rindLumas.push(Luma(p));
}
rindLumas.sort((a, b) => a - b);
const DARK = rindLumas[Math.floor(rindLumas.length * 0.05)];
const LIGHT = rindLumas[Math.floor(rindLumas.length * 0.95)];

// Where each texel sits on the melon: every triangle of melon.dmx drawn into
// texture space at `res`² samples, its 3D position interpolated across it.
// Lets a skin paint by place on the melon (football: laces on one side,
// bands near the ends) instead of by place in the texture, whose two discs
// warp shapes.
const mesh = (() => {
    const elements = ReadDmxElements(fileURLToPath(new URL(`../${MODEL_DIR}/melon.dmx`, import.meta.url)));
    const data = elements.find(e => e.type === "DmeVertexData").attrs;
    const all = data["position$0"];
    // The melon's center and long axis (the axis of its largest extent).
    const lo = [0, 1, 2].map(k => Math.min(...all.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...all.map(p => p[k])));
    const axis = [0, 1, 2].reduce((best, k) => (hi[k] - lo[k] > hi[best] - lo[best] ? k : best), 0);
    return {
        faces: elements.find(e => e.type === "DmeFaceSet").attrs.faces,
        pos: i => all[data["position$0Indices"][i]],
        normal: i => data["normal$0"][data["normal$0Indices"][i]],
        uv: i => data["texcoord$0"][data["texcoord$0Indices"][i]],
        center: lo.map((v, k) => (v + hi[k]) / 2),
        halfExtents: lo.map((v, k) => (hi[k] - v) / 2),
        axis,
        side: [0, 1, 2].filter(k => k !== axis), // the two axes around the long one
        halfLength: (hi[axis] - lo[axis]) / 2,
    };
})();

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a, s) => a.map(v => v * s);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = a => scale(a, 1 / (Math.hypot(...a) || 1));
/** `a` with its part along unit `n` removed, normalized. */
const orthoTo = (a, n) => normalize(sub(a, scale(n, dot(a, n))));

/**
 * The melon's surface sampled at res² points of texture space (see `mesh`).
 * With `frames`, each sample also keeps its surface normal and the
 * directions "right" (+u) and "up" in the texture (−v: rows run down) —
 * what a tangent-space normal map is written in (golf ball dimples) — and
 * how many units on the melon a whole step in u or v is.
 * @param {number} res @param {{ frames?: boolean }} [options]
 */
function Surface(res, { frames = false } = {}) {
    // Per sample: position (3), and with frames normal, right, up (3 each),
    // units per u and per v (1 each).
    const stride = frames ? 14 : 3;
    const points = new Float32Array(res * res * stride);
    const has = new Uint8Array(res * res);
    // Faces: corner indices, each polygon ended by -1 (a fan from its first corner).
    for (let i = 0; i < mesh.faces.length;) {
        const poly = [];
        while (mesh.faces[i] !== -1) poly.push(mesh.faces[i++]);
        i++;
        for (let k = 1; k + 1 < poly.length; k++) {
            const c = [poly[0], poly[k], poly[k + 1]];
            const t = c.map(j => mesh.uv(j).map(v => v * res - 0.5)), p = c.map(mesh.pos), n = c.map(mesh.normal);
            const area = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1]);
            if (!area) continue;
            // How position changes along u and v on this triangle (dP/du, dP/dv).
            const e1 = sub(p[1], p[0]), e2 = sub(p[2], p[0]);
            const du1 = t[1][0] - t[0][0], dv1 = t[1][1] - t[0][1], du2 = t[2][0] - t[0][0], dv2 = t[2][1] - t[0][1];
            const dPdu = sub(scale(e1, dv2), scale(e2, dv1)), dPdv = sub(scale(e2, du1), scale(e1, du2));
            const right = scale(dPdu, 1 / area), up = scale(dPdv, -1 / area);
            const x0 = Math.max(0, Math.floor(Math.min(...t.map(q => q[0])))), x1 = Math.min(res - 1, Math.ceil(Math.max(...t.map(q => q[0]))));
            const y0 = Math.max(0, Math.floor(Math.min(...t.map(q => q[1])))), y1 = Math.min(res - 1, Math.ceil(Math.max(...t.map(q => q[1]))));
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const w1 = ((x - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (y - t[0][1])) / area;
                const w2 = ((t[1][0] - t[0][0]) * (y - t[0][1]) - (x - t[0][0]) * (t[1][1] - t[0][1])) / area;
                const w0 = 1 - w1 - w2;
                if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
                const o = (y * res + x) * stride;
                for (let d = 0; d < 3; d++) points[o + d] = w0 * p[0][d] + w1 * p[1][d] + w2 * p[2][d] - mesh.center[d];
                if (frames) {
                    const normal = normalize([0, 1, 2].map(d => w0 * n[0][d] + w1 * n[1][d] + w2 * n[2][d]));
                    const r = orthoTo(right, normal), u = orthoTo(up, normal);
                    for (let d = 0; d < 3; d++) {
                        points[o + 3 + d] = normal[d];
                        points[o + 6 + d] = r[d];
                        points[o + 9 + d] = u[d];
                    }
                    points[o + 12] = Math.hypot(...right) * res;
                    points[o + 13] = Math.hypot(...up) * res;
                }
                has[y * res + x] = 1;
            }
        }
    }
    // Spread the edge samples outward, about 4 texels of a 512 texture, so
    // mipmaps and filtering at the discs' borders don't pull in unpainted ones.
    for (let pass = 0; pass < Math.ceil(4 * res / 512); pass++) {
        const before = has.slice();
        for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
            if (before[y * res + x]) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= res || ny >= res || !before[ny * res + nx]) continue;
                points.copyWithin((y * res + x) * stride, (ny * res + nx) * stride, (ny * res + nx) * stride + stride);
                has[y * res + x] = 1;
                break;
            }
        }
    }
    const vec = o => [points[o], points[o + 1], points[o + 2]];
    return {
        /** The position (from the center) at sample (x, y), or null off the melon. */
        PositionAt(x, y) {
            return has[y * res + x] ? vec((y * res + x) * stride) : null;
        },
        /**
         * At sample (x, y), or null off the melon: its Place, `position` from
         * the center — with frames also `normal`, `right` and `up` (unit
         * vectors) and `unitsPerU`/`unitsPerV`.
         */
        At(x, y) {
            if (!has[y * res + x]) return null;
            const o = (y * res + x) * stride;
            const on = { ...Place(vec(o)), position: vec(o) };
            return frames ? { ...on, normal: vec(o + 3), right: vec(o + 6), up: vec(o + 9), unitsPerU: points[o + 12], unitsPerV: points[o + 13] } : on;
        },
    };
}

// The laces' side: the angle around the long axis that faces the upper
// disc's center, so the laces sit in the middle of a disc, not on its warped rim.
const frontAngle = (() => {
    const res = 256, front = Surface(res).PositionAt(res / 4, res / 4);
    if (!front) throw new Error("melon.dmx: no surface at the upper disc's center — has the UV layout changed?");
    return Math.atan2(front[mesh.side[1]], front[mesh.side[0]]);
})();

/**
 * Where a position (from the center) is on the melon: `along` −1..1 from end
 * to end (`halfLength` units), `angle` around the long axis from the laces'
 * side (−π..π) and `radius` from the axis.
 * @param {number[]} p
 */
function Place(p) {
    const { axis, side, halfLength } = mesh;
    let angle = Math.atan2(p[side[1]], p[side[0]]) - frontAngle;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    return { along: p[axis] / halfLength, angle, radius: Math.hypot(p[side[0]], p[side[1]]), halfLength };
}

/**
 * A tangent-space normal map texel (OpenGL style, rgb 0..1) for a bumpy
 * surface: `height(position, u, v)` in units, its slope taken `EPS` units
 * to the texture's right and up from the sample. u/v are passed along so a
 * height can come from a texture too (the rind's stripes).
 * @param {any} on a Surface sample with frames (null: flat) @param {number} u @param {number} v
 * @param {(position: number[], u: number, v: number) => number} height
 */
function BumpNormal(on, u, v, height) {
    if (!on) return [0.5, 0.5, 1];
    const EPS = 0.03;
    const Step = dir => on.position.map((p, k) => p + dir[k] * EPS);
    const h = height(on.position, u, v);
    const sx = (height(Step(on.right), u + EPS / on.unitsPerU, v) - h) / EPS;
    const sy = (height(Step(on.up), u, v - EPS / on.unitsPerV) - h) / EPS; // up = −v
    return normalize([-sx, -sy, 1]).map(c => c * 0.5 + 0.5);
}

/**
 * Writes a size² PNG painted by place on the melon: `pixel(on, u, v)` →
 * [r, g, b] in 0..1, `on` from Surface (null off the melon), u/v the texture
 * coordinates. Every texel averages supersample² samples, so the edges of
 * hard shapes (laces, bands) come out smooth instead of stair-stepped.
 * @param {string} path @param {number} size @param {number} supersample
 * @param {(on: any, u: number, v: number) => number[]} pixel
 * @param {{ frames?: boolean }} [options] passed on to Surface
 */
function WriteSurfacePng(path, size, supersample, pixel, options) {
    const res = size * supersample;
    const surface = Surface(res, options);
    WriteAddonFile(path, EncodePng(size, size, (x, y) => {
        const sum = [0, 0, 0];
        for (let sy = 0; sy < supersample; sy++) for (let sx = 0; sx < supersample; sx++) {
            const X = x * supersample + sx, Y = y * supersample + sy;
            pixel(surface.At(X, Y), (X + 0.5) / res, (Y + 0.5) / res).forEach((c, i) => { sum[i] += c; });
        }
        return [...sum.map(c => byte(c / supersample ** 2)), 255];
    }));
}

/** The rind's lightness at texture position (u, v): 0 = dark stripe, 1 = light. */
const RindLight = (u, v) => clamp01((Luma(Sample(u, v)) - DARK) / (LIGHT - DARK));

// Smooth 3D value noise (a hashed grid, a few octaves), for the skins painted
// by place on the melon: noise by position has no seams at the texture
// discs' rims, unlike noise by texture position.
function Hash(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function ValueNoise3([x, y, z], seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const s = v => v * v * (3 - 2 * v);
    const fx = s(x - ix), fy = s(y - iy), fz = s(z - iz);
    const h = (dx, dy, dz) => Hash(ix + dx, iy + dy + 7919 * (iz + dz), seed);
    const plane = dz => lerp(lerp(h(0, 0, dz), h(1, 0, dz), fx), lerp(h(0, 1, dz), h(1, 1, dz), fx), fy);
    return lerp(plane(0), plane(1), fz);
}
function Fractal3(p, seed) {
    let sum = 0, amp = 1, total = 0;
    for (let o = 0; o < 4; o++, amp *= 0.5, p = scale(p, 2)) { sum += amp * ValueNoise3(p, seed + o); total += amp; }
    return sum / total;
}
/**
 * Cellular (Worley) noise in 3D: one random point per unit cell; returns how
 * much further the second-nearest point is than the nearest — 0 on the
 * borders between cells, so small values draw a net of cracks.
 */
function CellEdge([x, y, z], seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let f1 = Infinity, f2 = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz;
        const px = cx + Hash(cx, cy + 7919 * cz, seed), py = cy + Hash(cx, cy + 7919 * cz, seed + 1), pz = cz + Hash(cx, cy + 7919 * cz, seed + 2);
        const d = Math.hypot(px - x, py - y, pz - z);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
}

/**
 * Signed distance from 2D point `p` to triangle a-b-c: negative inside,
 * positive outside, in the same units (the pumpkin's carved face).
 * @param {number[]} p @param {number[]} a @param {number[]} b @param {number[]} c
 */
function TriangleDistance(p, a, b, c) {
    const edges = [[a, b], [b, c], [c, a]];
    let d = Infinity, inside = true;
    const orientation = Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    for (const [s, e] of edges) {
        const ex = e[0] - s[0], ey = e[1] - s[1], px = p[0] - s[0], py = p[1] - s[1];
        const t = clamp01((px * ex + py * ey) / (ex * ex + ey * ey));
        d = Math.min(d, Math.hypot(px - ex * t, py - ey * t));
        if (Math.sign(ex * py - ey * px) !== orientation) inside = false;
    }
    return inside ? -d : d;
}

/**
 * The offset of `p` from `point` (both on the melon, from its center) along
 * the melon (`along`, towards its top end) and around it (`around`), in
 * units — for shapes that point along the melon (strawberry seeds,
 * pineapple bracts).
 * @param {number[]} p @param {number[]} point
 */
function SurfaceOffset(p, point) {
    const axisDir = [0, 1, 2].map(k => (k === mesh.axis ? 1 : 0));
    const n = normalize(p.map((v, k) => v / mesh.halfExtents[k] ** 2)); // the egg's normal, near enough
    const along = orthoTo(axisDir, n), around = cross(n, along);
    const delta = sub(p, point);
    return { along: dot(delta, along), around: dot(delta, around) };
}

/**
 * `count` spots spread evenly over the melon (golf dimples, strawberry
 * seeds): a Fibonacci sphere, stretched onto the melon's egg shape.
 * `spacing` is the distance between neighbors in radians on the unit
 * sphere; `Nearest(position)` the spot nearest a place on the melon — its
 * angle away (radians, same sphere), its point on the melon and its index —
 * and `secondAngle`, how far the next-nearest is (cell borders: pineapple).
 * @param {number} count
 */
function FibonacciSpots(count) {
    const spacing = Math.sqrt(4 * Math.PI / count);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const centers = Array.from({ length: count }, (_, i) => {
        const z = 1 - (2 * i + 1) / count, r = Math.sqrt(1 - z * z);
        return [r * Math.cos(golden * i), r * Math.sin(golden * i), z];
    });
    // Sorted by z, so only centers near a place's z can be nearest.
    const reach = Math.ceil(2 * spacing * count / 2) + 1;
    return {
        spacing,
        /** @param {number[]} position from the melon's center */
        Nearest(position) {
            // The place's direction on the unit sphere: the egg squashed round.
            const dir = normalize(position.map((v, k) => v / mesh.halfExtents[k]));
            const middle = Math.round((1 - dir[2]) * count / 2 - 0.5);
            let best = -2, second = -2, index = -1;
            for (let i = Math.max(0, middle - reach); i <= Math.min(count - 1, middle + reach); i++) {
                const d = dot(dir, centers[i]);
                if (d > best) { second = best; best = d; index = i; } else if (d > second) second = d;
            }
            return {
                angle: Math.acos(Math.min(1, best)), secondAngle: Math.acos(Math.min(1, second)),
                point: centers[index].map((v, k) => v * mesh.halfExtents[k]), index,
            };
        },
    };
}

const SKINS = {
    // Plain polished gold: one color, no rind stripes and no rind bumps (flat
    // normal) — a gold melon, not a gilded watermelon. A pure metal shows
    // nothing but its reflections, which are mostly dark (floor, walls), so it
    // glows faintly in its own gold (GLOW) to stay golden anywhere.
    gold: () => {
        const GOLD = [255, 196, 86]; // real gold's albedo, about (1.0, 0.77, 0.34)
        const ROUGHNESS = 0.25;
        const GLOW = 0.15;
        WriteAddonFile(`${MAT_DIR}/melon_gold_color.png`, SolidPng(GOLD));
        WriteAddonFile(`${MAT_DIR}/melon_gold_rough.png`, SolidPng([0, 0, 0].map(() => byte(ROUGHNESS))));
        return VmatText({ texture: `${MAT_DIR}/melon_gold_color.png`, roughness: `${MAT_DIR}/melon_gold_rough.png`,
            metalness: 1, glow: GLOW, tint: 0, generator: GENERATOR });
    },
    // American football: pebbled brown leather in four panels (dark seams
    // between them), a white band near each end, and white laces — a seam
    // with cross stitches — along the middle of one side. Painted by place on
    // the melon (WriteSurfacePng), in model units, so it keeps its shape
    // across the texture's discs. Its own normal map: raised laces, sunken
    // seams, pebbled leather.
    football: () => {
        const LEATHER = hex("#7A3D1B"), LEATHER_DARK = hex("#4E2410"), SEAM = hex("#2E150A"), WHITE = hex("#F3EFE6");
        const SEAM_WIDTH = 0.12;                 // half-width of a panel seam, units
        const BAND = [0.56, 0.66];               // the white bands, as |along|
        const LACE_LENGTH = 0.46;                // the laces span |along| up to this
        const LACE_SEAM_WIDTH = 0.22;            // half-width of the seam under the stitches, units
        const STITCHES = 7, STITCH_HALF_WIDTH = 1.6, STITCH_HALF_THICK = 0.14; // units
        /** What's at a texel: "lace", "band", "seam" or "leather". */
        const Part = on => {
            const across = on.radius * on.angle; // arc distance from the laces' line
            const along = on.along * on.halfLength;
            if (Math.abs(on.along) < LACE_LENGTH) {
                if (Math.abs(across) < LACE_SEAM_WIDTH) return "lace";
                const step = (2 * LACE_LENGTH * on.halfLength) / STITCHES;
                const k = Math.round((along + LACE_LENGTH * on.halfLength - step / 2) / step);
                const stitchAt = -LACE_LENGTH * on.halfLength + step / 2 + Math.min(STITCHES - 1, Math.max(0, k)) * step;
                if (Math.abs(along - stitchAt) < STITCH_HALF_THICK && Math.abs(across) < STITCH_HALF_WIDTH) return "lace";
            }
            if (Math.abs(on.along) > BAND[0] && Math.abs(on.along) < BAND[1]) return "band";
            // Panel seams every quarter turn, starting under the laces.
            const quarter = Math.PI / 2;
            const off = on.angle - Math.round(on.angle / quarter) * quarter;
            if (Math.abs(on.radius * off) < SEAM_WIDTH) return "seam";
            return "leather";
        };
        const PEBBLES = 8; // pebble grains per unit
        WriteSurfacePng(`${MAT_DIR}/melon_football_color.png`, SIZE, SUPERSAMPLE, on => {
            if (!on) return LEATHER;
            const part = Part(on);
            if (part === "lace" || part === "band") return WHITE;
            if (part === "seam") return SEAM;
            // Pebbles: fine noise; the ends a little darker, worn by hands.
            const pebble = ValueNoise3(scale(on.position, PEBBLES), 3);
            return LEATHER.map((c, i) => lerp(c, LEATHER_DARK[i], 0.35 * pebble + 0.4 * Math.abs(on.along) ** 3));
        });
        WriteSurfacePng(`${MAT_DIR}/melon_football_rough.png`, SIZE, SUPERSAMPLE, on => {
            const r = !on ? 0.6 : { lace: 0.75, band: 0.55, seam: 0.8, leather: 0.6 }[Part(on)];
            return [r, r, r];
        });
        // Relief, units: the laces stand proud, the seams sink in, the bands
        // are paint; the leather is pebbled — small round grains.
        const HEIGHT = { lace: 0.07, band: 0.004, seam: -0.05, leather: 0 };
        const PEBBLE_HEIGHT = 0.018, PEBBLE_GRAINS = 11; // per unit
        WriteSurfacePng(`${MAT_DIR}/melon_football_normal.png`, SIZE, 2, (on, u, v) => BumpNormal(on, u, v, p => {
            const part = Part(Place(p));
            const pebble = part === "leather" ? PEBBLE_HEIGHT * (1 - smoothstep(0, 0.35, CellEdge(scale(p, PEBBLE_GRAINS), 13) ** 0.5)) : 0;
            return HEIGHT[part] + pebble;
        }), { frames: true });
        return VmatText({ texture: `${MAT_DIR}/melon_football_color.png`, roughness: `${MAT_DIR}/melon_football_rough.png`,
            normal: `${MAT_DIR}/melon_football_normal.png`, tint: 0, generator: GENERATOR });
    },
    // Golf ball: glossy white with dimples — not in the color, only in the
    // normal map, so they show in the light and the reflections as on a real
    // ball. DIMPLES (336, like a real one) spread evenly over the melon
    // (a Fibonacci sphere, stretched onto its egg shape), each a shallow
    // bowl whose normal tilts towards its middle, up to atan(2·DIMPLE_DEPTH).
    golf: () => {
        const WHITE = hex("#F4F4F1");
        const ROUGHNESS = 0.2;
        const DIMPLES = 336;
        const DIMPLE_RADIUS = 0.5;  // of the spacing between dimple centers
        const DIMPLE_DEPTH = 0.22;  // bowl depth per dimple radius
        const spots = FibonacciSpots(DIMPLES);
        const radius = DIMPLE_RADIUS * spots.spacing;
        WriteSurfacePng(`${MAT_DIR}/melon_golf_normal.png`, SIZE, 2, on => {
            if (!on) return [0.5, 0.5, 1];
            const nearest = spots.Nearest(on.position);
            const r = nearest.angle / radius; // 0 in the dimple's middle, 1 at its rim
            let normal = on.normal;
            if (r < 1) {
                // Tilt towards the middle: away from the direction pointing out of it.
                const outward = orthoTo(sub(on.position, nearest.point), on.normal);
                normal = normalize(sub(on.normal, scale(outward, 2 * DIMPLE_DEPTH * r)));
            }
            return [dot(normal, on.right), dot(normal, on.up), dot(normal, on.normal)].map(c => c * 0.5 + 0.5);
        }, { frames: true });
        WriteAddonFile(`${MAT_DIR}/melon_golf_color.png`, SolidPng(WHITE.map(byte)));
        WriteAddonFile(`${MAT_DIR}/melon_golf_rough.png`, SolidPng([0, 0, 0].map(() => byte(ROUGHNESS))));
        return VmatText({ texture: `${MAT_DIR}/melon_golf_color.png`, roughness: `${MAT_DIR}/melon_golf_rough.png`,
            normal: `${MAT_DIR}/melon_golf_normal.png`, tint: 0, generator: GENERATOR });
    },
    // Strawberry: glossy red, SEEDS yellow seeds spread evenly (like the golf
    // dimples), each a little oval pointing along the melon, sitting in a
    // small pit (normal map); at the stem end (along < 0) a green calyx of
    // SEPALS pointed leaves around a short stem, and no seeds under it.
    strawberry: () => {
        const RED = hex("#D3122B"), DEEP = hex("#A00B1F"), SEED = hex("#F2C44C"), SEED_TIP = hex("#C98A22");
        const LEAF = hex("#3F8F2C"), LEAF_DARK = hex("#2A6A1D"), STEM = hex("#5E7A2A");
        const SEEDS = 320;
        const SEED_LENGTH = 0.24, SEED_WIDTH = 0.12; // half-axes of a seed, units (length along the melon)
        const PIT_RADIUS = 0.4, PIT_DEPTH = 0.08, SEED_HEIGHT = 0.1; // units
        const SEPALS = 8, CALYX_RADIUS = 2.4, STEM_RADIUS = 0.35; // units, from the axis at the stem end
        const LEAF_HEIGHT = 0.05;
        const spots = FibonacciSpots(SEEDS);
        /** The calyx at a place: "stem", "leaf" (with `vein`), or null. */
        const Calyx = place => {
            if (place.along >= 0 || place.radius > CALYX_RADIUS) return null;
            if (place.radius < STEM_RADIUS) return { part: "stem" };
            const frac = place.angle * SEPALS / (2 * Math.PI) - Math.round(place.angle * SEPALS / (2 * Math.PI)); // −0.5..0.5, 0 = a leaf's middle
            const reach = STEM_RADIUS + (CALYX_RADIUS - STEM_RADIUS) * (1 - 2 * Math.abs(frac)) ** 0.8;
            return place.radius < reach ? { part: "leaf", vein: Math.abs(frac) < 0.025 } : null;
        };
        /**
         * The nearest seed at a place: `pit` and `seed` < 1 inside its pit /
         * the seed itself, `a` the offset along the melon; `hidden` for a
         * seed under or right next to the calyx (none there).
         */
        const Seed = p => {
            const nearest = spots.Nearest(p);
            const at = Place(nearest.point);
            const hidden = at.along < 0 && at.radius < CALYX_RADIUS + 0.4;
            const { along: a, around: b } = SurfaceOffset(p, nearest.point);
            return { pit: Math.hypot(a, b) / PIT_RADIUS, seed: (a / SEED_LENGTH) ** 2 + (b / SEED_WIDTH) ** 2, a, hidden };
        };
        WriteSurfacePng(`${MAT_DIR}/melon_strawberry_color.png`, SIZE, 2, on => {
            if (!on) return RED;
            const calyx = Calyx(on);
            if (calyx?.part === "stem") return STEM;
            if (calyx) return calyx.vein ? LEAF_DARK : mix(LEAF, LEAF_DARK, Fractal3(scale(on.position, 1.5), 81) * 0.5);
            let color = mix(RED, DEEP, clamp01((Fractal3(scale(on.position, 0.3), 83) - 0.35) / 0.35) * 0.6);
            const s = Seed(on.position);
            if (s.hidden) return color;
            if (s.pit < 1) color = mix(color, DEEP, (1 - s.pit) * 0.4);
            if (s.seed < 1) color = mix(SEED, SEED_TIP, clamp01(0.5 + s.a / SEED_LENGTH * 0.5) * 0.6);
            return color;
        });
        WriteSurfacePng(`${MAT_DIR}/melon_strawberry_normal.png`, SIZE, 1, (on, u, v) => BumpNormal(on, u, v, p => {
            const place = Place(p);
            const calyx = Calyx(place);
            if (calyx) return calyx.part === "leaf" ? LEAF_HEIGHT : LEAF_HEIGHT * 2;
            const s = Seed(p);
            if (s.hidden) return 0;
            const pit = s.pit < 1 ? -PIT_DEPTH * (1 - s.pit ** 2) : 0;
            const seed = s.seed < 1 ? SEED_HEIGHT * Math.sqrt(1 - s.seed) : 0;
            return pit + seed;
        }), { frames: true });
        WriteSurfacePng(`${MAT_DIR}/melon_strawberry_rough.png`, SIZE, 1, on => {
            if (!on) return [0.22, 0.22, 0.22];
            // The berry glossy and wet-looking, the seeds and leaves dry.
            const seed = Seed(on.position);
            const r = Calyx(on) ? 0.6 : !seed.hidden && seed.seed < 1 ? 0.5 : 0.22;
            return [r, r, r];
        });
        return VmatText({ texture: `${MAT_DIR}/melon_strawberry_color.png`, roughness: `${MAT_DIR}/melon_strawberry_rough.png`,
            normal: `${MAT_DIR}/melon_strawberry_normal.png`, tint: 0, generator: GENERATOR });
    },
    // Jack-o'-lantern: an orange pumpkin with RIBS grooves running along the
    // melon (normal map, a little darker in the grooves), a short stem on top
    // (along > 0) and a carved face on the laces' side: triangle eyes and
    // nose, a toothed grin. The cut can't be a hole in the mesh, so it's
    // painted as one: a pale flesh wall around each opening (sloping inwards
    // in the normal map), and inside a warm candle glow (self-illuminated
    // through a mask, so only the face glows).
    pumpkin: () => {
        const ORANGE = hex("#F0780F"), DEEP = hex("#C9540A"), CREST = hex("#FF9B2F");
        const FLESH = hex("#F8D584"), FLESH_DARK = hex("#D99A3A"), GLOW = hex("#FFC23D");
        const STEM = hex("#6A5A2C"), STEM_DARK = hex("#463B1C"), SCAR = hex("#7A5A26");
        const RIBS = 10, RIB_DEPTH = 0.12;  // grooves around the melon, how deep (units)
        const WALL = 0.32;                  // the cut's pale wall, units wide
        const CUT_DEPTH = 0.25;             // how far the openings sink in (normal map), units
        const GLOW_BRIGHTNESS = 3;
        const FACE_SCALE = 1.9;             // the face's size (Face is drawn for about a 7 × 5 unit face, times this)
        const STEM_RADIUS = 0.7, SCAR_RADIUS = 0.3; // units from the axis at the top / bottom end
        /** The face's outline as a signed distance (units, < 0 inside an opening), x across, y up the melon. */
        const Face = (x, y) => {
            const eye = cx => TriangleDistance([x, y], [cx - 1.0, 1.0], [cx + 1.0, 1.0], [cx + 0.15 * Math.sign(cx), 2.4]);
            const nose = TriangleDistance([x, y], [-0.5, -0.1], [0.5, -0.1], [0, 0.75]);
            // The grin: a smile-curved band, tapering at the corners, with teeth from above and below.
            const W = 3.0;
            const middle = -1.75 + 0.13 * x * x;
            const half = 0.75 * Math.sqrt(clamp01(1 - (x / W) ** 2));
            const tooth = phase => 0.42 * Math.max(0, 1 - Math.abs(((x / 1.0 + phase) % 1 + 1) % 1 * 2 - 1) * 2.2);
            const top = middle + half - tooth(0), bottom = middle - half + tooth(0.5);
            const mouth = Math.max(y - top, bottom - y, Math.abs(x) - W);
            return Math.min(eye(-1.7), eye(1.7), nose, mouth);
        };
        /** What's at a place: "stem", "scar", "glow", "wall" (with `depth` 0 rim … 1 inner edge) or "skin". */
        const Part = place => {
            if (place.along > 0 && place.radius < STEM_RADIUS) return { part: "stem" };
            if (place.along < 0 && place.radius < SCAR_RADIUS) return { part: "scar" };
            if (Math.abs(place.angle) < Math.PI / 2) {
                const d = Face(place.radius * place.angle / FACE_SCALE, place.along * place.halfLength / FACE_SCALE) * FACE_SCALE;
                if (d < -WALL) return { part: "glow" };
                if (d < 0) return { part: "wall", depth: -d / WALL };
            }
            return { part: "skin" };
        };
        /** 0 in a groove … 1 on a rib's crest, fading out towards the ends where the ribs meet. */
        const Rib = place => Math.abs(Math.sin(place.angle * RIBS / 2)) ** 0.6;
        WriteSurfacePng(`${MAT_DIR}/melon_pumpkin_color.png`, SIZE, 2, on => {
            if (!on) return ORANGE;
            const at = Part(on);
            if (at.part === "stem") return mix(STEM, STEM_DARK, Rib({ angle: on.angle * 0.8 }) * 0.6);
            if (at.part === "scar") return SCAR;
            if (at.part === "glow") return GLOW;
            if (at.part === "wall") return mix(FLESH, FLESH_DARK, at.depth);
            let color = mix(DEEP, ORANGE, lerp(0.35, 1, Rib(on)));
            color = mix(color, CREST, Rib(on) ** 4 * 0.5);
            return mix(color, DEEP, clamp01((Fractal3(scale(on.position, 0.35), 91) - 0.45) / 0.3) * 0.35);
        });
        WriteSurfacePng(`${MAT_DIR}/melon_pumpkin_glow.png`, SIZE, 2, on => {
            const g = on && Part(on).part === "glow" ? 1 : 0;
            return [g, g, g];
        });
        WriteSurfacePng(`${MAT_DIR}/melon_pumpkin_normal.png`, SIZE, 1, (on, u, v) => BumpNormal(on, u, v, p => {
            const place = Place(p);
            const at = Part(place);
            if (at.part === "stem") return 0.15;
            if (at.part === "glow") return -CUT_DEPTH;
            if (at.part === "wall") return -CUT_DEPTH * at.depth;
            // Ribs: grooves fade out near the ends, where the melon narrows.
            return RIB_DEPTH * Rib(place) * clamp01(place.radius / 3);
        }), { frames: true });
        WriteSurfacePng(`${MAT_DIR}/melon_pumpkin_rough.png`, SIZE, 1, on => {
            const r = !on ? 0.4 : { stem: 0.8, scar: 0.8, glow: 0.9, wall: 0.75, skin: 0.4 }[Part(on).part];
            return [r, r, r];
        });
        return VmatText({ texture: `${MAT_DIR}/melon_pumpkin_color.png`, roughness: `${MAT_DIR}/melon_pumpkin_rough.png`,
            normal: `${MAT_DIR}/melon_pumpkin_normal.png`, glow: GLOW_BRIGHTNESS, glowMask: `${MAT_DIR}/melon_pumpkin_glow.png`,
            tint: 0, generator: GENERATOR });
    },
    // Pineapple: FRUITLETS spread on the Fibonacci spiral a real pineapple
    // grows in (FibonacciSpots — even everywhere, the ends too). Each is a
    // golden dome, lighter at its top, with a small dark dimple near the top,
    // and over its lower half a fibrous tan bract, wide at the bottom and
    // pointed up into the dome; dark crevices between the domes. Greener in
    // places. At the top end (along > 0) the base of the crown — pointed
    // green leaves —, at the bottom a dark base. Domes, bracts and crevices
    // in the normal map.
    pineapple: () => {
        const DOME = hex("#E39A36"), DOME_TOP = hex("#F7C35C"), DOME_LOW = hex("#C27420"), GREENISH = hex("#A08E3A");
        const CREVICE = hex("#3B2410"), DIMPLE = hex("#6B3C17");
        const BRACT = hex("#C9A46A"), FIBER = hex("#7E5A33"), FRINGE = hex("#5A3D1E");
        const LEAF = hex("#4F8A33"), LEAF_LIGHT = hex("#86B85A"), BASE = hex("#4A3018");
        const FRUITLETS = 150;
        const CREVICE_WIDTH = 0.16;           // units, half on each side of a border
        const BRACT_TIP = 0.2, BRACT_SPREAD = 0.85; // the bract's tip (above the middle) and how fast it widens, in cell radii
        const FIBERS = 26;                    // fibers fanning out from the bract's tip
        const DOME_HEIGHT = 0.2, BRACT_HEIGHT = 0.07, CREVICE_DEPTH = 0.08; // units
        const CROWN_LEAVES = 12, CROWN_RADIUS = 2.6, BASE_RADIUS = 0.9; // units from the axis at the ends
        const spots = FibonacciSpots(FRUITLETS);
        const meanRadius = (mesh.halfExtents[0] + mesh.halfExtents[1] + mesh.halfExtents[2]) / 3;
        const cell = spots.spacing * meanRadius / 2; // about one fruitlet's radius, units
        /**
         * The fruitlet at a place: `edge` how far inside its border (units,
         * 0 on it), `x`/`y` the offset from its middle in cell radii (around
         * the melon / along it, up = towards the crown), and its `bract`:
         * null outside it, else `side` 0 on its middle line … 1 at its edge
         * and `fiber` 0..1 across its fibers.
         */
        const Fruitlet = p => {
            const nearest = spots.Nearest(p);
            const offset = SurfaceOffset(p, nearest.point);
            const x = offset.around / cell, y = offset.along / cell;
            const halfWidth = (BRACT_TIP - y) * BRACT_SPREAD;
            const bract = halfWidth > 0 && Math.abs(x) < halfWidth
                ? { side: Math.abs(x) / halfWidth, fiber: 0.5 + 0.5 * Math.cos(Math.atan2(x, BRACT_TIP - y) * FIBERS) }
                : null;
            return { edge: (nearest.secondAngle - nearest.angle) / 2 * meanRadius, x, y, bract };
        };
        /** The ends: "crown" (with `light`) at the top, "base" at the bottom, or null. */
        const End = place => {
            if (place.along < 0) return place.radius < BASE_RADIUS ? { part: "base" } : null;
            if (place.radius > CROWN_RADIUS) return null;
            const frac = place.angle * CROWN_LEAVES / (2 * Math.PI) - Math.round(place.angle * CROWN_LEAVES / (2 * Math.PI));
            const reach = 0.5 + (CROWN_RADIUS - 0.5) * (1 - 2 * Math.abs(frac)) ** 1.4;
            return place.radius < reach ? { part: "crown", light: 1 - 2 * Math.abs(frac) } : null;
        };
        WriteSurfacePng(`${MAT_DIR}/melon_pineapple_color.png`, SIZE, 2, on => {
            if (!on) return DOME;
            const end = End(on);
            if (end?.part === "base") return BASE;
            if (end) return mix(LEAF, LEAF_LIGHT, end.light * 0.6);
            const f = Fruitlet(on.position);
            if (f.bract) {
                // Tan with darker fibers, a dark fringe along its edges.
                const color = mix(BRACT, FIBER, f.bract.fiber * 0.55);
                return mix(color, FRINGE, smoothstep(0.75, 1, f.bract.side) * 0.8);
            }
            if (f.edge < CREVICE_WIDTH / 2) return CREVICE;
            // The dome: lighter towards its top, deeper below, shaded at its rim.
            let color = f.y > 0 ? mix(DOME, DOME_TOP, clamp01(f.y / 0.8)) : mix(DOME, DOME_LOW, clamp01(-f.y / 0.6));
            color = mix(color, GREENISH, clamp01((Fractal3(scale(on.position, 0.3), 97) - 0.5) / 0.25) * 0.45);
            if (Math.hypot(f.x, (f.y - 0.5) * 1.4) < 0.14) color = DIMPLE;
            return mix(color, CREVICE, clamp01(1 - f.edge / 0.45) * 0.5);
        });
        WriteSurfacePng(`${MAT_DIR}/melon_pineapple_normal.png`, SIZE, 1, (on, u, v) => BumpNormal(on, u, v, p => {
            const end = End(Place(p));
            if (end) return end.part === "crown" ? 0.12 : -0.05;
            const f = Fruitlet(p);
            // The bract: a ridge along its middle line, on top of the dome's lower part.
            if (f.bract) return DOME_HEIGHT * 0.5 + BRACT_HEIGHT * (1 - f.bract.side) + 0.01 * f.bract.fiber;
            if (f.edge < CREVICE_WIDTH / 2) return -CREVICE_DEPTH;
            const r = Math.hypot(f.x, f.y - 0.2);
            const dimple = Math.hypot(f.x, (f.y - 0.5) * 1.4) < 0.14 ? -0.04 : 0;
            return DOME_HEIGHT * Math.sqrt(clamp01(1 - r * r * 0.8)) + dimple;
        }), { frames: true });
        WriteSurfacePng(`${MAT_DIR}/melon_pineapple_rough.png`, SIZE, 1, on => {
            if (!on) return [0.5, 0.5, 0.5];
            const f = Fruitlet(on.position);
            const r = End(on) ? 0.55 : f.bract ? 0.8 : f.edge < CREVICE_WIDTH / 2 ? 0.85 : 0.45;
            return [r, r, r];
        });
        return VmatText({ texture: `${MAT_DIR}/melon_pineapple_color.png`, roughness: `${MAT_DIR}/melon_pineapple_rough.png`,
            normal: `${MAT_DIR}/melon_pineapple_normal.png`, tint: 0, generator: GENERATOR });
    },
    // Zebra: black stripes on cream fur, running round the melon (one every
    // STRIPE_PERIOD units along it), bent into waves by 3D noise (WARP:
    // broad swings, WOBBLE: smaller kinks) so neighbors merge and fork, and
    // of uneven width. The fur: stripe edges frayed by fine streaky noise
    // (hairs lie along the melon), the same hairs as a faint grain in the
    // normal map; matt all over.
    zebra: () => {
        const CREAM = hex("#EEE7DA"), BLACK = hex("#1B1815");
        const STRIPE_PERIOD = 1.7;            // units along the melon
        const WARP = 3.2, WOBBLE = 0.45;      // how far the stripes swing / kink, units
        const FRAY = 0.06;                    // how far hairs reach past a stripe's edge, units
        const HAIR_HEIGHT = 0.012;            // the fur's grain in the normal map, units
        /** Hair noise: streaks along the melon — slow along the axis, fast around it. @param {number[]} p @param {number} seed */
        const Hair = (p, seed) => ValueNoise3(p.map((v, k) => v * (k === mesh.axis ? 2.5 : 16)), seed);
        // How far a place is from the melon's middle ring, over its surface
        // (units, about): its latitude on the egg squashed round, times the
        // mean radius — unlike the plain axis coordinate it keeps growing
        // evenly up to the ends, so stripes don't swell into blots there.
        const meanRadius = (mesh.halfExtents[0] + mesh.halfExtents[1] + mesh.halfExtents[2]) / 3;
        const Latitude = p => {
            const dir = normalize(p.map((v, k) => v / mesh.halfExtents[k]));
            return Math.asin(Math.max(-1, Math.min(1, dir[mesh.axis]))) * meanRadius;
        };
        /** How black the fur is at a place: 0 cream … 1 a stripe. @param {number[]} p */
        const Stripe = p => {
            const bend = (Fractal3(scale(p, 0.16), 101) - 0.5) * 2 * WARP + (Fractal3(scale(p, 0.55), 103) - 0.5) * 2 * WOBBLE;
            const s = (Latitude(p) + bend + (Hair(p, 107) - 0.5) * 2 * FRAY) / STRIPE_PERIOD;
            // Uneven widths: the black part of each period between about 35 % and 60 %.
            const threshold = lerp(-0.45, 0.2, Fractal3(scale(p, 0.3), 109));
            return smoothstep(threshold - 0.12, threshold + 0.12, Math.sin(2 * Math.PI * s));
        };
        WriteSurfacePng(`${MAT_DIR}/melon_zebra_color.png`, SIZE, 2, on => {
            if (!on) return CREAM;
            // A little hair-by-hair shading in both colors.
            const shade = lerp(0.9, 1.05, Hair(on.position, 113));
            return mix(CREAM, BLACK, Stripe(on.position)).map(c => c * shade);
        });
        WriteSurfacePng(`${MAT_DIR}/melon_zebra_normal.png`, SIZE, 1, (on, u, v) =>
            BumpNormal(on, u, v, p => HAIR_HEIGHT * Hair(p, 113)), { frames: true });
        WriteAddonFile(`${MAT_DIR}/melon_zebra_rough.png`, SolidPng([0, 0, 0].map(() => byte(0.85))));
        return VmatText({ texture: `${MAT_DIR}/melon_zebra_color.png`, roughness: `${MAT_DIR}/melon_zebra_rough.png`,
            normal: `${MAT_DIR}/melon_zebra_normal.png`, tint: 0, generator: GENERATOR });
    },
    // Yellow honey melon: golden yellow rind under a cream-white net of
    // cracks — cells stretched along the melon, wobbly, with a finer, fainter
    // net between — raised a little (normal map, so it catches the light);
    // a pale ring with a brown core at the blossom end, a small brown stem
    // scar at the other. Painted by place (3D noise, no seams at the discs'
    // rims).
    honey: () => {
        const YELLOW = hex("#F5BE1E"), DEEP = hex("#E89A0E"), NET = hex("#F7EBC4"), RING = hex("#EDE2BE"), CORE = hex("#8C6A3C");
        const NET_ALONG = 0.38, NET_ACROSS = 1.0; // net cells per unit, along the melon and around it
        const NET_WOBBLE = 0.7;                  // how far the cracks wander, in cells
        const NET_WIDTH = [0.03, 0.075];         // crack width (in cells), thin to thick by place
        const FINE_NET = 2.4, FINE_NET_STRENGTH = 0.35;
        const NET_HEIGHT = 0.025;                // how far the net stands out, units — the normal map
        const BLOSSOM = { core: 0.4, ring: 1.2 }; // radii around the tip, units
        const STEM = 0.3;
        /** The net's strength at a place on the melon: 0 rind, 1 crack. @param {number[]} p */
        const Net = p => {
            const warp = [41, 42, 43].map(seed => (Fractal3(scale(p, 0.35), seed) - 0.5) * 2 * NET_WOBBLE);
            const q = p.map((v, k) => v * (k === mesh.axis ? NET_ALONG : NET_ACROSS) + warp[k]);
            const width = lerp(NET_WIDTH[0], NET_WIDTH[1], Fractal3(scale(p, 0.5), 47));
            const main = 1 - smoothstep(width * 0.5, width, CellEdge(q, 51));
            const fine = (1 - smoothstep(0.03, 0.06, CellEdge(scale(q, FINE_NET), 61))) * FINE_NET_STRENGTH;
            return Math.max(main, fine * Fractal3(scale(p, 0.6), 53));
        };
        /** What the tips add: 0 none, else how much of `color` covers it there. */
        const Tip = on => {
            if (on.along > 0) {
                const core = 1 - smoothstep(BLOSSOM.core * 0.7, BLOSSOM.core, on.radius);
                const ring = 1 - smoothstep(BLOSSOM.ring * 0.75, BLOSSOM.ring, on.radius);
                return core > 0 ? { color: CORE, amount: core } : { color: RING, amount: ring * 0.9 };
            }
            return { color: CORE, amount: (1 - smoothstep(STEM * 0.6, STEM, on.radius)) * 0.8 };
        };
        WriteSurfacePng(`${MAT_DIR}/melon_honey_color.png`, SIZE, 2, on => {
            if (!on) return YELLOW;
            const p = on.position;
            let color = mix(YELLOW, DEEP, clamp01((Fractal3(scale(p, 0.25), 11) - 0.4) / 0.3) * 0.7);
            color = mix(color, NET, Net(p));
            const tip = Tip(on);
            return mix(color, tip.color, tip.amount);
        });
        WriteSurfacePng(`${MAT_DIR}/melon_honey_normal.png`, SIZE, 1, (on, u, v) =>
            BumpNormal(on, u, v, p => Net(p) * NET_HEIGHT), { frames: true });
        WriteSurfacePng(`${MAT_DIR}/melon_honey_rough.png`, SIZE, 1, on => {
            // The rind waxy, the net dry and matt.
            const r = on ? lerp(0.45, 0.8, Net(on.position)) : 0.45;
            return [r, r, r];
        });
        return VmatText({ texture: `${MAT_DIR}/melon_honey_color.png`, roughness: `${MAT_DIR}/melon_honey_rough.png`,
            normal: `${MAT_DIR}/melon_honey_normal.png`, tint: 0, generator: GENERATOR });
    },
    // Woodland camouflage: four colors in noise blobs, the rind's own light
    // and shade kept on top so it still reads as a melon. The blobs are 3D
    // noise by place on the melon (WriteSurfacePng), so they run on across
    // the texture discs' rims without a seam.
    camo: () => {
        const COLORS = [hex("#2B331C"), hex("#4F5E2C"), hex("#6E5A38"), hex("#A39A6B")];
        const CUTS = [0.38, 0.5, 0.62]; // noise thresholds between the four
        const BLOB_SCALE = 0.3;         // per unit: a few blobs across the melon
        WriteSurfacePng(`${MAT_DIR}/melon_camo_color.png`, SIZE, 2, (on, u, v) => {
            const n = on ? Fractal3(scale(on.position, BLOB_SCALE), 7) : 0;
            const i = CUTS.filter(c => n > c).length;
            return COLORS[i].map(c => c * lerp(0.8, 1.15, RindLight(u, v)));
        });
        WriteAddonFile(`${MAT_DIR}/melon_camo_rough.png`, SolidPng([0, 0, 0].map(() => byte(0.75))));
        return VmatText({ texture: `${MAT_DIR}/melon_camo_color.png`, roughness: `${MAT_DIR}/melon_camo_rough.png`,
            normal: RIND_NORMAL, tint: 0, generator: GENERATOR });
    },
};

/**
 * The rind's relief, for the plain melon and camo: the light stripes stand a
 * little proud of the dark ones (their lightness from the melon's own
 * texture), with a fine, uneven grain all over (3D noise). Replaces the
 * decompiled 256² normal map, which barely showed.
 */
function WriteRindNormal() {
    const STRIPE_HEIGHT = 0.1; // light stripes above dark ones, units
    const GRAIN_HEIGHT = 0.03, GRAIN_SCALE = 5; // the grain, units, and its bumps per unit
    WriteSurfacePng(RIND_NORMAL, SIZE, 1, (on, u, v) => BumpNormal(on, u, v, (p, pu, pv) =>
        STRIPE_HEIGHT * RindLight(pu, pv) + GRAIN_HEIGHT * Fractal3(scale(p, GRAIN_SCALE), 71)), { frames: true });
}

// The user menu's skin buttons show a preview of each skin (and of the plain
// melon): a shaded ball, its surface taken from the middle of the upper
// disc, which already is one side of the melon seen head-on.
const PREVIEW_DIR = "panorama/images/custom_game/skins";
const PREVIEW_SIZE = 96;
const PREVIEW_LIGHT = (() => { const l = [-0.45, -0.6, 0.66], n = Math.hypot(...l); return l.map(v => v / n); })(); // from the upper left, towards the viewer
/**
 * @param {string} name @param {string} colorPath
 * @param {{ metal?: boolean, normalPath?: string, glowPath?: string }} [options] normalPath: a normal map whose
 *   bumps the preview shows too (golf dimples); glowPath: a self-illumination mask, lit there regardless of shading (pumpkin face)
 */
function WritePreview(name, colorPath, { metal = false, normalPath, glowPath } = {}) {
    const Load = path => DecodePng(readFileSync(new URL(`../${path}`, import.meta.url)));
    // Averages the texels one preview pixel covers (about 0.48 / PREVIEW_SIZE
    // of the texture), so fine detail (the honey melon's net) doesn't flicker.
    const Lookup = image => (u, v) => {
        const half = Math.max(0, Math.floor(0.24 / PREVIEW_SIZE * image.width));
        const cx = Math.floor(u * image.width), cy = Math.floor(v * image.height);
        const sum = [0, 0, 0];
        let n = 0;
        for (let y = cy - half; y <= cy + half; y++) for (let x = cx - half; x <= cx + half; x++) {
            const px = Math.min(image.width - 1, Math.max(0, x)), py = Math.min(image.height - 1, Math.max(0, y));
            for (let c = 0; c < 3; c++) sum[c] += image.data[(py * image.width + px) * image.channels + c] / 255;
            n++;
        }
        return sum.map(s => s / n);
    };
    const at = Lookup(Load(colorPath));
    const bumpAt = normalPath ? Lookup(Load(normalPath)) : undefined;
    const glowAt = glowPath ? Lookup(Load(glowPath)) : undefined;
    WriteAddonFile(`${PREVIEW_DIR}/skin_${name}.png`, EncodePng(PREVIEW_SIZE, PREVIEW_SIZE, (px, py) => {
        const dx = (px + 0.5) / PREVIEW_SIZE * 2 - 1, dy = (py + 0.5) / PREVIEW_SIZE * 2 - 1;
        const r = Math.hypot(dx, dy);
        if (r > 1) return [0, 0, 0, 0];
        let n = [dx, dy, Math.sqrt(1 - r * r)];
        if (bumpAt) {
            // The map's tilt (x right, y up in the texture) onto the preview
            // (x right, y down on screen).
            const [bx, by] = bumpAt(0.25 + dx * 0.24, 0.25 + dy * 0.24).map(c => c * 2 - 1);
            n = normalize([n[0] + bx, n[1] - by, n[2]]);
        }
        const diffuse = Math.max(0, n[0] * PREVIEW_LIGHT[0] + n[1] * PREVIEW_LIGHT[1] + n[2] * PREVIEW_LIGHT[2]);
        // Highlight: the light reflected towards the viewer (0, 0, 1).
        const reflect = 2 * diffuse * n[2] - PREVIEW_LIGHT[2];
        const spec = Math.max(0, reflect) ** (metal ? 12 : 30) * (metal ? 0.9 : 0.25);
        const base = at(0.25 + dx * 0.24, 0.25 + dy * 0.24);
        let shade = metal ? 0.35 + 0.75 * diffuse : 0.3 + 0.8 * diffuse;
        // Self-illuminated parts are fully lit, whatever the light.
        if (glowAt) shade = lerp(shade, 1.15, glowAt(0.25 + dx * 0.24, 0.25 + dy * 0.24)[0]);
        // Anti-aliased rim.
        const alpha = clamp01((1 - r) * PREVIEW_SIZE / 2);
        return [...base.map(c => byte(c * shade + spec)), byte(alpha)];
    }));
}

WriteRindNormal();
WritePreview("default", `${MAT_DIR}/melon_default_color.png`, { normalPath: RIND_NORMAL });
for (const [name, make] of Object.entries(SKINS)) {
    const vmat = make();
    WriteAddonFile(`${MAT_DIR}/melon_${name}.vmat`, vmat);
    const model = baseModel.replaceAll(`to = "${BASE_MATERIAL}"`, `to = "${MAT_DIR}/melon_${name}.vmat"`);
    if (model === baseModel) throw new Error(`melon.vmdl has no remap to ${BASE_MATERIAL}`);
    // No AUTO-GENERATED banner: the KV3 header has to be the file's first line.
    WriteAddonFile(`${MODEL_DIR}/melon_${name}.vmdl`, model);
    // The preview shows the material's own normal map and glow mask too (not
    // the flat default normal or the all-over glowwhite).
    const OwnTexture = key => { const path = vmat.match(new RegExp(`${key} "([^"]+)"`))?.[1]; return path?.startsWith(MAT_DIR) ? path : undefined; };
    WritePreview(name, `${MAT_DIR}/melon_${name}_color.png`, {
        metal: name === "gold",
        normalPath: OwnTexture("TextureNormal"),
        glowPath: OwnTexture("TextureSelfIllumMask"),
    });
}
