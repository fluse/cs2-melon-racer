// Shared by the map generators in tools/maps/: writes a Hammer .vmap (a
// prefab) from script — entities with their keyvalues and outputs, box and
// polygon meshes (world geometry or a brush entity's, e.g. a trigger), and
// placed prefabs with their map-variable overrides. The file is written as
// keyvalues2 text DMX, the layout Hammer itself saves (read off its own
// files with dmxconvert -oe keyvalues2), then converted to Hammer's binary
// encoding with the game's dmxconvert.exe. Coordinates are Source units, Z up.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ADDON_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DMXCONVERT = fileURLToPath(new URL("../../../../../game/bin/win64/dmxconvert.exe", import.meta.url));

export const TRIGGER_MATERIAL = "materials/tools/toolstrigger.vmat";
// The spawnflags Hammer saves on the addon's melon triggers (refill_jumps.vmap's).
export const TRIGGER_SPAWNFLAGS = "4105";
export const SCRIPT_ENTITY = "melon_drive_script";

/** A writer for one .vmap: ids are deterministic per `seed`, so re-running changes only what changed. */
export class Vmap {
    /** @param {string} seed e.g. the file's path */
    constructor(seed) {
        this.seed = seed;
        this.count = 0;
        this.nodeId = 1; // the world is node 1
        /** @type {string[]} */
        this.children = [];
        /** @type {Set<string>} every asset referenced, for the file's asset list */
        this.assets = new Set();
        /** @type {Map<string, number>} entity class -> count */
        this.classes = new Map();
    }

    Hash(kind) {
        return createHash("md5").update(`${this.seed}:${kind}:${this.count++}`).digest("hex");
    }

    Id() {
        const h = this.Hash("id");
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
    }

    ReferenceId() {
        return `0x${this.Hash("ref").slice(0, 16)}`;
    }

    Seed() {
        return parseInt(this.Hash("seed").slice(0, 7), 16);
    }

    /** The attributes every map node starts with. @param {string[]} children */
    NodeHead(children = [], connections = []) {
        return [
            Attr("nodeID", "int", String(++this.nodeId)),
            Attr("referenceID", "uint64", this.ReferenceId()),
            ElementArray("children", children),
            Arr("variableTargetKeys", "string_array", []),
            Arr("variableNames", "string_array", []),
            Element("relayPlugData", "DmePlugList", this.Id(), [
                Arr("names", "string_array", []),
                Arr("dataTypes", "int_array", []),
                Arr("plugTypes", "int_array", []),
                Arr("descriptions", "string_array", []),
            ]),
            ElementArray("connectionsData", connections),
        ];
    }

    /** The attributes every map node ends with. */
    NodeTail(origin = [0, 0, 0], angles = [0, 0, 0], scales = [1, 1, 1]) {
        return [
            Attr("origin", "vector3", Vec(origin)),
            Attr("angles", "qangle", Vec(angles)),
            Attr("scales", "vector3", Vec(scales)),
            Attr("transformLocked", "bool", "0"),
            Element("transformPin", "DmElement", this.Id(), [
                Attr("name", "string", "transformPin"),
                Attr("referenceName", "string", ""),
                Attr("targetReferenceID", "uint64", "0x0"),
                Attr("offsetOrigin", "vector3", "0 0 0"),
                Attr("offsetAngles", "qangle", "0 0 0"),
                Attr("pinAngles", "bool", "1"),
                Attr("twoWay", "bool", "0"),
            ]),
            Attr("force_hidden", "bool", "0"),
            Attr("editorOnly", "bool", "0"),
            Attr("customVisGroup", "string", ""),
            Attr("randomSeed", "int", String(this.Seed())),
        ];
    }

    /**
     * An output: `output` → `target`'s `input` with `param`.
     * @param {{ output: string, target: string, input: string, param?: string, delay?: number, times?: number }} c
     */
    Connection({ output, target, input, param = "", delay = 0, times = -1 }) {
        return InlineElement("DmeConnectionData", this.Id(), [
            Attr("outputName", "string", output),
            Attr("targetType", "int", "7"),
            Attr("targetName", "string", target),
            Attr("inputName", "string", input),
            Attr("overrideParam", "string", param),
            Attr("delay", "float", String(delay)),
            Attr("timesToFire", "int", String(times)),
        ]);
    }

    /**
     * A point or brush entity. `meshes` (from this.Mesh) make it a brush
     * entity; they're placed in the entity's own frame.
     * @param {string} classname @param {Record<string, string | number>} props keyvalues, targetname included
     * @param {{ origin?: number[], angles?: number[], outputs?: Parameters<Vmap["Connection"]>[0][], meshes?: string[] }} [options]
     */
    Entity(classname, props, { origin = [0, 0, 0], angles = [0, 0, 0], outputs = [], meshes = [] } = {}) {
        this.classes.set(classname, (this.classes.get(classname) ?? 0) + 1);
        for (const value of Object.values(props)) {
            if (typeof value === "string" && /\.(vmdl|vmat|vpcf|vsnd)$/.test(value)) this.assets.add(value);
        }
        const text = InlineElement("CMapEntity", this.Id(), [
            ...this.NodeHead(meshes, outputs.map(c => this.Connection(c))),
            Element("entity_properties", "EditGameClassProps", this.Id(), [
                Attr("classname", "string", classname),
                ...Object.entries(props).map(([key, value]) => Attr(key, "string", String(value))),
            ]),
            Attr("hitNormal", "vector3", "0 0 1"),
            Attr("isProceduralEntity", "bool", "0"),
            ...this.NodeTail(origin, angles),
        ]);
        this.children.push(text);
        return text;
    }

    /**
     * A trigger_multiple box filtered to melons by its spawnflags, from `min`
     * to `max` (world coordinates), its origin at `origin` (default: the
     * box's middle) — a corner zone's origin goes on the corner.
     * @param {string} name @param {number[]} min @param {number[]} max
     * @param {Parameters<Vmap["Connection"]>[0][]} outputs @param {number[]} [origin]
     */
    Trigger(name, min, max, outputs, origin) {
        const o = origin ?? min.map((n, i) => (n + max[i]) / 2);
        const mesh = this.Mesh(BoxPolygons(min.map((n, i) => n - o[i]), max.map((n, i) => n - o[i]), TRIGGER_MATERIAL), o);
        return this.Entity("trigger_multiple", { targetname: name, spawnflags: TRIGGER_SPAWNFLAGS, StartDisabled: "0", wait: "1" }, {
            origin: o,
            outputs,
            meshes: [mesh],
        });
    }

    /**
     * A trigger firing `<kind>_enter`/`<kind>_leave` at the script on touch/untouch
     * (every zone trigger, docs/mapping-api/01-conventions.md).
     * @param {string} name @param {string} enter @param {string} leave @param {number[]} min @param {number[]} max @param {number[]} [origin]
     */
    ZoneTrigger(name, enter, leave, min, max, origin) {
        return this.Trigger(name, min, max, [
            { output: "OnStartTouch", target: SCRIPT_ENTITY, input: "RunScriptInput", param: enter },
            { output: "OnEndTouch", target: SCRIPT_ENTITY, input: "RunScriptInput", param: leave },
        ], origin);
    }

    /**
     * World geometry (or, passed to Entity, a brush entity's): polygons in
     * the frame of `origin`. Each face is a convex or concave loop of vertex
     * indices, counter-clockwise seen from outside, with its material.
     * @param {{ positions: number[][], faces: { loop: number[], material: string }[] }} polygons
     * @param {number[]} [origin] @param {{ world?: boolean, textureScale?: number }} [options] world: placed straight into the world, not under an entity
     */
    Mesh(polygons, origin = [0, 0, 0], { world = false, textureScale = 0.25 } = {}) {
        for (const f of polygons.faces) this.assets.add(f.material);
        const text = InlineElement("CMapMesh", this.Id(), [
            ...this.NodeHead(),
            this.PolygonMesh(polygons, origin, textureScale),
            ...this.NodeTail(origin),
            Attr("disableShadows", "int", "0"),
            Attr("bakelighting", "bool", "1"),
            Attr("cubeMapName", "string", ""),
            Attr("emissiveLightingEnabled", "bool", "1"),
            Attr("emissiveLightingBoost", "float", "1"),
            Attr("lightingDummy", "bool", "0"),
            Attr("bakeLightDoubleSided", "bool", "0"),
            Attr("steamaudioGeometryMode", "int", "0"),
            Attr("visexclude", "bool", "0"),
            Attr("disablemerging", "bool", "0"),
            Attr("renderwithdynamic", "bool", "0"),
            Attr("renderToCubemaps", "bool", "1"),
            Attr("keep_vertices", "bool", "0"),
            Attr("fademindist", "float", "-1"),
            Attr("fademaxdist", "float", "0"),
            Attr("disableHeightDisplacement", "bool", "0"),
            Attr("smoothingAngle", "float", "40"),
            Attr("tintColor", "color", "255 255 255 255"),
            Attr("renderAmt", "int", "255"),
            Attr("physicsType", "string", "default"),
            Attr("physicsCollisionProperty", "string", ""),
            Attr("physicsGroup", "string", ""),
            Attr("physicsInteractsAs", "string", ""),
            Attr("physicsInteractsWith", "string", ""),
            Attr("physicsInteractsExclude", "string", ""),
            ElementArray("physicsIncludedDetailLayers", []),
            ElementArray("physicsMissingDetailLayers", []),
            Attr("physicsSimplificationOverride", "bool", "0"),
            Attr("physicsSimplificationError", "float", "0"),
        ]);
        if (world) this.children.push(text);
        return text;
    }

    /**
     * Hammer's half-edge mesh: every edge two opposite half-edges (2k, 2k+1),
     * each pointing at its head vertex, with the next one round its face (or
     * round the hole, for an open edge) and one face-vertex data entry per
     * half-edge — the corner at its head.
     */
    PolygonMesh({ positions, faces }, origin, textureScale) {
        /** @type {number[]} */ const head = [];
        /** @type {number[]} */ const faceOf = [];
        /** @type {number[]} */ const next = [];
        const byKey = new Map();
        const faceEdge = [];
        const HalfEdge = (a, b) => {
            const key = `${a}>${b}`;
            if (byKey.has(key)) return byKey.get(key);
            const h = head.length; // a new edge: a>b and b>a
            head.push(b, a);
            faceOf.push(-1, -1);
            next.push(-1, -1);
            byKey.set(key, h);
            byKey.set(`${b}>${a}`, h + 1);
            return h;
        };
        faces.forEach((face, f) => {
            const loop = face.loop;
            const hs = loop.map((a, i) => HalfEdge(a, loop[(i + 1) % loop.length]));
            hs.forEach((h, i) => {
                if (faceOf[h] !== -1) throw new Error(`mesh: edge ${loop[i]}>${loop[(i + 1) % loop.length]} used twice the same way (face winding?)`);
                faceOf[h] = f;
                next[h] = hs[(i + 1) % hs.length];
            });
            faceEdge.push(hs[0]);
        });
        const tail = h => head[h ^ 1];
        // Open edges: round the hole, the next open half-edge starting where this one ends.
        const openFrom = new Map();
        head.forEach((_, h) => {
            if (faceOf[h] === -1) openFrom.set(tail(h), h);
        });
        head.forEach((_, h) => {
            if (faceOf[h] === -1) next[h] = openFrom.get(head[h]) ?? h;
        });
        const vertexEdge = positions.map((_, v) => {
            if (openFrom.has(v)) return openFrom.get(v);
            const h = head.findIndex((_, e) => tail(e) === v);
            if (h < 0) throw new Error(`mesh: vertex ${v} on no face`);
            return h;
        });

        // Per face: normal, world-aligned texture axes (as Hammer picks them).
        const faceInfo = faces.map(face => {
            const p = face.loop.map(i => positions[i]);
            const n = [0, 0, 0];
            for (let i = 0; i < p.length; i++) {
                const a = p[i], b = p[(i + 1) % p.length];
                n[0] += (a[1] - b[1]) * (a[2] + b[2]);
                n[1] += (a[2] - b[2]) * (a[0] + b[0]);
                n[2] += (a[0] - b[0]) * (a[1] + b[1]);
            }
            const len = Math.hypot(...n) || 1;
            const normal = n.map(x => x / len);
            const [ax, ay, az] = normal.map(Math.abs);
            let u, v;
            if (az >= ax && az >= ay) { u = [1, 0, 0]; v = [0, -1, 0]; }
            else if (ax >= ay) { u = [0, 1, 0]; v = [0, 0, -1]; }
            else { u = [1, 0, 0]; v = [0, 0, -1]; }
            const c = [normal[1] * u[2] - normal[2] * u[1], normal[2] * u[0] - normal[0] * u[2], normal[0] * u[1] - normal[1] * u[0]];
            const w = c[0] * v[0] + c[1] * v[1] + c[2] * v[2] < 0 ? -1 : 1;
            return { normal, u, v, w };
        });
        const materials = [...new Set(faces.map(f => f.material))];
        const TEXTURE_SIZE = 512; // texcoords are recomputed by Hammer from the axes on any edit
        const fvUv = [], fvNormal = [], fvTangent = [];
        head.forEach((vtx, h) => {
            const info = faceInfo[faceOf[h]] ?? faceInfo[faceOf[h ^ 1]];
            const world = positions[vtx].map((n, i) => n + origin[i]);
            const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
            fvUv.push(Vec([dot(world, info.u) / textureScale / TEXTURE_SIZE, dot(world, info.v) / textureScale / TEXTURE_SIZE]));
            fvNormal.push(Vec(info.normal));
            fvTangent.push(Vec([...info.u, info.w]));
        });
        const Stream = (name, type, dataState, data) =>
            InlineElement("CDmePolygonMeshDataStream", this.Id(), [
                Attr("name", "string", `${name}:0`),
                Attr("standardAttributeName", "string", name),
                Attr("semanticName", "string", name),
                Attr("semanticIndex", "int", "0"),
                Attr("vertexBufferLocation", "int", "0"),
                Attr("dataStateFlags", "int", String(dataState)),
                Attr("subdivisionBinding", "element", ""),
                Arr("data", type, data),
            ]);
        const DataArray = (name, size, streams) => Element(name, "CDmePolygonMeshDataArray", this.Id(), [
            Attr("size", "int", String(size)),
            ElementArray("streams", streams),
        ]);
        const edges = head.length / 2;
        return Element("meshData", "CDmePolygonMesh", this.Id(), [
            Attr("name", "string", "meshData"),
            Arr("vertexEdgeIndices", "int_array", vertexEdge),
            Arr("vertexDataIndices", "int_array", positions.map((_, i) => i)),
            Arr("edgeVertexIndices", "int_array", head),
            Arr("edgeOppositeIndices", "int_array", head.map((_, h) => h ^ 1)),
            Arr("edgeNextIndices", "int_array", next),
            Arr("edgeFaceIndices", "int_array", faceOf),
            Arr("edgeDataIndices", "int_array", head.map((_, h) => h >> 1)),
            Arr("edgeVertexDataIndices", "int_array", head.map((_, h) => h)),
            Arr("faceEdgeIndices", "int_array", faceEdge),
            Arr("faceDataIndices", "int_array", faces.map((_, f) => f)),
            Arr("materials", "string_array", materials),
            DataArray("vertexData", positions.length, [Stream("position", "vector3_array", 3, positions.map(Vec))]),
            DataArray("faceVertexData", head.length, [
                Stream("texcoord", "vector2_array", 1, fvUv),
                Stream("normal", "vector3_array", 1, fvNormal),
                Stream("tangent", "vector4_array", 1, fvTangent),
            ]),
            DataArray("edgeData", edges, [Stream("flags", "int_array", 3, Array(edges).fill(0))]),
            DataArray("faceData", faces.length, [
                Stream("textureScale", "vector2_array", 0, faces.map(() => Vec([textureScale, textureScale]))),
                Stream("textureAxisU", "vector4_array", 0, faceInfo.map(i => Vec([...i.u, 0]))),
                Stream("textureAxisV", "vector4_array", 0, faceInfo.map(i => Vec([...i.v, 0]))),
                Stream("materialindex", "int_array", 8, faces.map(f => materials.indexOf(f.material))),
                Stream("flags", "int_array", 3, faces.map(() => 0)),
                Stream("lightmapScaleBias", "int_array", 1, faces.map(() => 0)),
            ]),
            Element("subdivisionData", "CDmePolygonMeshSubdivisionData", this.Id(), [
                Arr("subdivisionLevels", "int_array", []),
                ElementArray("streams", []),
            ]),
        ]);
    }

    /**
     * A placed prefab, "Fix Up Entity Names" off (14-prefabs.md), its map
     * variables overridden by `overrides`.
     * @param {string} path e.g. "maps/prefabs/checkpoint_gate.vmap" @param {number[]} origin @param {number[]} [angles]
     * @param {Record<string, string>} [overrides]
     */
    Prefab(path, origin, angles = [0, 0, 0], overrides = {}) {
        this.assets.add(path);
        const text = InlineElement("CMapPrefab", this.Id(), [
            ...this.NodeHead(),
            Attr("target", "element", ""),
            Arr("variableOverrideNames", "string_array", Object.keys(overrides)),
            Arr("variableOverrideValues", "string_array", Object.values(overrides)),
            ...this.NodeTail(origin, angles),
            Attr("tintColor", "color", "255 255 255 255"),
            Attr("visexclude", "bool", "0"),
            Attr("targetMapPath", "string", path),
            Attr("targetName", "string", ""),
            Attr("fixupEntityNames", "bool", "0"),
            Attr("useTargetNameAsPrefix", "bool", "0"),
            Attr("loadIfNested", "bool", "1"),
            Attr("prefabRuntimeEntity", "bool", "0"),
            Attr("loadAtRuntime", "bool", "0"),
        ]);
        this.children.push(text);
        return text;
    }

    /** The whole file as keyvalues2 text. */
    Text() {
        const assets = [...this.assets].sort();
        const classes = [...this.classes.keys()].sort();
        const world = Element("world", "CMapWorld", this.Id(), [
            Attr("nodeID", "int", "1"),
            Attr("referenceID", "uint64", "0x0"),
            ElementArray("children", this.children),
            Arr("variableTargetKeys", "string_array", []),
            Arr("variableNames", "string_array", []),
            Element("relayPlugData", "DmePlugList", this.Id(), [
                Arr("names", "string_array", []),
                Arr("dataTypes", "int_array", []),
                Arr("plugTypes", "int_array", []),
                Arr("descriptions", "string_array", []),
            ]),
            ElementArray("connectionsData", []),
            Element("entity_properties", "EditGameClassProps", this.Id(), [
                Attr("classname", "string", "worldspawn"),
                Attr("targetname", "string", ""),
                Attr("skyname", "string", "sky_day01_01"),
            ]),
            Attr("nextDecalID", "int", "0"),
            Attr("fixupEntityNames", "bool", "1"),
            Attr("mapUsageType", "string", "standard"),
            ...this.NodeTail(),
        ]);
        const root = [
            Attr("isprefab", "bool", "0"),
            Attr("editorbuild", "int", "10933"),
            Attr("editorversion", "int", "400"),
            Attr("itemFile", "string", ""),
            Element("defaultcamera", "CStoredCamera", this.Id(), [
                Attr("position", "vector3", "0 -1000 1000"),
                Attr("lookat", "vector3", "0 0 0"),
            ]),
            Element("3dcameras", "CStoredCameras", this.Id(), [Attr("activecamera", "int", "-1"), ElementArray("cameras", [])]),
            world,
            Element("visbility", "CVisibilityMgr", this.Id(), [
                Attr("nodeID", "int", "0"),
                Attr("referenceID", "uint64", "0x0"),
                ElementArray("children", []),
                Arr("variableTargetKeys", "string_array", []),
                Arr("variableNames", "string_array", []),
                ElementArray("nodes", []),
                Arr("hiddenFlags", "int_array", []),
                ...this.NodeTail(),
            ]),
            Element("mapVariables", "CMapVariableSet", this.Id(), [
                Arr("variableNames", "string_array", []),
                Arr("variableValues", "string_array", []),
                Arr("variableTypeNames", "string_array", []),
                Arr("variableTypeParameters", "string_array", []),
                Arr("variableGroupNames", "string_array", []),
                ElementArray("m_ChoiceGroups", []),
                Arr("variableAndChoiceOrder", "int_array", []),
            ]),
            Element("rootSelectionSet", "CMapSelectionSet", this.Id(), [
                ElementArray("children", []),
                Attr("selectionSetName", "string", ""),
                Attr("selectionSetData", "element", ""),
            ]),
            ElementArray("m_ReferencedMeshSnapshots", []),
            Attr("m_bIsCordoning", "bool", "0"),
            Attr("m_bCordonsVisible", "bool", "0"),
            ElementArray("nodeInstanceData", []),
        ];
        return [
            "<!-- dmx encoding keyvalues2 4 format vmap 40 -->",
            Block('"$prefix_element$"', [
                Attr("id", "elementid", this.Id()),
                Arr("map_asset_references", "string_array", assets),
                Arr("map_subasset_reference_types", "string_array", classes.map(() => "entity")),
                Arr("map_subasset_reference_names", "string_array", classes),
                Arr("map_subasset_reference_counts", "int_array", classes.map(c => this.classes.get(c))),
            ]),
            Block('"CMapRootElement"', [Attr("id", "elementid", this.Id()), ...root]),
            "",
        ].join("\n");
    }

    /**
     * Writes the .vmap (relative to the addon root) in Hammer's binary
     * encoding — and, with `keepText`, the keyvalues2 text next to it as
     * <name>.kv2.vmap to read.
     * @param {string} path @param {{ keepText?: boolean }} [options]
     */
    Write(path, { keepText = false } = {}) {
        const out = ADDON_ROOT + path;
        const text = out.replace(/\.vmap$/, ".kv2.vmap");
        mkdirSync(new URL(".", `file:///${out.replace(/\\/g, "/")}`), { recursive: true });
        writeFileSync(text, this.Text());
        execFileSync(DMXCONVERT, ["-i", text, "-o", out, "-oe", "binary"], { stdio: "pipe" });
        if (!keepText) rmSync(text);
        console.log(`wrote ${path}`);
    }
}

/** The six faces of an axis-aligned box from `min` to `max`, counter-clockwise from outside. */
export function BoxPolygons(min, max, material) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const positions = [
        [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];
    const loops = [
        [4, 5, 6, 7], // top
        [0, 3, 2, 1], // bottom
        [0, 1, 5, 4], // -y
        [1, 2, 6, 5], // +x
        [2, 3, 7, 6], // +y
        [3, 0, 4, 7], // -x
    ];
    return { positions, faces: loops.map(loop => ({ loop, material: typeof material === "function" ? material(loop) : material })) };
}

// --- keyvalues2 text ---

const Indent = text => text.split("\n").map(l => (l ? `\t${l}` : l)).join("\n");
const Num = n => (Math.abs(n) < 1e-9 ? "0" : String(+(+n).toFixed(5)));
const Vec = v => v.map(Num).join(" ");

function Attr(name, type, value) {
    return `"${name}" "${type}" "${value}"`;
}

function Arr(name, type, items) {
    return `"${name}" "${type}" \n[\n${items.map(s => `\t"${s}"`).join(",\n")}\n]`;
}

function Block(head, lines) {
    return `${head}\n{\n${lines.map(Indent).join("\n")}\n}`;
}

/** A nested element as an attribute. */
function Element(name, type, id, lines) {
    return `${Block(`"${name}" "${type}"`, [Attr("id", "elementid", id), ...lines])}\n`;
}

/** An element inside an element_array. */
function InlineElement(type, id, lines) {
    return Block(`"${type}"`, [Attr("id", "elementid", id), ...lines]);
}

function ElementArray(name, items) {
    return `"${name}" "element_array" \n[\n${items.map(Indent).join(",\n")}\n]`;
}
