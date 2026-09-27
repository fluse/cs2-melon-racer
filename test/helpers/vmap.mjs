// Minimal reader for Hammer's binary DMX .vmap format ("dmx encoding binary
// 9"), just enough to pull entity keyvalues out for tests — so a test can
// check that the Hammer entities a script depends on by name (point_templates,
// the particle systems they spawn, ...) actually exist and are wired up the
// way the script expects, without anyone having to open Hammer.
import { readFileSync } from "node:fs";

/**
 * @param {string} path
 * @returns {Array<{ type: string, name: string, attrs: Record<string, any> }>} every DMX element
 */
export function ReadDmxElements(path) {
    const b = readFileSync(path);
    const header = b.slice(0, b.indexOf(0)).toString("latin1");
    const match = /dmx encoding binary (\d+)/.exec(header);
    if (!match || Number(match[1]) !== 9) {
        throw new Error(`${path}: unsupported DMX encoding "${header}" — this reader only handles "binary 9"`);
    }
    let p = b.indexOf(0) + 1;
    const i32 = () => { const v = b.readInt32LE(p); p += 4; return v; };
    const cstr = () => { const e = b.indexOf(0, p); const s = b.slice(p, e).toString("utf8"); p = e + 1; return s; };
    const floats = (n) => { const v = []; for (let k = 0; k < n; k++) v.push(b.readFloatLE(p + k * 4)); p += n * 4; return v; };
    /** @type {string[]} */
    const strings = [];
    /** @param {number} t @param {boolean} inline strings stored inline instead of as a string-table index */
    const readValue = (t, inline) => {
        switch (t) {
            case 1: return { elem: i32() };
            case 2: return i32();
            case 3: return floats(1)[0];
            case 4: return b[p++] !== 0;
            case 5: return inline ? cstr() : strings[i32()];
            case 6: { const n = i32(); p += n; return null; } // binary blob
            case 7: p += 8; return null; // time
            case 8: { const v = [...b.slice(p, p + 4)]; p += 4; return v; } // color
            case 9: return floats(2);
            case 10: case 12: return floats(3); // vector3 / qangle
            case 11: case 13: return floats(4); // vector4 / quaternion
            case 14: p += 64; return null; // matrix
            case 15: { const v = b.readBigUInt64LE(p); p += 8; return v; }
            case 16: return b[p++];
            default:
                if (t > 32) {
                    const n = i32();
                    const arr = [];
                    // Array elements' strings are always inline.
                    for (let k = 0; k < n; k++) arr.push(readValue(t - 32, true));
                    return arr;
                }
                throw new Error(`${path}: unknown DMX attribute type ${t} at byte ${p}`);
        }
    };

    // Prefix attribute containers (asset preview thumbnail etc.) — skipped.
    const prefixCount = i32();
    for (let k = 0; k < prefixCount; k++) {
        const n = i32();
        for (let j = 0; j < n; j++) {
            cstr();
            readValue(b[p++], true);
        }
    }
    const stringCount = i32();
    for (let k = 0; k < stringCount; k++) strings.push(cstr());
    const elementCount = i32();
    const elements = [];
    for (let k = 0; k < elementCount; k++) {
        const type = strings[i32()];
        const name = strings[i32()];
        p += 16; // GUID
        elements.push({ type, name, attrs: /** @type {Record<string, any>} */ ({}) });
    }
    for (const element of elements) {
        const n = i32();
        for (let j = 0; j < n; j++) {
            const attrName = strings[i32()];
            element.attrs[attrName] = readValue(b[p++], false);
        }
    }
    return elements;
}

/**
 * Every entity's keyvalues (classname, targetname, ...) in a .vmap —
 * including ones inside prefabs/instances that were collapsed into it.
 * @param {string} path
 * @returns {Array<Record<string, any>>}
 */
export function ReadVmapEntities(path) {
    return ReadDmxElements(path)
        .filter((e) => e.type === "EditGameClassProps" && typeof e.attrs.classname === "string")
        .map((e) => e.attrs);
}
