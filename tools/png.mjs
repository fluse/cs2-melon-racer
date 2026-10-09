// Minimal RGBA PNG encoder (and 8-bit decoder) shared by the image generators in tools/ — no
// dependencies.
import { deflateSync, inflateSync } from "node:zlib";

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

/**
 * A PNG file from `pixel(x, y)` → [r, g, b, a] (0..255 each), one call per pixel.
 * @param {number} width @param {number} height @param {(x: number, y: number) => number[]} pixel
 */
export function EncodePng(width, height, pixel) {
    const stride = width * 4 + 1;
    const rows = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        rows[y * stride] = 0; // PNG filter: none
        for (let x = 0; x < width; x++) {
            const [r, g, b, a] = pixel(x, y);
            const o = y * stride + 1 + x * 4;
            rows[o] = r;
            rows[o + 1] = g;
            rows[o + 2] = b;
            rows[o + 3] = a;
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(rows)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/**
 * Decodes an 8-bit, non-interlaced PNG (grayscale, RGB or RGBA — what the
 * generators here write) into { width, height, channels, data }, data one
 * byte per channel, row after row.
 * @param {Buffer} file
 */
export function DecodePng(file) {
    let width = 0, height = 0, channels = 0;
    const idat = [];
    for (let o = 8; o < file.length;) {
        const length = file.readUInt32BE(o);
        const type = file.toString("ascii", o + 4, o + 8);
        const body = file.subarray(o + 8, o + 8 + length);
        if (type === "IHDR") {
            width = body.readUInt32BE(0);
            height = body.readUInt32BE(4);
            if (body[8] !== 8 || body[12] !== 0) throw new Error("DecodePng: only 8-bit, non-interlaced");
            channels = { 0: 1, 2: 3, 6: 4 }[body[9]];
            if (!channels) throw new Error(`DecodePng: color type ${body[9]} not supported`);
        } else if (type === "IDAT") idat.push(body);
        o += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const data = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? data[y * stride + x - channels] : 0;
            const b = y ? data[(y - 1) * stride + x] : 0;
            const c = x >= channels && y ? data[(y - 1) * stride + x - channels] : 0;
            let v = raw[y * (stride + 1) + 1 + x];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            data[y * stride + x] = v & 255;
        }
    }
    return { width, height, channels, data };
}
