// Generates the hub window's route icons — `node tools/make-route-icons.mjs`:
// one picture per track, panorama/images/custom_game/routes/route_<trackId>.png,
// an icon that fits the route's name, in a racing look (slanted, speed
// lines) — an aqueduct for "Canals", a truss bridge for "Bridge", a melon
// wedge for "Side Slice", a checkered flag for any
// other (ROUTE_ICONS below: add a keyword and shapes for a new one). Also
// writes the route names (src/melon_drive/hud/hub-modal/routes.js), taken
// from the route prefab's file name in maps/melon_racer.vmap:
// "route_side_slice" -> "Side Slice". Re-run after adding or renaming a
// route; track ids without a track get an empty frame (the layout has a
// card for every id up to MAX_TRACKS). Icons are signed-distance shapes
// (negative inside) on a 100x100 grid, y down, like tools/make-icons.mjs.
// No dependencies.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EncodePng } from "./png.mjs";
import { ReadVmapEntityOrigins } from "../test/helpers/vmap.mjs";
import { START_TRIGGER_NAME_PATTERN, MAX_TRACKS } from "../src/melon_drive/constants/index.js";

const MAP = fileURLToPath(new URL("../maps/melon_racer.vmap", import.meta.url));
const OUT_DIR = new URL("../panorama/images/custom_game/routes/", import.meta.url);
const NAMES_FILE = new URL("../src/melon_drive/hud/hub-modal/routes.js", import.meta.url);

// The picture fills the card's image box (.HeatMapBox in speedometer.css);
// the icon's 100x100 grid sits centered in it at ICON_SIZE px.
const WIDTH = 320;
const HEIGHT = 176;
const ICON_SIZE = 150;
const SUPERSAMPLE = 4;

// --- shapes: each returns (x, y) => signed distance (negative inside) ---

const len = (x, y) => Math.hypot(x, y);
const union = (...shapes) => (x, y) => Math.min(...shapes.map((s) => s(x, y)));
const intersect = (...shapes) => (x, y) => Math.max(...shapes.map((s) => s(x, y)));
const cut = (shape, hole) => (x, y) => Math.max(shape(x, y), -hole(x, y));

/** Filled circle. */
const circle = (cx, cy, r) => (x, y) => len(x - cx, y - cy) - r;
/** Everything below the line y = y0. */
const below = (y0) => (x, y) => y0 - y;

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

// --- colors ---

const WATER = [74, 163, 216];
const WATER_LIGHT = [140, 205, 240];
const STONE = [235, 232, 220];
const STONE_DARK = [170, 165, 150];
const LIME = [127, 209, 59];
const RIND = [58, 143, 58];
const RIND_LIGHT = [207, 232, 168];
const FLESH = [255, 90, 95];
const SEED = [30, 24, 24];
const WHITE = [255, 255, 255];
const DARK = [20, 24, 20];

/** Filled polygon (even-odd), corners in order. */
const polygon = (...pts) => (x, y) => {
    let d = Infinity, inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[j], [bx, by] = pts[i];
        d = Math.min(d, line(ax, ay, bx, by, 0)(x, y));
        if ((by > y) !== (ay > y) && x < ((ax - bx) * (y - by)) / (ay - by) + bx) inside = !inside;
    }
    return inside ? -d : d;
};

// --- icons: layers painted in order, [shape, color] ---
// Racing look: hard corners, and DrawIcon leans every icon forward
// (SLANT) with speed lines trailing behind it.

/**
 * Canals: a Roman aqueduct — two tiers of stone arches, small ones above
 * big ones, carrying a water channel along its top.
 */
const CANALS = (() => {
    /** An arched opening `w` wide from y0 (top of the arch) down to y1. */
    const Arch = (cx, y0, y1, w) => union(circle(cx, y0 + w / 2, w / 2), rect(cx - w / 2, y0 + w / 2, cx + w / 2, y1));
    const upperArches = union(...[15, 29, 43, 57, 71, 85].map((x) => Arch(x, 38, 56, 9)));
    const lowerArches = union(...[22, 50, 78].map((x) => Arch(x, 60, 92, 18)));
    const body = cut(cut(rect(6, 30, 94, 92), upperArches), lowerArches);
    const ledges = union(rect(3, 55, 97, 60), rect(3, 30, 97, 35));
    return [
        [body, STONE_DARK],
        [ledges, STONE],
        [rect(6, 22, 94, 30), WATER],
        [line(12, 25.5, 32, 25.5, 0.9), WATER_LIGHT],
        [line(50, 25.5, 66, 25.5, 0.9), WATER_LIGHT],
    ];
})();

/** Bridge: a steel truss bridge — zigzag web under a straight top chord — on two piers. */
const BRIDGE = (() => {
    const [top, bottom] = [32, 60];
    const joints = [12, 24, 36, 50, 64, 76, 88];
    const web = union(...joints.slice(1).map((x, i) => (i % 2 === 0 ? line(joints[i], bottom, x, top, 2.2) : line(joints[i], top, x, bottom, 2.2))));
    const chords = union(line(12, top, 88, top, 2.6), line(2, bottom, 12, top, 2.6), line(98, bottom, 88, top, 2.6));
    const deck = rect(0, 58, 100, 66);
    const piers = union(polygon([14, 66], [24, 66], [22, 90], [16, 90]), polygon([76, 66], [86, 66], [84, 90], [78, 90]));
    const water = union(line(4, 86, 30, 86, 1.8), line(36, 86, 64, 86, 1.8), line(70, 86, 96, 86, 1.8), line(14, 93, 40, 93, 1.4), line(56, 93, 86, 93, 1.4));
    return [
        [water, WATER],
        [piers, STONE_DARK],
        [web, LIME],
        [chords, LIME],
        [deck, STONE],
    ];
})();

/** Side Slice: a sharp watermelon wedge, rind along the top. */
const SLICE = (() => {
    const wedge = polygon([6, 18], [94, 18], [50, 94]);
    const flesh = polygon([15, 30], [85, 30], [50, 84]);
    const seeds = union(...[[36, 40], [50, 40], [64, 40], [43, 52], [57, 52], [50, 64]].map(([x, y]) => polygon([x - 2.2, y - 3], [x + 2.2, y - 3], [x, y + 3.5])));
    return [
        [wedge, RIND],
        [intersect(wedge, below(26)), RIND_LIGHT],
        [flesh, FLESH],
        [seeds, SEED],
    ];
})();

/** Any other route: a checkered flag on a pole. */
const FLAG = (() => {
    const cloth = rect(30, 20, 82, 56);
    let black = (x, y) => 1;
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
            if ((row + col) % 2 === 0) {
                black = union(black, rect(30 + col * 13, 20 + row * 12, 43 + col * 13, 32 + row * 12));
            }
        }
    }
    return [
        [rect(23, 16, 29, 90), STONE],
        [cloth, WHITE],
        [intersect(black, cloth), DARK],
    ];
})();

/** Which icon a route gets, by a keyword in its name; the last one matches everything. */
const ROUTE_ICONS = [
    [/canal/i, CANALS],
    [/bridge/i, BRIDGE],
    [/slice/i, SLICE],
    [/./, FLAG],
];

// How far every icon leans forward (x shift per unit up), and the speed
// lines behind it (grid units: y, from x, to x — left of the icon).
const SLANT = 0.22;
const SPEED_LINES = [
    [34, -30, -8],
    [50, -44, -8],
    [66, -24, -8],
];

// --- rasterize ---

/** Paints `color` over `under` ([r, g, b, a]) with coverage `alpha` (0..1). */
function Over(under, color, alpha) {
    const outA = alpha + (under[3] / 255) * (1 - alpha);
    if (outA <= 0) {
        return [0, 0, 0, 0];
    }
    const mix = (i) => (color[i] * alpha + under[i] * (under[3] / 255) * (1 - alpha)) / outA;
    return [mix(0), mix(1), mix(2), outA * 255];
}

/** @param {Array<[(x: number, y: number) => number, number[]]>} layers */
function DrawIcon(layers) {
    const speed = union(...SPEED_LINES.map(([y, x0, x1]) => rect(x0, y - 2, x1, y + 2)));
    const all = [[speed, LIME], ...layers];
    const scale = 100 / ICON_SIZE;
    // A bit right of center, leaving room for the speed lines.
    const [ox, oy] = [(WIDTH - ICON_SIZE) / 2 + 18, (HEIGHT - ICON_SIZE) / 2];
    return EncodePng(WIDTH, HEIGHT, (px, py) => {
        let out = [0, 0, 0, 0];
        for (const [shape, color] of all) {
            let inside = 0;
            for (let sy = 0; sy < SUPERSAMPLE; sy++) {
                for (let sx = 0; sx < SUPERSAMPLE; sx++) {
                    const y = (py - oy + (sy + 0.5) / SUPERSAMPLE) * scale;
                    // Leaning forward: the higher, the further right.
                    const x = (px - ox + (sx + 0.5) / SUPERSAMPLE) * scale - (50 - y) * SLANT;
                    if (shape(x, y) < 0) {
                        inside++;
                    }
                }
            }
            if (inside > 0) {
                out = Over(out, color, inside / (SUPERSAMPLE * SUPERSAMPLE));
            }
        }
        return out.map(Math.round);
    });
}

/** An empty frame for a track id that has no track. */
function DrawEmpty() {
    return EncodePng(WIDTH, HEIGHT, (x, y) => {
        const edge = Math.min(x, y, WIDTH - 1 - x, HEIGHT - 1 - y);
        const dash = Math.floor((x + y) / 8) % 2 === 0;
        return edge === 6 && dash ? [255, 255, 255, 60] : [0, 0, 0, 0];
    });
}

// --- the tracks and their names ---

/** @param {string} file "maps/prefabs/route_side_slice.vmap" -> "Side Slice" */
const RouteTitle = (file) =>
    file.replace(/^.*\/route_/, "").replace(/\.vmap$/, "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** @type {Map<number, string>} track id -> route name */
const tracks = new Map();
for (const e of ReadVmapEntityOrigins(MAP)) {
    const m = START_TRIGGER_NAME_PATTERN.exec(String(e.targetname ?? ""));
    if (m && e.classname === "trigger_multiple") {
        const routeFile = e.files.find((/** @type {string} */ f) => /\/route_[^/]*\.vmap$/.test(f));
        tracks.set(Number(m[1]), routeFile ? RouteTitle(routeFile) : `Route ${m[1]}`);
    }
}

mkdirSync(OUT_DIR, { recursive: true });
for (let id = 1; id <= MAX_TRACKS; id++) {
    const name = tracks.get(id);
    const icon = name && ROUTE_ICONS.find(([keyword]) => keyword.test(name))[1];
    writeFileSync(new URL(`route_${id}.png`, OUT_DIR), icon ? DrawIcon(icon) : DrawEmpty());
    console.log(`wrote panorama/images/custom_game/routes/route_${id}.png${name ? ` — ${name}` : " (no track)"}`);
}
writeFileSync(
    NAMES_FILE,
    `// AUTO-GENERATED by tools/make-route-icons.mjs from the route prefabs' file
// names — re-run it after adding or renaming a route, don't hand-edit.
// Track id -> the name the hub window shows for it.
/** @type {Record<number, string>} */
export const ROUTE_NAMES = ${JSON.stringify(Object.fromEntries(tracks), null, 4).replace(/"(\d+)":/g, "$1:")};
`,
);
console.log("wrote src/melon_drive/hud/hub-modal/routes.js");
