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
 * Each array comes with the file it's from (relative to the addon's content
 * root) and the node IDs of the prefab instances it was placed through, from
 * the outermost map in, so a test failure can name where to look in Hammer.
 * @param {string} path
 * @param {Record<string, string>} [overrides] variable values set on the prefab instance
 * @param {string[]} [stack] prefab files being read, to stop on a cycle
 * @param {number[]} [via] node IDs of the prefab instances that placed this file
 * @returns {Array<{ file: string, via: number[], elements: ReturnType<typeof ReadDmxElements> }>}
 */
function ReadVmapWithPrefabs(path, overrides = {}, stack = [], via = []) {
    const normalized = resolve(path).replace(/\\/g, "/");
    if (stack.includes(normalized)) {
        return [];
    }
    const elements = ResolveVariables(ReadDmxElementsCached(normalized), overrides);
    // targetMapPath is relative to the addon's content root ("maps/prefabs/hub.vmap").
    const root = normalized.slice(0, normalized.lastIndexOf("/maps/"));
    const files = [{ file: normalized.slice(root.length + 1), via, elements }];
    for (const e of elements) {
        if (e.type === "CMapPrefab" && typeof e.attrs.targetMapPath === "string" && e.attrs.targetMapPath) {
            const names = e.attrs.variableOverrideNames ?? [];
            const values = e.attrs.variableOverrideValues ?? [];
            const childOverrides = Object.fromEntries(names.map((name, i) => [name, values[i]]));
            files.push(...ReadVmapWithPrefabs(join(root, e.attrs.targetMapPath), childOverrides, [...stack, normalized], [...via, e.attrs.nodeID]));
        }
    }
    return files;
}

/**
 * Where a node sits, for a test failure message: "node 2797" in the map
 * itself, or "node 12 in maps/prefabs/hub.vmap, prefab node 3558" for one
 * inside a prefab (nested prefabs: "prefab node 3558 › 40", outermost first).
 * @param {number | undefined} nodeID
 * @param {string} file
 * @param {number[]} via
 */
function NodeLocation(nodeID, file, via) {
    const node = `node ${nodeID ?? "?"}`;
    return via.length === 0 ? node : `${node} in ${file}, prefab node ${via.join(" › ")}`;
}

/**
 * Every prefab instance placed in a .vmap or, nested, in the prefabs it
 * references — with the file it's placed in (relative to the addon's
 * content root), its node (`NodeLocation`) and its CMapPrefab attributes
 * (targetMapPath, fixupEntityNames, variableOverrideNames, ...).
 * @param {string} path
 * @param {string[]} [stack] prefab files being read, to stop on a cycle
 * @param {number[]} [via] node IDs of the prefab instances that placed this file
 * @returns {Array<{ placedIn: string, node: string, attrs: Record<string, any> }>}
 */
export function ReadVmapPrefabs(path, stack = [], via = []) {
    const normalized = resolve(path).replace(/\\/g, "/");
    if (stack.includes(normalized)) {
        return [];
    }
    const root = normalized.slice(0, normalized.lastIndexOf("/maps/"));
    const placedIn = normalized.slice(root.length + 1);
    const result = [];
    for (const e of ReadDmxElementsCached(normalized)) {
        if (e.type === "CMapPrefab" && typeof e.attrs.targetMapPath === "string" && e.attrs.targetMapPath) {
            result.push({ placedIn, node: NodeLocation(e.attrs.nodeID, placedIn, via), attrs: e.attrs });
            result.push(...ReadVmapPrefabs(join(root, e.attrs.targetMapPath), [...stack, normalized], [...via, e.attrs.nodeID]));
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
 * including ones inside instances collapsed into it and referenced prefabs —
 * plus `node`, where it sits in Hammer (`NodeLocation`; "node ?" for the
 * world's own keyvalues, which have no entity node).
 * @param {string} path
 * @returns {Array<Record<string, any>>}
 */
export function ReadVmapEntities(path) {
    return ReadVmapWithPrefabs(path).flatMap(({ file, via, elements }) => {
        /** @type {Map<number, number>} keyvalues element index -> its entity's node ID */
        const owners = new Map();
        for (const e of elements) {
            if (e.type === "CMapEntity" && e.attrs.entity_properties) {
                owners.set(e.attrs.entity_properties.elem, e.attrs.nodeID);
            }
        }
        return elements
            .map((e, index) => ({ e, index }))
            .filter(({ e }) => e.type === "EditGameClassProps" && typeof e.attrs.classname === "string")
            .map(({ e, index }) => ({ ...e.attrs, node: NodeLocation(owners.get(index), file, via) }));
    });
}

/**
 * Every entity's Hammer I/O connections (its Outputs tab), e.g. a trigger's
 * OnStartTouch -> melon_drive_script RunScriptInput "hub_enter".
 * @param {string} path
 * @returns {Array<{ classname: string, targetname: string, origin: number[] | undefined, node: string, output: string, target: string, input: string, param: string }>}
 */
export function ReadVmapConnections(path) {
    const result = [];
    for (const { file, via, elements } of ReadVmapWithPrefabs(path)) {
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
                    node: NodeLocation(e.attrs.nodeID, file, via),
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

// --- world positions ---------------------------------------------------
// Hammer stores each node's origin/angles/scales relative to its parent
// (group, entity, prefab instance), so a world position is the chain of
// those transforms down from the map's CMapWorld. Angles are Source's
// [pitch, yaw, roll]. Instances (CMapInstance) are followed into their
// target group with the instance's transform on top.

/** @param {number[]} angles [pitch, yaw, roll] in degrees @returns {number[][]} rotation matrix */
function RotationMatrix([pitch, yaw, roll]) {
    const [p, y, r] = [pitch, yaw, roll].map((d) => (d * Math.PI) / 180);
    const [cp, sp, cy, sy, cr, sr] = [Math.cos(p), Math.sin(p), Math.cos(y), Math.sin(y), Math.cos(r), Math.sin(r)];
    return [
        [cp * cy, sr * sp * cy - cr * sy, cr * sp * cy + sr * sy],
        [cp * sy, sr * sp * sy + cr * cy, cr * sp * sy - sr * cy],
        [-sp, sr * cp, cr * cp],
    ];
}

/** @typedef {{ origin: number[], rotation: number[][], scale: number[] }} Transform */
const IDENTITY = { origin: [0, 0, 0], rotation: RotationMatrix([0, 0, 0]), scale: [1, 1, 1] };

/** `point` (local to `t`) in the space `t` lives in. @param {Transform} t @param {number[]} point */
function Apply(t, point) {
    const s = point.map((v, i) => v * t.scale[i]);
    return t.origin.map((o, i) => o + t.rotation[i][0] * s[0] + t.rotation[i][1] * s[1] + t.rotation[i][2] * s[2]);
}

/** A child node's transform, given its parent's. @param {Transform} parent @param {Record<string, any>} attrs */
function Child(parent, attrs) {
    const local = RotationMatrix(attrs.angles ?? [0, 0, 0]);
    return {
        origin: Apply(parent, attrs.origin ?? [0, 0, 0]),
        rotation: parent.rotation.map((row) => [0, 1, 2].map((j) => row[0] * local[0][j] + row[1] * local[1][j] + row[2] * local[2][j])),
        scale: parent.scale.map((v, i) => v * (attrs.scales ?? [1, 1, 1])[i]),
    };
}

/**
 * Walks a .vmap's node tree (prefabs included, their map variables resolved)
 * with each node's world transform: `onEntity` for every entity (its
 * keyvalues). `files` is the chain of .vmap files the node sits in,
 * outermost first.
 * @param {string} path
 * @param {(kv: Record<string, any>, t: Transform, files: string[]) => void} onEntity
 */
function WalkVmap(path, onEntity) {
    /** @param {string} file absolute @param {Record<string, string>} overrides @param {Transform} transform @param {string[]} files */
    const ReadFile = (file, overrides, transform, files) => {
        const normalized = resolve(file).replace(/\\/g, "/");
        const root = normalized.slice(0, normalized.lastIndexOf("/maps/"));
        const relative = normalized.slice(root.length + 1);
        if (files.includes(relative)) {
            return;
        }
        const chain = [...files, relative];
        const elements = ResolveVariables(ReadDmxElementsCached(normalized), overrides);
        /** @param {number} index @param {Transform} parent */
        const Visit = (index, parent) => {
            const e = elements[index];
            if (!e) {
                return;
            }
            if (e.type === "CMapPrefab") {
                const names = e.attrs.variableOverrideNames ?? [];
                const values = e.attrs.variableOverrideValues ?? [];
                if (typeof e.attrs.targetMapPath === "string" && e.attrs.targetMapPath) {
                    ReadFile(join(root, e.attrs.targetMapPath), Object.fromEntries(names.map((n, i) => [n, values[i]])), Child(parent, e.attrs), chain);
                }
                return;
            }
            if (e.type === "CMapInstance") {
                Visit(e.attrs.target?.elem, Child(parent, e.attrs));
                return;
            }
            const own = e.type === "CMapGroup" || e.type === "CMapEntity" ? Child(parent, e.attrs) : parent;
            if (e.type === "CMapEntity") {
                const kv = elements[e.attrs.entity_properties?.elem]?.attrs;
                if (kv && typeof kv.classname === "string") {
                    onEntity(kv, own, chain);
                }
            }
            for (const child of e.attrs.children ?? []) {
                Visit(child.elem ?? child, own);
            }
        };
        const world = elements.find((e) => e.type === "CMapWorld");
        for (const child of world?.attrs.children ?? []) {
            Visit(child.elem ?? child, transform);
        }
    };
    ReadFile(path, {}, IDENTITY, []);
}

/**
 * Every entity in a .vmap (prefabs included, their map variables resolved,
 * like ReadVmapEntities) with its world position: its keyvalues plus
 * `origin` ([x, y, z]) and `files`, the chain of .vmap files it sits in,
 * outermost first ("maps/melon_racer.vmap", "maps/prefabs/route_canals.vmap", …).
 * @param {string} path
 * @returns {Array<Record<string, any> & { origin: number[], files: string[] }>}
 */
export function ReadVmapEntityOrigins(path) {
    /** @type {Array<Record<string, any> & { origin: number[], files: string[] }>} */
    const result = [];
    WalkVmap(path, (kv, t, files) => result.push({ ...kv, origin: t.origin, files }));
    return result;
}
