// Shared by the model generators that cut text out of a font
// (make-logo-model.mjs, make-podium-model.mjs): a line of text as flat 2D
// shapes ({ outer, holes }: outer counter-clockwise, holes clockwise, y up),
// ready for Mesh.Extrude. Bungee (tools/fonts/, OFL) is the logo's font.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { Area } from "./model.mjs";

export const BUNGEE = fileURLToPath(new URL("./fonts/Bungee-Regular.ttf", import.meta.url));

export const LoadFont = path => opentype.parse(readFileSync(path).buffer);

/** Drops the closing duplicate and points too close to the one before. */
export function Clean(contour) {
    const out = [];
    for (const p of contour) {
        const q = out[out.length - 1];
        if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) out.push(p);
    }
    while (out.length > 1 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) <= 1e-4) out.pop();
    return out;
}

/** Closed contours of one glyph at pen x, in units, y up, curves flattened. */
function GlyphContours(font, glyph, penX, scale, curveStep, minSegments) {
    const contours = [];
    let cur = null;
    let last = [0, 0];
    const P = (x, y) => [penX + x * scale, y * scale];
    const segments = (p0, p1) => Math.max(minSegments, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / curveStep));
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

/**
 * `text` as 2D shapes, a capital letter `capHeight` units high, the baseline
 * at y 0 and the first letter's pen position at x 0 (not centered). A curve
 * becomes one straight segment per `curveStep` units, at least `minSegments`
 * (1: a font's tiny rounded corners turn into a single bevel each).
 */
export function TextShapes(font, text, capHeight, { letterSpacing = 0, curveStep = 2, minSegments = 2 } = {}) {
    const capUnits = font.tables.os2.sCapHeight || font.unitsPerEm * 0.7;
    const scale = capHeight / capUnits;
    const shapes = [];
    let pen = 0;
    for (const glyph of font.stringToGlyphs(text)) {
        shapes.push(...Shapes(GlyphContours(font, glyph, pen, scale, curveStep, minSegments)));
        pen += glyph.advanceWidth * scale + letterSpacing;
    }
    return shapes;
}
