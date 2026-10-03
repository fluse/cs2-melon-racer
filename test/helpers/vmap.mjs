// Minimal reader for Hammer's binary DMX .vmap format ("dmx encoding binary
// 9"), just enough to pull entity keyvalues out for tests — so a test can
// check that the Hammer entities a script depends on by name (point_templates,
// the particle systems they spawn, ...) actually exist and are wired up the
// way the script expects, without anyone having to open Hammer.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
 * The DMX elements of a .vmap and, one array per placed prefab instance, of
 * every prefab it references (CMapPrefab, e.g. maps/prefabs/hub.vmap) —
 * Hammer keeps a prefab's entities in its own file, only merging them in at
 * compile time. A prefab placed twice is read twice. Keyvalues bound to a
 * prefab variable (Map Variables, e.g. the start gate's trigger name) are
 * resolved the way Hammer compiles them: the instance's override, else the
 * variable's default. Element refs (`{ elem }`) point into the same array.
 * @param {string} path
 * @param {Record<string, string>} [overrides] variable values set on the prefab instance
 * @param {string[]} [stack] prefab files being read, to stop on a cycle
 * @returns {Array<ReturnType<typeof ReadDmxElements>>}
 */
function ReadVmapWithPrefabs(path, overrides = {}, stack = []) {
    const normalized = resolve(path).replace(/\\/g, "/");
    if (stack.includes(normalized)) {
        return [];
    }
    const elements = ResolveVariables(ReadDmxElementsCached(normalized), overrides);
    const files = [elements];
    // targetMapPath is relative to the addon's content root ("maps/prefabs/hub.vmap").
    const root = normalized.slice(0, normalized.lastIndexOf("/maps/"));
    for (const e of elements) {
        if (e.type === "CMapPrefab" && typeof e.attrs.targetMapPath === "string" && e.attrs.targetMapPath) {
            const names = e.attrs.variableOverrideNames ?? [];
            const values = e.attrs.variableOverrideValues ?? [];
            const childOverrides = Object.fromEntries(names.map((name, i) => [name, values[i]]));
            files.push(...ReadVmapWithPrefabs(join(root, e.attrs.targetMapPath), childOverrides, [...stack, normalized]));
        }
    }
    return files;
}

/**
 * Every prefab instance placed in a .vmap or, nested, in the prefabs it
 * references — with the file it's placed in (relative to the addon's
 * content root) and its CMapPrefab attributes (targetMapPath,
 * fixupEntityNames, variableOverrideNames, ...).
 * @param {string} path
 * @param {string[]} [stack] prefab files being read, to stop on a cycle
 * @returns {Array<{ placedIn: string, attrs: Record<string, any> }>}
 */
export function ReadVmapPrefabs(path, stack = []) {
    const normalized = resolve(path).replace(/\\/g, "/");
    if (stack.includes(normalized)) {
        return [];
    }
    const root = normalized.slice(0, normalized.lastIndexOf("/maps/"));
    const placedIn = normalized.slice(root.length + 1);
    const result = [];
    for (const e of ReadDmxElementsCached(normalized)) {
        if (e.type === "CMapPrefab" && typeof e.attrs.targetMapPath === "string" && e.attrs.targetMapPath) {
            result.push({ placedIn, attrs: e.attrs });
            result.push(...ReadVmapPrefabs(join(root, e.attrs.targetMapPath), [...stack, normalized]));
        }
    }
    return result;
}

/** @type {Map<string, ReturnType<typeof ReadDmxElements>>} */
const dmxCache = new Map();
/** @param {string} path */
function ReadDmxElementsCached(path) {
    if (!dmxCache.has(path)) {
        dmxCache.set(path, ReadDmxElements(path));
    }
    return /** @type {ReturnType<typeof ReadDmxElements>} */ (dmxCache.get(path));
}

/**
 * `elements` with every entity keyvalue that's bound to a map variable
 * (CMapEntity variableTargetKeys/variableNames) set to that variable's
 * value: `overrides`, else its default in the file's CMapVariableSet. Bound
 * entities' keyvalue elements are copied, so the cached file stays as read.
 * @param {ReturnType<typeof ReadDmxElements>} elements
 * @param {Record<string, string>} overrides
 */
function ResolveVariables(elements, overrides) {
    /** @type {Record<string, string>} */
    const values = {};
    for (const e of elements) {
        if (e.type === "CMapVariableSet") {
            (e.attrs.variableNames ?? []).forEach((name, i) => { values[name] = e.attrs.variableValues?.[i] ?? ""; });
        }
    }
    Object.assign(values, overrides);
    const resolved = [...elements];
    for (const e of elements) {
        const keys = e.type === "CMapEntity" ? e.attrs.variableTargetKeys ?? [] : [];
        const ref = e.attrs.entity_properties?.elem;
        if (keys.length === 0 || resolved[ref] === undefined) {
            continue;
        }
        const props = { ...resolved[ref], attrs: { ...resolved[ref].attrs } };
        keys.forEach((key, i) => {
            const name = e.attrs.variableNames?.[i];
            if (name in values) {
                props.attrs[key] = values[name];
            }
        });
        resolved[ref] = props;
    }
    return resolved;
}

/**
 * Every entity's keyvalues (classname, targetname, ...) in a .vmap —
 * including ones inside instances collapsed into it and referenced prefabs.
 * @param {string} path
 * @returns {Array<Record<string, any>>}
 */
export function ReadVmapEntities(path) {
    return ReadVmapWithPrefabs(path).flat()
        .filter((e) => e.type === "EditGameClassProps" && typeof e.attrs.classname === "string")
        .map((e) => e.attrs);
}

/**
 * Every entity's Hammer I/O connections (its Outputs tab), e.g. a trigger's
 * OnStartTouch -> melon_drive_script RunScriptInput "hub_enter".
 * @param {string} path
 * @returns {Array<{ classname: string, targetname: string, origin: number[] | undefined, output: string, target: string, input: string, param: string }>}
 */
export function ReadVmapConnections(path) {
    const result = [];
    for (const elements of ReadVmapWithPrefabs(path)) {
        for (const e of elements) {
            if (e.type !== "CMapEntity") {
                continue;
            }
            const props = elements[e.attrs.entity_properties?.elem]?.attrs ?? {};
            for (const ref of e.attrs.connectionsData ?? []) {
                const c = elements[ref.elem]?.attrs;
                if (!c) {
                    continue;
                }
                result.push({
                    classname: props.classname,
                    targetname: props.targetname ?? "",
                    origin: e.attrs.origin,
                    output: c.outputName,
                    target: c.targetName,
                    input: c.inputName,
                    param: c.overrideParam ?? "",
                });
            }
        }
    }
    return result;
}
