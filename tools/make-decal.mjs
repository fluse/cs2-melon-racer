// Turns source PNGs into the textures of the in-game decals in
// materials/melon_racer/ (one <name>.vmat each, see DECALS) —
// `node tools/make-decal.mjs`. Re-run after changing a source image.
// No dependencies, like make-icons.mjs.
//
// - optionally keys out a checkerboard "transparency" that was baked into
//   the source's pixels (keyCheckerboard, see KeyCheckerboard) and writes
//   the result as rawDecals/done/<source>_transparent.png;
// - crops the image's transparent margin away (plus PADDING), so the decal is
//   only as big as the lettering;
// - _color.png: RGB, with the edge colors bled out into the transparent
//   area — otherwise mipmaps/filtering blend in the black of fully
//   transparent pixels and the decal gets a dark outline at a distance;
// - _trans.png: the alpha channel as a grayscale mask (TextureTranslucency);
// - both scaled/padded to a power-of-two size (see below).
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = new URL("../materials/melon_racer/", import.meta.url);
// Raw decal images are dropped into rawDecals/; once their decal textures
// are written they're moved to rawDecals/done/ (with their
// _transparent.png), so rawDecals/ only holds what's still to do.
const RAW_DIR = new URL("../rawDecals/", import.meta.url);
const RAW_DONE_DIR = new URL("../rawDecals/done/", import.meta.url);
// source: path relative to this file; raw: file name in rawDecals/ (or done/).
const DECALS = [
    { source: "../panorama/images/custom_game/logo_melon_racer.png", name: "logo_melon_racer_decal" },
    // Exported with a gray checkerboard painted in instead of real alpha.
    { raw: "PressUse.png", name: "press_use_decal", keyCheckerboard: true },
    { raw: "Jump.png", name: "jump_decal", keyCheckerboard: true },
    { raw: "Arrow.jpg", name: "arrow_decal", keyCheckerboard: true },
    { raw: "WallJump.jpg", name: "wall_jump_decal", keyCheckerboard: true },
    // Yellowish checkerboard, dull grayish-teal lettering: see TintedSaturation.
    { raw: "AttackForBoost.jpg", name: "attack_for_boost_decal", keyCheckerboard: true, keyTinted: true },
];
const PADDING = 8; // px of transparent border kept around the lettering
const ALPHA_EMPTY = 4; // alpha at or below this counts as empty when cropping
const BLEED_PASSES = 16; // px the edge colors are spread into transparent area

// Checkerboard keying: the checkerboard is neutral gray, the artwork is
// colorful, so a pixel's saturation (max - min channel) decides its alpha.
const KEY_SAT_LO = 14; // saturation at or below this = background (alpha 0)
const KEY_SAT_HI = 40; // saturation at or above this = artwork (alpha 255)
const KEY_MIN_AREA = 60; // px; colorful islands smaller than this are specks
const KEY_MIN_HOLE = 12; // pure-gray px an enclosed region needs to be a hole (letter counter)
const KEY_CLOSE_PX = 6; // grayish seams up to twice this wide inside the artwork are filled...
const KEY_SAT_PURE = 8; // ...except pixels this gray, which are always checkerboard (keeps small counters open)
const KEY_EDGE_PX = 4; // px around the artwork where alpha may be partial (anti-aliasing)
// keyTinted only (TintedSaturation):
const KEY_TINT_SAMPLE_SAT = 20; // pixels at or below this raw saturation sample the checkerboard's tint...
const KEY_TINT_LIGHT_PERCENTILE = 0.99; // ...and its light squares' brightness (this share of them is at or below it)
const KEY_TINT_BRIGHT_MARGIN = 12; // brighter than the light squares by more than this = artwork highlight
const KEY_TINT_SAT_GAIN = 1.6; // tint-corrected saturation is scaled by this before the usual thresholds

// --- PNG read (8-bit RGB/RGBA, non-interlaced) ---

function ReadPng(buf) {
    let pos = 8, width = 0, height = 0, channels = 4;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString("ascii", pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            if (data[8] !== 8 || (data[9] !== 6 && data[9] !== 2) || data[12] !== 0) {
                throw new Error("source must be an 8-bit RGB/RGBA, non-interlaced PNG");
            }
            channels = data[9] === 6 ? 4 : 3;
        } else if (type === "IDAT") idat.push(data);
        pos += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const px = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= channels ? px[y * stride + i - channels] : 0;
            const b = y > 0 ? px[(y - 1) * stride + i] : 0;
            const c = y > 0 && i >= channels ? px[(y - 1) * stride + i - channels] : 0;
            let v = line[i];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            px[y * stride + i] = v & 0xff;
        }
    }
    if (channels === 4) return { width, height, px };
    const rgba = Buffer.alloc(width * height * 4, 255);
    for (let i = 0; i < width * height; i++) px.copy(rgba, i * 4, i * 3, i * 3 + 3);
    return { width, height, px: rgba };
}

/**
 * PNG directly; JPG (no decoder here, and no dependencies) via Windows'
 * own System.Drawing, which re-saves it as a temporary PNG — Hammer only
 * runs on Windows anyway.
 */
function ReadImage(url) {
    if (!/\.jpe?g$/i.test(url.pathname)) return ReadPng(readFileSync(url));
    const tmp = join(tmpdir(), `make-decal-${process.pid}.png`);
    try {
        execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
            "Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile($env:DECAL_IN); " +
            "try { $img.Save($env:DECAL_OUT, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $img.Dispose() }"],
        { env: { ...process.env, DECAL_IN: fileURLToPath(url), DECAL_OUT: tmp }, stdio: ["ignore", "ignore", "inherit"] });
        return ReadPng(readFileSync(tmp));
    } finally {
        rmSync(tmp, { force: true });
    }
}

// --- PNG write ---

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

// --- checkerboard keying ---

/**
 * Replaces the source's alpha, telling artwork from the baked-in (neutral
 * gray) checkerboard by how colorful each pixel is:
 * - clearly colorful pixels (≥ KEY_SAT_HI) are artwork; islands of them
 *   smaller than KEY_MIN_AREA are specks in the background and dropped;
 * - seams up to 2 * KEY_CLOSE_PX wide inside the artwork are closed (never
 *   over pure-gray pixels, ≤ KEY_SAT_PURE);
 * - every connected region of the remaining, grayish pixels is background
 *   only if it holds at least KEY_MIN_HOLE pure-gray (≤ KEY_SAT_LO) pixels —
 *   the surroundings and letter counters (inside P, R, ...). Others are
 *   dull spots *inside* a letter (dark melon stripes, sat. above
 *   KEY_SAT_LO) and stay opaque;
 * - in background regions, alpha ramps with saturation only within
 *   KEY_EDGE_PX of the artwork (its anti-aliased edge); farther out it's 0,
 *   so a tinted glow in the checkerboard doesn't leave a faint smudge.
 */
function KeyCheckerboard({ width, height, px }, tinted = false) {
    const n = width * height;
    const sat = tinted ? TintedSaturation(width, height, px) : new Uint8Array(n);
    for (let i = 0; i < n && !tinted; i++) {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
        sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
    }
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) solid[i] = sat[i] >= KEY_SAT_HI ? 1 : 0;

    const stack = new Int32Array(n);
    /** Calls visit(members) for each 4-connected region of pixels where solid[] === kind. */
    function ForEachRegion(kind, visit) {
        const seen = new Uint8Array(n);
        for (let start = 0; start < n; start++) {
            if (seen[start] || solid[start] !== kind) continue;
            const members = [];
            let top = 0;
            stack[top++] = start;
            seen[start] = 1;
            while (top) {
                const i = stack[--top];
                members.push(i);
                const x = i % width, y = (i / width) | 0;
                for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const j = ny * width + nx;
                    if (seen[j] || solid[j] !== kind) continue;
                    seen[j] = 1;
                    stack[top++] = j;
                }
            }
            visit(members);
        }
    }

    /** Distance in px (4-neighbour steps, capped at maxD + 1) to the nearest pixel where solid[] === kind. */
    function DistanceTo(kind, maxD) {
        const dist = new Uint8Array(n).fill(maxD + 1);
        let frontier = [];
        for (let i = 0; i < n; i++) if (solid[i] === kind) { dist[i] = 0; frontier.push(i); }
        for (let d = 1; d <= maxD; d++) {
            const next = [];
            for (const i of frontier) {
                const x = i % width, y = (i / width) | 0;
                for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const j = ny * width + nx;
                    if (dist[j] <= d) continue;
                    dist[j] = d;
                    next.push(j);
                }
            }
            frontier = next;
        }
        return dist;
    }

    const specks = [];
    ForEachRegion(1, (members) => { if (members.length < KEY_MIN_AREA) specks.push(members); });
    for (const members of specks) for (const i of members) solid[i] = 0;

    // Closing (grow the artwork by KEY_CLOSE_PX, then shrink it back): fills
    // thin grayish seams — where two colors of the artwork blend, the mix
    // can pass through gray (orange rim -> teal shadow) and would otherwise
    // be cut out as background.
    const grown = DistanceTo(1, KEY_CLOSE_PX);
    for (let i = 0; i < n; i++) solid[i] = grown[i] <= KEY_CLOSE_PX ? 1 : 0;
    const outside = DistanceTo(0, KEY_CLOSE_PX);
    for (let i = 0; i < n; i++) solid[i] = grown[i] === 0 || (outside[i] > KEY_CLOSE_PX && sat[i] > KEY_SAT_PURE) ? 1 : 0;

    const dist = DistanceTo(1, KEY_EDGE_PX);
    for (let i = 0; i < n; i++) px[i * 4 + 3] = solid[i] ? 255 : 0;
    ForEachRegion(0, (members) => {
        let gray = 0;
        for (const i of members) if (sat[i] <= KEY_SAT_LO) gray++;
        if (gray < KEY_MIN_HOLE) {
            for (const i of members) px[i * 4 + 3] = 255;
            return;
        }
        for (const i of members) {
            if (dist[i] > KEY_EDGE_PX) continue;
            const t = Math.min(Math.max((sat[i] - KEY_SAT_LO) / (KEY_SAT_HI - KEY_SAT_LO), 0), 1);
            px[i * 4 + 3] = Math.round(t * 255);
        }
    });
}

/**
 * Saturation for a checkerboard that isn't neutral gray but has a color
 * cast (e.g. slightly yellowish), next to artwork that is itself rather
 * dull in places (grayish teal): measured against the checkerboard's own
 * tint — estimated from the image's grayish pixels, nearly all of which are
 * checkerboard — instead of against pure gray. Pixels clearly brighter than
 * the light squares (highlights on the artwork) count as artwork whatever
 * their hue.
 */
function TintedSaturation(width, height, px) {
    const n = width * height;
    let sr = 0, sg = 0, sb = 0;
    const levels = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
        const hi = Math.max(r, g, b);
        if (hi - Math.min(r, g, b) > KEY_TINT_SAMPLE_SAT) continue;
        sr += r; sg += g; sb += b;
        levels[hi]++;
    }
    const kg = sg / sr, kb = sb / sr;
    let total = 0, light = 255;
    for (const count of levels) total += count;
    for (let seen = 0, v = 0; v < 256; v++) {
        seen += levels[v];
        if (seen >= total * KEY_TINT_LIGHT_PERCENTILE) { light = v; break; }
    }
    const sat = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const r = px[i * 4], g = px[i * 4 + 1] / kg, b = px[i * 4 + 2] / kb;
        const s = (Math.max(r, g, b) - Math.min(r, g, b)) * KEY_TINT_SAT_GAIN;
        const bright = Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) > light + KEY_TINT_BRIGHT_MARGIN;
        sat[i] = Math.min(255, Math.round(bright ? Math.max(s, KEY_SAT_HI) : s));
    }
    console.log(`tinted key: checkerboard tint g/r ${kg.toFixed(3)}, b/r ${kb.toFixed(3)}; light squares up to ${light}`);
    return sat;
}

// --- crop, bleed, split ---

function MakeDecal(src, outName) {
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) {
        for (let x = 0; x < src.width; x++) {
            if (src.px[(y * src.width + x) * 4 + 3] > ALPHA_EMPTY) {
                x0 = Math.min(x0, x); y0 = Math.min(y0, y);
                x1 = Math.max(x1, x); y1 = Math.max(y1, y);
            }
        }
    }
    x0 = Math.max(0, x0 - PADDING); y0 = Math.max(0, y0 - PADDING);
    x1 = Math.min(src.width - 1, x1 + PADDING); y1 = Math.min(src.height - 1, y1 + PADDING);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;

    const rgb = Buffer.alloc(w * h * 3);
    const alpha = Buffer.alloc(w * h);
    let filled = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const s = ((y + y0) * src.width + (x + x0)) * 4, d = y * w + x;
            alpha[d] = src.px[s + 3];
            if (src.px[s + 3] > ALPHA_EMPTY) {
                rgb[d * 3] = src.px[s]; rgb[d * 3 + 1] = src.px[s + 1]; rgb[d * 3 + 2] = src.px[s + 2];
                filled[d] = 1;
            }
        }
    }
    // Each pass gives every still-empty pixel next to a filled one the average
    // color of its filled neighbours.
    for (let pass = 0; pass < BLEED_PASSES; pass++) {
        const next = filled.slice();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const d = y * w + x;
                if (filled[d]) continue;
                let r = 0, g = 0, b = 0, n = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        const e = ny * w + nx;
                        if (!filled[e]) continue;
                        r += rgb[e * 3]; g += rgb[e * 3 + 1]; b += rgb[e * 3 + 2]; n++;
                    }
                }
                if (n) {
                    rgb[d * 3] = r / n; rgb[d * 3 + 1] = g / n; rgb[d * 3 + 2] = b / n;
                    next[d] = 1;
                }
            }
        }
        filled = next;
    }

    // The texture compiler can't build mipmaps for non-power-of-two sizes, so
    // scale the crop (bilinear) to the next power-of-two width and center it in
    // a power-of-two height. Rows above/below get alpha 0 and the nearest edge
    // color (clamped sampling), same reason as the bleed.
    const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(n));
    const W = nextPow2(w);
    const scale = W / w;
    const H = nextPow2(Math.ceil(h * scale));
    const offsetY = (H - h * scale) / 2;
    const outRgb = Buffer.alloc(W * H * 3);
    const outAlpha = Buffer.alloc(W * H);
    function Sample(buf, channels, c, fx, fy) {
        fx = Math.min(Math.max(fx, 0), w - 1);
        fy = Math.min(Math.max(fy, 0), h - 1);
        const ix = Math.min(Math.floor(fx), w - 2), iy = Math.min(Math.floor(fy), h - 2);
        const tx = fx - ix, ty = fy - iy;
        const at = (x, y) => buf[(y * w + x) * channels + c];
        return (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const fx = (x + 0.5) / scale - 0.5, fy = (y - offsetY + 0.5) / scale - 0.5;
            const d = y * W + x;
            for (let c = 0; c < 3; c++) outRgb[d * 3 + c] = Math.round(Sample(rgb, 3, c, fx, fy));
            const inside = fy >= -0.5 && fy <= h - 0.5;
            outAlpha[d] = inside ? Math.round(Sample(alpha, 1, 0, fx, fy)) : 0;
        }
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(new URL(`${outName}_color.png`, OUT_DIR), WritePng(W, H, 3, outRgb));
    writeFileSync(new URL(`${outName}_trans.png`, OUT_DIR), WritePng(W, H, 1, outAlpha));
    console.log(`wrote materials/melon_racer/${outName}_color.png + _trans.png (${W}x${H}, from a ${w}x${h} crop of ${src.width}x${src.height})`);
}

for (const decal of DECALS) {
    // A raw image is looked for in rawDecals/ first (new or replaced), then in
    // rawDecals/done/ (already turned into a decal before).
    let sourceUrl, pending = false;
    if (decal.raw) {
        const fresh = new URL(decal.raw, RAW_DIR);
        pending = existsSync(fresh);
        sourceUrl = pending ? fresh : new URL(decal.raw, RAW_DONE_DIR);
    } else sourceUrl = new URL(decal.source, import.meta.url);
    const src = ReadImage(sourceUrl);
    if (decal.keyCheckerboard) {
        KeyCheckerboard(src, decal.keyTinted);
        const keyedName = decal.raw.replace(/\.(png|jpe?g)$/i, "_transparent.png");
        mkdirSync(RAW_DONE_DIR, { recursive: true });
        writeFileSync(new URL(keyedName, RAW_DONE_DIR), WritePng(src.width, src.height, 4, src.px));
        console.log(`wrote rawDecals/done/${keyedName}`);
    }
    MakeDecal(src, decal.name);
    if (pending) {
        mkdirSync(RAW_DONE_DIR, { recursive: true });
        renameSync(sourceUrl, new URL(decal.raw, RAW_DONE_DIR));
        console.log(`moved rawDecals/${decal.raw} -> rawDecals/done/`);
    }
}
