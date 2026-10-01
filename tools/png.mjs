// Minimal RGBA PNG encoder shared by the image generators in tools/ — no
// dependencies.
import { deflateSync } from "node:zlib";

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
