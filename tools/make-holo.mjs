// Generates the tileable zigzag hologram texture used by
// materials/melon_racer/holo_zigzag.vmat — `node tools/make-holo.mjs`.
// The animation isn't in the texture: the material scrolls it
// (g_vTexCoordScrollSpeed / g_vSelfIllumScrollSpeed), so the pattern only has
// to tile seamlessly. No dependencies, like make-icons.mjs.
//
// - holo_zigzag_color.png: RGB, toxic green→ultraviolet holo gradient;
// - holo_zigzag_trans.png: grayscale opacity (faint glass, bright lines);
// - holo_zigzag_illum.png: grayscale self-illum mask (the glowing part).
//
// Also holo_dashes_{color,trans,illum}.png for holo_dashes.vmat and
// holo_portal_{color,trans,illum}.png for holo_portal.vmat (see below).
//
// `node tools/make-holo.mjs <name>` (e.g. holo_dashes) writes only that
// texture set and leaves the others' PNGs untouched.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const OUT_DIR = new URL("../materials/melon_racer/", import.meta.url);
const ONLY = process.argv[2];

/** Writes <name>_{color,trans,illum}.png, unless another name was asked for. */
function WriteSet(name, width, height, color, trans, illum) {
    if (ONLY && ONLY !== name) return;
    writeFileSync(new URL(`${name}_color.png`, OUT_DIR), WritePng(width, height, 3, color));
    writeFileSync(new URL(`${name}_trans.png`, OUT_DIR), WritePng(width, height, 1, trans));
    writeFileSync(new URL(`${name}_illum.png`, OUT_DIR), WritePng(width, height, 1, illum));
    console.log(`wrote ${name}_{color,trans,illum}.png (${width}x${height})`);
}
const NAME = "holo_zigzag";

const SIZE = 512; // power of two (resourcecompiler needs it for mips)
const ZIG_PERIOD = 128; // px per zig+zag horizontally (must divide SIZE)
const ZIG_AMPLITUDE = 40; // px the line rises within half a period
const BAND_SPACING = 64; // px between zigzag lines vertically (must divide SIZE)
const CORE_WIDTH = 3; // px half-width of a line's bright core
const GLOW_WIDTH = 14; // px falloff of the glow around it
const SECOND_LINE_SHIFT = 0.5; // a thinner line halfway between the main ones
const SECOND_LINE_STRENGTH = 0.35;
const GLASS_ALPHA = 0.1; // opacity of the empty area between lines

// Holo gradient, stops along the diagonal (0..1, wraps). Each color is held
// for a while and the change between them kept short: halfway between green
// and violet is a muddy grey.
const GRADIENT = [
    [0.0, [57, 255, 20]], // toxic green
    [0.35, [57, 255, 20]],
    [0.5, [170, 40, 255]], // ultraviolet
    [0.85, [170, 40, 255]],
    [1.0, [57, 255, 20]],
];

// --- PNG write (same as make-decal.mjs) ---

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
/** channels: 1 = grayscale, 3 = RGB. */
function WritePng(width, height, channels, pixels) {
    const stride = width * channels;
    const rows = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y++) pixels.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = { 1: 0, 3: 2 }[channels];
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(rows)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

// --- pattern ---

/** Triangle wave, 0..1..0 over one period. */
function Triangle(t) {
    const f = t - Math.floor(t);
    return f < 0.5 ? f * 2 : 2 - f * 2;
}

/** Distance (px, vertical) from y to the nearest line of a zigzag family. */
function LineDistance(x, y, shift) {
    const lineY = ZIG_AMPLITUDE * Triangle(x / ZIG_PERIOD);
    const d = (y - lineY) / BAND_SPACING - shift;
    const f = d - Math.round(d);
    // Vertical distance → roughly perpendicular: the line is slanted.
    const slope = (2 * ZIG_AMPLITUDE) / ZIG_PERIOD;
    return (Math.abs(f) * BAND_SPACING) / Math.sqrt(1 + slope * slope);
}

function LineIntensity(dist, coreWidth) {
    const core = Math.max(0, Math.min(1, coreWidth + 0.5 - dist)); // anti-aliased
    const glow = Math.exp(-(dist * dist) / (2 * (GLOW_WIDTH / 2.5) ** 2));
    return Math.min(1, core + glow * 0.75);
}

function Gradient(t) {
    t -= Math.floor(t);
    for (let i = 1; i < GRADIENT.length; i++) {
        const [t1, c1] = GRADIENT[i];
        const [t0, c0] = GRADIENT[i - 1];
        if (t <= t1) {
            const k = (t - t0) / (t1 - t0);
            const s = k * k * (3 - 2 * k);
            return c0.map((v, j) => v + (c1[j] - v) * s);
        }
    }
    return GRADIENT[0][1];
}

const color = Buffer.alloc(SIZE * SIZE * 3);
const trans = Buffer.alloc(SIZE * SIZE);
const illum = Buffer.alloc(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
        const main = LineIntensity(LineDistance(x, y, 0), CORE_WIDTH);
        const second = LineIntensity(LineDistance(x, y, SECOND_LINE_SHIFT), 1) * SECOND_LINE_STRENGTH;
        const line = Math.min(1, main + second);
        // Diagonal gradient that wraps exactly once across the tile.
        const [r, g, b] = Gradient((x + y) / (2 * SIZE) * 2);
        // Line cores go towards white, like an overexposed hologram.
        const white = Math.max(0, main - 0.85) / 0.15 * 0.6;
        const i = y * SIZE + x;
        color[i * 3] = Math.round(r + (255 - r) * white);
        color[i * 3 + 1] = Math.round(g + (255 - g) * white);
        color[i * 3 + 2] = Math.round(b + (255 - b) * white);
        trans[i] = Math.round(255 * (GLASS_ALPHA + (1 - GLASS_ALPHA) * line));
        illum[i] = Math.round(255 * Math.max(0.15, line));
    }
}

mkdirSync(OUT_DIR, { recursive: true });
WriteSet(NAME, SIZE, SIZE, color, trans, illum);

// --- holo_dashes: staggered diagonal dashes (materials/melon_racer/holo_dashes.vmat) ---
//
// Short "\" dashes on dashed diagonal lines, each line's dashes shifted half
// a period against its neighbors', so they sit in a staggered grid. Worked in
// a = x - y (across the lines) and b = x + y (along them): both periods
// divide 2 * SIZE's step of SIZE, and SIZE / DASH_LINE_PERIOD is even, so the
// stagger lines up again at the tile edge — seamless. Same gradient as the
// zigzag.

const DASH_NAME = "holo_dashes";
const DASH_LINE_PERIOD = 32; // in x - y: lines are 32 / √2 ≈ 23 px apart (must divide SIZE, SIZE / it even)
const DASH_PERIOD = 64; // in x + y: dash to dash along a line, 64 / √2 ≈ 45 px (must divide SIZE)
const DASH_LENGTH = 28; // px, of the dash's straight part
const DASH_CORE_WIDTH = 1.5; // px half-width of a dash's bright core
const DASH_GLOW_WIDTH = 7; // px falloff of the glow around it

/** Distance (px) from pixel (x, y) to the nearest dash. */
function DashDistance(x, y) {
    const a = x - y;
    const line = Math.round(a / DASH_LINE_PERIOD);
    const across = (a - line * DASH_LINE_PERIOD) / Math.SQRT2;
    const b = x + y - (line & 1) * (DASH_PERIOD / 2);
    const along = (b - Math.round(b / DASH_PERIOD) * DASH_PERIOD) / Math.SQRT2;
    const beyondEnd = Math.max(0, Math.abs(along) - DASH_LENGTH / 2);
    return Math.hypot(beyondEnd, across);
}

const dashColor = Buffer.alloc(SIZE * SIZE * 3);
const dashTrans = Buffer.alloc(SIZE * SIZE);
const dashIllum = Buffer.alloc(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
        // Supersampled 2x2, the dashes are thin enough to shimmer otherwise.
        let line = 0;
        for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
            const dist = DashDistance(x + ox, y + oy);
            const core = Math.max(0, Math.min(1, DASH_CORE_WIDTH + 0.5 - dist));
            const glow = Math.exp(-(dist * dist) / (2 * (DASH_GLOW_WIDTH / 2.5) ** 2));
            line += Math.min(1, core + glow * 0.6) / 4;
        }
        const [r, g, b] = Gradient((x + y) / (2 * SIZE) * 2);
        const white = Math.max(0, line - 0.85) / 0.15 * 0.6;
        const i = y * SIZE + x;
        dashColor[i * 3] = Math.round(r + (255 - r) * white);
        dashColor[i * 3 + 1] = Math.round(g + (255 - g) * white);
        dashColor[i * 3 + 2] = Math.round(b + (255 - b) * white);
        dashTrans[i] = Math.round(255 * (GLASS_ALPHA + (1 - GLASS_ALPHA) * line));
        dashIllum[i] = Math.round(255 * Math.max(0.15, line));
    }
}
WriteSet(DASH_NAME, SIZE, SIZE, dashColor, dashTrans, dashIllum);

// --- holo_portal: disc filling the ring's hole (materials/melon_racer/holo_portal.vmat) ---
//
// A color pulse over the whole disc at once: the texture is one pulse period
// along U (dark → bright → dark, wraps). The material shrinks the UVs so the
// whole face samples a sliver of it (g_vTexCoordScale) and scrolls U, so the
// face's color, glow and opacity rise and fall together. Only plain scrolling,
// no DynamicParams (their animation didn't work in-engine).

const PORTAL_NAME = "holo_portal";
const PORTAL_WIDTH = 256; // power of two, one pulse period
const PORTAL_HEIGHT = 4; // power of two; the gradient only runs along U
const PORTAL_SHARPNESS = 2; // > 1 = shorter flash, longer calm between
const PORTAL_DARK_COLOR = [40, 170, 40];
const PORTAL_BRIGHT_COLOR = [200, 255, 170]; // almost white lime
const PORTAL_ILLUM = [0.2, 1];
const PORTAL_ALPHA = [0.25, 0.75];

const portalColor = Buffer.alloc(PORTAL_WIDTH * PORTAL_HEIGHT * 3);
const portalTrans = Buffer.alloc(PORTAL_WIDTH * PORTAL_HEIGHT);
const portalIllum = Buffer.alloc(PORTAL_WIDTH * PORTAL_HEIGHT);
for (let x = 0; x < PORTAL_WIDTH; x++) {
    const u = (x + 0.5) / PORTAL_WIDTH;
    const k = (0.5 - 0.5 * Math.cos(2 * Math.PI * u)) ** PORTAL_SHARPNESS; // 0..1..0, seamless
    for (let y = 0; y < PORTAL_HEIGHT; y++) {
        const i = y * PORTAL_WIDTH + x;
        for (let j = 0; j < 3; j++) {
            portalColor[i * 3 + j] = Math.round(PORTAL_DARK_COLOR[j] + (PORTAL_BRIGHT_COLOR[j] - PORTAL_DARK_COLOR[j]) * k);
        }
        portalTrans[i] = Math.round(255 * (PORTAL_ALPHA[0] + (PORTAL_ALPHA[1] - PORTAL_ALPHA[0]) * k));
        portalIllum[i] = Math.round(255 * (PORTAL_ILLUM[0] + (PORTAL_ILLUM[1] - PORTAL_ILLUM[0]) * k));
    }
}
WriteSet(PORTAL_NAME, PORTAL_WIDTH, PORTAL_HEIGHT, portalColor, portalTrans, portalIllum);
