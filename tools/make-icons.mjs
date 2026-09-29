// Generates the user menu's icons (white on transparent, 64x64 PNGs) into
// panorama/images/custom_game/icons/ — `node tools/make-icons.mjs`. Each
// icon is a few signed-distance shapes (union = min, cut = max(a, -b)) on a
// 64x64 grid, y down, rasterized with 4x4 supersampling. No dependencies,
// so tweaking an icon is editing its shapes below and re-running this.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 64;
const SUPERSAMPLE = 4;
const OUT_DIR = new URL("../panorama/images/custom_game/icons/", import.meta.url);

// --- shapes: each returns (x, y) => signed distance (negative inside) ---

const len = (x, y) => Math.hypot(x, y);
const union = (...shapes) => (x, y) => Math.min(...shapes.map((s) => s(x, y)));
const cut = (shape, hole) => (x, y) => Math.max(shape(x, y), -hole(x, y));

/** Filled circle. */
const circle = (cx, cy, r) => (x, y) => len(x - cx, y - cy) - r;

/** Line from (ax, ay) to (bx, by) with round ends, half-width r. */
const line = (ax, ay, bx, by, r) => (x, y) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return len(x - ax - t * dx, y - ay - t * dy) - r;
};

/** Filled rectangle with rounded corners. */
const rect = (x0, y0, x1, y1, r = 0) => (x, y) => {
    const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
    const qx = Math.abs(x - (x0 + x1) / 2) - hx, qy = Math.abs(y - (y0 + y1) / 2) - hy;
    return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

/** Rounded-rectangle outline, stroke width w. */
const rectOutline = (x0, y0, x1, y1, r, w) => cut(rect(x0, y0, x1, y1, r), rect(x0 + w, y0 + w, x1 - w, y1 - w, Math.max(0, r - w)));

/** Filled ellipse (approximate distance, fine for rasterizing). */
const ellipse = (cx, cy, rx, ry) => (x, y) => (len((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);

/** Filled convex/concave polygon. */
const polygon = (...pts) => (x, y) => {
    let d = Infinity, inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[j], [bx, by] = pts[i];
        d = Math.min(d, line(ax, ay, bx, by, 0)(x, y));
        if ((by > y) !== (ay > y) && x < ((ax - bx) * (y - by)) / (ay - by) + bx) inside = !inside;
    }
    return inside ? -d : d;
};

/** Arc of radius r around (cx, cy) from angle a0 to a1 (degrees, clockwise on screen), stroke width w. */
const arc = (cx, cy, r, a0, a1, w) => {
    const rad = (a) => (a * Math.PI) / 180;
    const end = (a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
    const [sx, sy] = end(a0), [ex, ey] = end(a1);
    return (x, y) => {
        let a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
        while (a < a0) a += 360;
        if (a <= a1) return Math.abs(len(x - cx, y - cy) - r) - w / 2;
        return Math.min(len(x - sx, y - sy), len(x - ex, y - ey)) - w / 2;
    };
};

/** Arrowhead with its tip at (tx, ty), pointing along (dx, dy). */
const arrowHead = (tx, ty, dx, dy, length, halfWidth) => {
    const l = len(dx, dy), ux = dx / l, uy = dy / l;
    const bx = tx - ux * length, by = ty - uy * length;
    return polygon([tx, ty], [bx - uy * halfWidth, by + ux * halfWidth], [bx + uy * halfWidth, by - ux * halfWidth]);
};

/** The "?" glyph centered around x = 32, top at about y = top. */
const questionMark = (top, scale = 1) => {
    const s = (v) => v * scale;
    const cy = top + s(10);
    const r = s(9);
    const endX = 32 + r * Math.cos(Math.PI / 3), endY = cy + r * Math.sin(Math.PI / 3);
    return union(
        arc(32, cy, r, 180, 420, s(6)),
        line(endX, endY, 32, cy + s(13), s(3)),
        line(32, cy + s(13), 32, cy + s(16), s(3)),
        circle(32, cy + s(25), s(3.6)),
    );
};

// --- the icons ---

const respawnArcEnd = 240; // degrees; the arrowhead sits at this end of the arc
const respawnEnd = [32 + 18 * Math.cos((respawnArcEnd * Math.PI) / 180), 33 + 18 * Math.sin((respawnArcEnd * Math.PI) / 180)];
const respawnDir = [-Math.sin((respawnArcEnd * Math.PI) / 180), Math.cos((respawnArcEnd * Math.PI) / 180)];

const ICONS = {
    // Four-way "move" arrows — the NAVIGATION section.
    navigation: union(
        line(15, 32, 49, 32, 3),
        line(32, 15, 32, 49, 3),
        arrowHead(59, 32, 1, 0, 11, 9),
        arrowHead(5, 32, -1, 0, 11, 9),
        arrowHead(32, 5, 0, -1, 11, 9),
        arrowHead(32, 59, 0, 1, 11, 9),
    ),
    // Circular arrow — "Respawn at Checkpoint".
    respawn: union(
        arc(32, 33, 18, -60, respawnArcEnd, 6),
        arrowHead(respawnEnd[0] + respawnDir[0] * 9, respawnEnd[1] + respawnDir[1] * 9, respawnDir[0], respawnDir[1], 15, 11),
    ),
    // House — "Return to Hub".
    home: union(
        line(7, 32, 32, 9, 4),
        line(32, 9, 57, 32, 4),
        cut(rect(15, 29, 49, 56, 2), rect(27, 40, 37, 57)),
    ),
    // "?" — the tutorial button.
    tutorial: questionMark(8, 1.25),
    // "?" in a rounded box — the GO TO TUTORIAL section.
    "tutorial-box": union(rectOutline(6, 6, 58, 58, 8, 5), questionMark(14, 0.95)),
    // Paint palette — the COLOR section.
    palette: cut(
        cut(circle(32, 32, 26), circle(46, 45, 8)),
        union(circle(19, 26, 5), circle(31, 16, 5), circle(44, 21, 5), circle(18, 40, 5)),
    ),
    // Melon with a ring around it and short rays — GLOW.
    glow: union(
        ellipse(32, 32, 13, 11),
        cut(circle(32, 32, 20), circle(32, 32, 17)),
        ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
            return line(32 + c * 24, 32 + s * 24, 32 + c * 29, 32 + s * 29, 2.2);
        }),
    ),
    // Dotted line running into a wall and bouncing off it — GUIDE LINE.
    "guide-line": union(
        rect(50, 6, 58, 58, 1),
        ...[0, 1, 2, 3].map((i) => circle(8 + i * 10, 52 - i * 10, 3.5)),
        ...[1, 2, 3].map((i) => circle(46 - i * 10, 20 - i * 5, 3.5)),
    ),
    // Bug — JUMP DEBUG.
    debug: union(
        cut(ellipse(32, 40, 12, 15), line(32, 29, 32, 56, 1.3)),
        circle(32, 20, 7),
        line(21, 32, 10, 25, 2.4), line(20, 41, 8, 41, 2.4), line(21, 50, 10, 57, 2.4),
        line(43, 32, 54, 25, 2.4), line(44, 41, 56, 41, 2.4), line(43, 50, 54, 57, 2.4),
        line(28, 15, 22, 6, 2), line(36, 15, 42, 6, 2),
    ),
};

// --- rasterize + PNG ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}

/** White pixels, alpha = the share of subsamples inside the shape. */
function Rasterize(shape) {
    const rows = Buffer.alloc(SIZE * (SIZE * 4 + 1));
    for (let py = 0; py < SIZE; py++) {
        rows[py * (SIZE * 4 + 1)] = 0; // PNG filter: none
        for (let px = 0; px < SIZE; px++) {
            let inside = 0;
            for (let sy = 0; sy < SUPERSAMPLE; sy++) {
                for (let sx = 0; sx < SUPERSAMPLE; sx++) {
                    if (shape(px + (sx + 0.5) / SUPERSAMPLE, py + (sy + 0.5) / SUPERSAMPLE) < 0) inside++;
                }
            }
            const o = py * (SIZE * 4 + 1) + 1 + px * 4;
            rows[o] = rows[o + 1] = rows[o + 2] = 255;
            rows[o + 3] = Math.round((inside / (SUPERSAMPLE * SUPERSAMPLE)) * 255);
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(SIZE, 0);
    header.writeUInt32BE(SIZE, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(rows)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, shape] of Object.entries(ICONS)) {
    writeFileSync(new URL(`${name}.png`, OUT_DIR), Rasterize(shape));
    console.log(`wrote panorama/images/custom_game/icons/${name}.png`);
}
