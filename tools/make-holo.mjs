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
// holo_portal_{color,trans,illum}.png for holo_portal.vmat and
// holo_heal_{color,trans,illum}.png for holo_heal.vmat and
// holo_checkpoint_{color,trans,illum}.png for holo_checkpoint.vmat (see below).
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
/** channels: 1 = grayscale, 3 = RGB, 4 = RGBA. */
function WritePng(width, height, channels, pixels) {
    const stride = width * channels;
    const rows = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y++) pixels.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = { 1: 0, 3: 2, 4: 6 }[channels];
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

// --- holo_heal: rising plus crosses for heal gates (materials/melon_racer/holo_heal.vmat) ---
//
// Staggered grid of outlined "+" crosses (the heal sign) with a softly filled
// inside, in the HUD health bar's green shading to mint. Color and opacity
// hold the crosses; the material scrolls them upward. The self-illum mask is
// its own pattern — one broad bright band per tile plus soft scanlines — and
// scrolls faster, so a scan wave sweeps up over the rising crosses.
// HEAL_CELL divides SIZE and SIZE / HEAL_CELL is even, so the half-cell
// stagger of every other row lines up again at the tile edge — seamless.

const HEAL_NAME = "holo_heal";
const HEAL_CELL = 128; // px between crosses in a row, and between rows (must divide SIZE, SIZE / it even)
const HEAL_ARM_LENGTH = 30; // px from a cross's center to the end of an arm
const HEAL_ARM_WIDTH = 10; // px half-width of an arm
const HEAL_EDGE_WIDTH = 1.5; // px half-width of the bright outline
const HEAL_GLOW_WIDTH = 12; // px falloff of the glow around the outline
const HEAL_FILL = 0.4; // brightness of a cross's inside
const HEAL_GLASS_ALPHA = 0.08;
const HEAL_BAND_WIDTH = 70; // px, the illum scan band's softness (one band per tile)
const HEAL_SCANLINE_PERIOD = 16; // px (must divide SIZE)
const HEAL_SCANLINE_DEPTH = 0.25; // how much darker between scanlines
const HEAL_ILLUM_MIN = 0.35; // illum outside the band
const HEAL_GRADIENT = [
    [0.0, [40, 255, 110]], // heal green
    [0.4, [40, 255, 110]],
    [0.55, [110, 255, 215]], // mint
    [0.9, [110, 255, 215]],
    [1.0, [40, 255, 110]],
];

/** Signed distance (px) from (x, y) to a "+" centered at the origin; < 0 inside. */
function CrossDistance(x, y) {
    x = Math.abs(x);
    y = Math.abs(y);
    // Union of a horizontal and a vertical box.
    const Box = (px, py, hx, hy) => {
        const dx = px - hx;
        const dy = py - hy;
        return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
    };
    return Math.min(Box(x, y, HEAL_ARM_LENGTH, HEAL_ARM_WIDTH), Box(x, y, HEAL_ARM_WIDTH, HEAL_ARM_LENGTH));
}

/** Signed distance (px) from pixel (x, y) to the nearest cross of the staggered grid. */
function HealDistance(x, y) {
    const row = Math.round(y / HEAL_CELL);
    const shift = (((row % 2) + 2) % 2) * (HEAL_CELL / 2);
    const cx = Math.round((x - shift) / HEAL_CELL) * HEAL_CELL + shift;
    // A staggered neighbor row can be nearer than the own row's cross.
    let best = Infinity;
    for (const dr of [-1, 0, 1]) {
        const r = row + dr;
        const s = (((r % 2) + 2) % 2) * (HEAL_CELL / 2);
        for (const dc of [-HEAL_CELL, 0, HEAL_CELL]) {
            const px = Math.round((cx + dc - s) / HEAL_CELL) * HEAL_CELL + s;
            best = Math.min(best, CrossDistance(x - px, y - r * HEAL_CELL));
        }
    }
    return best;
}

function HealGradient(t) {
    t -= Math.floor(t);
    for (let i = 1; i < HEAL_GRADIENT.length; i++) {
        const [t1, c1] = HEAL_GRADIENT[i];
        const [t0, c0] = HEAL_GRADIENT[i - 1];
        if (t <= t1) {
            const k = (t - t0) / (t1 - t0);
            const s = k * k * (3 - 2 * k);
            return c0.map((v, j) => v + (c1[j] - v) * s);
        }
    }
    return HEAL_GRADIENT[0][1];
}

const healColor = Buffer.alloc(SIZE * SIZE * 3);
const healTrans = Buffer.alloc(SIZE * SIZE);
const healIllum = Buffer.alloc(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
    // Illum: one soft band per tile (centered on the tile edge, wraps) times scanlines.
    const bandDist = Math.abs(((y + SIZE / 2) % SIZE) - SIZE / 2);
    const band = Math.exp(-(bandDist * bandDist) / (2 * HEAL_BAND_WIDTH ** 2));
    const scan = 1 - HEAL_SCANLINE_DEPTH * (0.5 - 0.5 * Math.cos((2 * Math.PI * y) / HEAL_SCANLINE_PERIOD));
    const illumRow = (HEAL_ILLUM_MIN + (1 - HEAL_ILLUM_MIN) * band) * scan;
    for (let x = 0; x < SIZE; x++) {
        // Supersampled 2x2, like the dashes.
        let edge = 0;
        let inside = 0;
        for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
            const d = HealDistance(x + ox, y + oy);
            const dist = Math.abs(d);
            const core = Math.max(0, Math.min(1, HEAL_EDGE_WIDTH + 0.5 - dist));
            // Glow only outwards: inside, the fill does the job evenly.
            const glow = d > 0 ? Math.exp(-(dist * dist) / (2 * (HEAL_GLOW_WIDTH / 2.5) ** 2)) : 0;
            edge += Math.min(1, core + glow * 0.6) / 4;
            inside += (d < 0 ? 1 : 0) / 4;
        }
        const line = Math.min(1, edge + inside * HEAL_FILL);
        // Vertical gradient that wraps once across the tile, so it rises with the crosses.
        const [r, g, b] = HealGradient(y / SIZE);
        const white = Math.max(0, edge - 0.85) / 0.15 * 0.6;
        const i = y * SIZE + x;
        healColor[i * 3] = Math.round(r + (255 - r) * white);
        healColor[i * 3 + 1] = Math.round(g + (255 - g) * white);
        healColor[i * 3 + 2] = Math.round(b + (255 - b) * white);
        healTrans[i] = Math.round(255 * (HEAL_GLASS_ALPHA + (1 - HEAL_GLASS_ALPHA) * line));
        healIllum[i] = Math.round(255 * illumRow);
    }
}
WriteSet(HEAL_NAME, SIZE, SIZE, healColor, healTrans, healIllum);

// --- particle_heal_cross: one of holo_heal's crosses as a particle sprite ---
//
// For particles/melon_racer/heal_crosses.vpcf (via particle_heal_cross.vtex):
// the same cross (CrossDistance, same size), alone and centered, white — the
// particle's color tints it, so the particle picks the heal gradient's colors.
// Opacity in alpha: bright outline, HEAL_FILL inside, glow outwards; the
// renderer is additive. `node tools/make-holo.mjs particle_heal_cross`.

const SPRITE_NAME = "particle_heal_cross";
const SPRITE_SIZE = 128; // power of two; the cross (60 px) + glow fits with room to spare

if (!ONLY || ONLY === SPRITE_NAME) {
    const sprite = Buffer.alloc(SPRITE_SIZE * SPRITE_SIZE * 4);
    for (let y = 0; y < SPRITE_SIZE; y++) {
        for (let x = 0; x < SPRITE_SIZE; x++) {
            let edge = 0;
            let inside = 0;
            for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
                const d = CrossDistance(x + ox - SPRITE_SIZE / 2, y + oy - SPRITE_SIZE / 2);
                const dist = Math.abs(d);
                const core = Math.max(0, Math.min(1, HEAL_EDGE_WIDTH + 0.5 - dist));
                const glow = d > 0 ? Math.exp(-(dist * dist) / (2 * (HEAL_GLOW_WIDTH / 2.5) ** 2)) : 0;
                edge += Math.min(1, core + glow * 0.6) / 4;
                inside += (d < 0 ? 1 : 0) / 4;
            }
            const i = (y * SPRITE_SIZE + x) * 4;
            sprite.fill(255, i, i + 3);
            sprite[i + 3] = Math.round(255 * Math.min(1, edge + inside * HEAL_FILL));
        }
    }
    writeFileSync(new URL(`${SPRITE_NAME}.png`, OUT_DIR), WritePng(SPRITE_SIZE, SPRITE_SIZE, 4, sprite));
    console.log(`wrote ${SPRITE_NAME}.png (${SPRITE_SIZE}x${SPRITE_SIZE})`);
}

// --- holo_checkpoint: respawn signs for checkpoint gates (materials/melon_racer/holo_checkpoint.vmat) ---
//
// "You respawn from here": a staggered grid of the usual respawn/restart sign
// — a circular arrow (ring with a gap and an arrowhead, turning
// counterclockwise, "back to here") around a filled spawn dot — in gold
// shading to amber, so a checkpoint gate reads differently from heal (green),
// lift (cyan) and jump pad (lime) markers. Outline and glow like holo_heal's
// crosses. The material drifts the signs slowly sideways; the self-illum mask
// is holo_heal's scan band, turned to run across, so a bright sweep passes
// over the gate. CHECKPOINT_CELL divides SIZE and SIZE / CHECKPOINT_CELL is
// even — seamless, like the heal grid.

const CHECKPOINT_NAME = "holo_checkpoint";
const CHECKPOINT_CELL = 128; // px between signs in a row, and between rows (must divide SIZE, SIZE / it even)
const CHECKPOINT_RING_RADIUS = 30; // px, center of the ring's stroke
const CHECKPOINT_RING_WIDTH = 5; // px half-width of the ring's stroke
const CHECKPOINT_GAP_START = 20; // degrees (0 = right, counterclockwise on screen): the ring is open from here…
const CHECKPOINT_GAP_END = 80; // …to here; the arrowhead sits at the gap's start, pointing into it
const CHECKPOINT_ARROW_LENGTH = 20; // px, arrowhead base to tip
const CHECKPOINT_ARROW_HALF_WIDTH = 13; // px, half the arrowhead's base
const CHECKPOINT_DOT_RADIUS = 9; // px, the spawn point in the middle
const CHECKPOINT_EDGE_WIDTH = 1.5; // px half-width of the bright outline
const CHECKPOINT_GLOW_WIDTH = 12; // px falloff of the glow around the outline
const CHECKPOINT_FILL = 0.55; // brightness of a sign's inside
const CHECKPOINT_GLASS_ALPHA = 0.08;
const CHECKPOINT_BAND_WIDTH = 70; // px, the illum scan band's softness (one band per tile)
const CHECKPOINT_SCANLINE_PERIOD = 16; // px (must divide SIZE)
const CHECKPOINT_SCANLINE_DEPTH = 0.25; // how much darker between scanlines
const CHECKPOINT_ILLUM_MIN = 0.35; // illum outside the band
const CHECKPOINT_GRADIENT = [
    [0.0, [255, 200, 40]], // gold
    [0.4, [255, 200, 40]],
    [0.55, [255, 140, 20]], // amber
    [0.9, [255, 140, 20]],
    [1.0, [255, 200, 40]],
];

/** Signed distance (px) from (x, y) to a convex polygon (counterclockwise points); < 0 inside. */
function PolygonDistance(x, y, points) {
    let best = Infinity;
    let inside = true;
    for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        const ex = bx - ax;
        const ey = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
        best = Math.min(best, Math.hypot(x - ax - ex * t, y - ay - ey * t));
        if (ex * (y - ay) - ey * (x - ax) < 0) inside = false;
    }
    return inside ? -best : best;
}

// The arrowhead, the same for every sign: base centered on the ring at the
// gap's start, tip further along the circle (counterclockwise) into the gap.
const CHECKPOINT_ARROW = (() => {
    const a = (CHECKPOINT_GAP_START * Math.PI) / 180;
    const [px, py] = [Math.cos(a) * CHECKPOINT_RING_RADIUS, Math.sin(a) * CHECKPOINT_RING_RADIUS];
    const [tx, ty] = [-Math.sin(a), Math.cos(a)]; // counterclockwise tangent
    const [nx, ny] = [Math.cos(a), Math.sin(a)]; // outward
    const tip = [px + tx * CHECKPOINT_ARROW_LENGTH, py + ty * CHECKPOINT_ARROW_LENGTH];
    const outer = [px + nx * CHECKPOINT_ARROW_HALF_WIDTH, py + ny * CHECKPOINT_ARROW_HALF_WIDTH];
    const inner = [px - nx * CHECKPOINT_ARROW_HALF_WIDTH, py - ny * CHECKPOINT_ARROW_HALF_WIDTH];
    return [inner, outer, tip]; // counterclockwise
})();

/** Signed distance (px) from (x, y) to one respawn sign centered at the origin; < 0 inside. */
function RespawnSignDistance(x, y) {
    y = -y; // image y runs down; flipped, "counterclockwise" is as seen on screen
    const r = Math.hypot(x, y);
    let deg = (Math.atan2(y, x) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    let ring;
    if (deg > CHECKPOINT_GAP_START && deg < CHECKPOINT_GAP_END) {
        // In the gap: distance to the nearer (round) end of the stroke.
        ring = Infinity;
        for (const endDeg of [CHECKPOINT_GAP_START, CHECKPOINT_GAP_END]) {
            const a = (endDeg * Math.PI) / 180;
            const d = Math.hypot(x - Math.cos(a) * CHECKPOINT_RING_RADIUS, y - Math.sin(a) * CHECKPOINT_RING_RADIUS);
            ring = Math.min(ring, d - CHECKPOINT_RING_WIDTH);
        }
    } else {
        ring = Math.abs(r - CHECKPOINT_RING_RADIUS) - CHECKPOINT_RING_WIDTH;
    }
    return Math.min(ring, PolygonDistance(x, y, CHECKPOINT_ARROW), r - CHECKPOINT_DOT_RADIUS);
}

/** Signed distance (px) from pixel (x, y) to the nearest sign of the staggered grid. */
function CheckpointDistance(x, y) {
    const row = Math.round(y / CHECKPOINT_CELL);
    let best = Infinity;
    for (const dr of [-1, 0, 1]) {
        const r = row + dr;
        const s = (((r % 2) + 2) % 2) * (CHECKPOINT_CELL / 2);
        const cx = Math.round((x - s) / CHECKPOINT_CELL) * CHECKPOINT_CELL + s;
        for (const dc of [-CHECKPOINT_CELL, 0, CHECKPOINT_CELL]) {
            best = Math.min(best, RespawnSignDistance(x - (cx + dc), y - r * CHECKPOINT_CELL));
        }
    }
    return best;
}

function CheckpointGradient(t) {
    t -= Math.floor(t);
    for (let i = 1; i < CHECKPOINT_GRADIENT.length; i++) {
        const [t1, c1] = CHECKPOINT_GRADIENT[i];
        const [t0, c0] = CHECKPOINT_GRADIENT[i - 1];
        if (t <= t1) {
            const k = (t - t0) / (t1 - t0);
            const s = k * k * (3 - 2 * k);
            return c0.map((v, j) => v + (c1[j] - v) * s);
        }
    }
    return CHECKPOINT_GRADIENT[0][1];
}

const checkpointColor = Buffer.alloc(SIZE * SIZE * 3);
const checkpointTrans = Buffer.alloc(SIZE * SIZE);
const checkpointIllum = Buffer.alloc(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
    const scan = 1 - CHECKPOINT_SCANLINE_DEPTH * (0.5 - 0.5 * Math.cos((2 * Math.PI * y) / CHECKPOINT_SCANLINE_PERIOD));
    for (let x = 0; x < SIZE; x++) {
        // Illum: one soft band per tile along U (centered on the tile edge, wraps) times scanlines.
        const bandDist = Math.abs(((x + SIZE / 2) % SIZE) - SIZE / 2);
        const band = Math.exp(-(bandDist * bandDist) / (2 * CHECKPOINT_BAND_WIDTH ** 2));
        // Supersampled 2x2, like the heal crosses.
        let edge = 0;
        let inside = 0;
        for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
            const d = CheckpointDistance(x + ox, y + oy);
            const dist = Math.abs(d);
            const core = Math.max(0, Math.min(1, CHECKPOINT_EDGE_WIDTH + 0.5 - dist));
            const glow = d > 0 ? Math.exp(-(dist * dist) / (2 * (CHECKPOINT_GLOW_WIDTH / 2.5) ** 2)) : 0;
            edge += Math.min(1, core + glow * 0.6) / 4;
            inside += (d < 0 ? 1 : 0) / 4;
        }
        const line = Math.min(1, edge + inside * CHECKPOINT_FILL);
        // Horizontal gradient that wraps once across the tile, so it drifts with the signs.
        const [r, g, b] = CheckpointGradient(x / SIZE);
        const white = Math.max(0, edge - 0.85) / 0.15 * 0.6;
        const i = y * SIZE + x;
        checkpointColor[i * 3] = Math.round(r + (255 - r) * white);
        checkpointColor[i * 3 + 1] = Math.round(g + (255 - g) * white);
        checkpointColor[i * 3 + 2] = Math.round(b + (255 - b) * white);
        checkpointTrans[i] = Math.round(255 * (CHECKPOINT_GLASS_ALPHA + (1 - CHECKPOINT_GLASS_ALPHA) * line));
        checkpointIllum[i] = Math.round(255 * (CHECKPOINT_ILLUM_MIN + (1 - CHECKPOINT_ILLUM_MIN) * band) * scan);
    }
}
WriteSet(CHECKPOINT_NAME, SIZE, SIZE, checkpointColor, checkpointTrans, checkpointIllum);
