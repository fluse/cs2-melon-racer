// Builds Cologne's chocolate museum (Schokoladenmuseum) for the 3D skybox as
// mesh geometry for Hammer — `node tools/models/make-chocolate-museum-model.mjs`:
// the building on the tip of the Rheinauhafen, seen from the Rhine, south to
// north: the old customs house (two sandstone wings under slate hip roofs, a
// glass link between them, a brick tower and a round turret on the Rhine side),
// the low glass hall, then the new part pointing north like a ship's bow — a
// hall under a curved, ribbed glass roof, a tall white drum behind it, a white
// wall slab, the round glazed drum of floors with white bands, and the white
// prow at the tip. Kept to about TRIANGLE_BUDGET triangles: boxes, roofs and
// few-sided drums, every window, band and pane in the textures; no bottoms.
// Proportions measured off a photo from the Rhine (about 6 px a metre).
// Writes
//   models/melon_racer/chocolate_museum.dmx  for Hammer's File > Import: edit
//                                            it like any mesh
//   materials/melon_racer/chocolate_museum/chocolate_museum_<part>.vmat (+ _color.png)
// Origin: on the floor (the dock's top) in the middle of the building's length;
// along Y, the prow north (+Y), the Rhine side +X — the same way round as
// harbor_dock.dmx, whose tip it stands on. Dimensions below in metres, at the
// cathedral's and the dock's scale (UNITS_PER_METRE).
import { DmxText, Mesh, SeededRandom, V3, VmatText, WriteAddonFile } from "../lib/model.mjs";
import { EncodePng } from "../lib/png.mjs";

const UNITS_PER_METRE = 11.28; // as cologne_cathedral.dmx and harbor_dock.dmx
const TRIANGLE_BUDGET = 300;

// --- Tessellation: sides round ---
const DRUM_SIDES = 14;
const CYLINDER_SIDES = 10;
const TURRET_SIDES = 8;
const VAULT_STEPS = 4; // the curved glass roof's segments

// --- Plan, metres: x across (+ the Rhine side), y along from the south end ---
const OLD_HALF = 11; // the customs house's wings, both sides of the axis
const EAVE = 15; // their walls' top
const SOUTH_WING = { y0: 0, y1: 22, ridge: 25 };
const NORTH_WING = { y0: 30, y1: 48, ridge: 22 };
const LINK = { y0: 22, y1: 30, half: 9, top: 13 }; // the glass link between the wings
const TOWER = { x0: 8, x1: 14, y0: 16, y1: 22, top: 19, spike: 24 }; // brick, on the south wing's Rhine corner
const TURRET = { x: 11, y: 31, radius: 2.8, top: 17, spike: 21 }; // round, on the north wing's Rhine corner
const HALL = { y0: 48, y1: 62, half: 9, top: 15 }; // the low glass hall
const VAULT = { y0: 62, y1: 82, x0: -6, x1: 12, low: 8, high: 17 }; // the curved glass roof, rising from the Rhine side
const CYLINDER = { x: -5, y: 74, radius: 6.5, top: 30 }; // the tall white drum behind the vault
const SLAB = { y0: 82, y1: 85, half: 13, top: 29 }; // the white wall slab with the logo
const DRUM = { x: 1, y: 96, radius: 11.5, top: 27, floors: 5 }; // the glazed drum
const PROW = { plan: [[-10, 100], [9, 103], [6, 112], [-2, 121]], back: 24, tip: 17 }; // the white prow, its top sloping down to the tip
const LENGTH = 121; // the south end to the prow's tip

// --- Textures: [units per repeat across, up] ---
const TILES = {
    oldwall: [128, EAVE * UNITS_PER_METRE], // one repeat high: three floors under the cornice
    brick: [64, 64],
    slate: [128, 128],
    glass: [64, 64],
    drum: [128, (DRUM.top * UNITS_PER_METRE) / DRUM.floors], // one floor a repeat
    white: [128, 128],
    flat: [256, 256],
};

const NAME = "chocolate_museum";
const MATERIAL_DIR = "materials/melon_racer/chocolate_museum";
const GENERATOR = "tools/models/make-chocolate-museum-model.mjs";

const mesh = new Mesh(TILES.flat[0]);
/** Metres from the south end to units from the origin. */
const U = ([x, y, z]) => [x * UNITS_PER_METRE, (y - LENGTH / 2) * UNITS_PER_METRE, z * UNITS_PER_METRE];
const Mean = pts => V3.Scale(pts.reduce((s, p) => V3.Add(s, p), [0, 0, 0]), 1 / pts.length);

/**
 * A flat convex polygon (metres), turned to face away from `inside`; textured
 * in its own plane: across along the horizontal, up the slope, image top up
 * (texcoord v runs down the image). Repeated corners (a hip roof's ridge of
 * length 0) are dropped.
 */
function Poly(points, part, inside) {
    let pts = points.map(U).filter((p, i, all) => Math.hypot(...V3.Sub(p, all[(i + 1) % all.length])) > 1e-6);
    let n = pts.reduce((s, p, i) => V3.Add(s, V3.Cross(p, pts[(i + 1) % pts.length])), [0, 0, 0]);
    if (V3.Dot(n, V3.Sub(Mean(pts), U(inside))) < 0) { pts = pts.reverse(); n = V3.Scale(n, -1); }
    n = V3.Unit(n);
    const across = Math.abs(n[2]) > 0.99 ? [1, 0, 0] : V3.Unit(V3.Cross([0, 0, 1], n));
    const up = V3.Cross(n, across);
    const [tu, tv] = TILES[part];
    mesh.Face(pts, pts.map(p => [V3.Dot(p, across) / tu, -V3.Dot(p, up) / tv]), part);
}
/** Upright walls round a plan (counter-clockwise or not) from z0 to the top `Top([x, y])`; no bottom. */
function Walls(plan, z0, Top, part) {
    const inside = [...Mean(plan.map(([x, y]) => [x, y, 0])).slice(0, 2), z0 + 1];
    plan.forEach(([x, y], k) => {
        const [x1, y1] = plan[(k + 1) % plan.length];
        Poly([[x, y, z0], [x1, y1, z0], [x1, y1, Top([x1, y1])], [x, y, Top([x, y])]], part, inside);
    });
}
const Rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** A ring of `sides` corners round (cx, cy), radius r. */
const Ring = (cx, cy, r, sides) => Array.from({ length: sides }, (_, k) => {
    const a = (2 * Math.PI * k) / sides;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
});
/** A box of its own, no bottom; its top flat in `topPart`. */
function Block(plan, top, part, topPart = "flat") {
    mesh.NewShell();
    Walls(plan, 0, () => top, part);
    Poly(plan.map(([x, y]) => [x, y, top]), topPart, [...plan[0], 0]);
}
/** A plan's walls up to `eave` and a roof meeting in a point `tip` high over its middle. */
function Spiked(plan, eave, tip, part, roofPart) {
    mesh.NewShell();
    Walls(plan, 0, () => eave, part);
    const [cx, cy] = Mean(plan.map(([x, y]) => [x, y, 0]));
    plan.forEach(([x, y], k) => Poly([[x, y, eave], [...plan[(k + 1) % plan.length], eave], [cx, cy, tip]], roofPart, [cx, cy, eave]));
}
/** A wing: walls up to EAVE, a hip roof over it (its ridge along the longer side, the slopes all alike). */
function Wing(x0, x1, y0, y1, ridge) {
    mesh.NewShell();
    Walls(Rect(x0, x1, y0, y1), 0, () => EAVE, "oldwall");
    const inset = Math.min(x1 - x0, y1 - y0) / 2, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    const [a, b] = x1 - x0 >= y1 - y0
        ? [[x0 + inset, ym, ridge], [x1 - inset, ym, ridge]]
        : [[xm, y0 + inset, ridge], [xm, y1 - inset, ridge]];
    const [sw, se, ne, nw] = Rect(x0, x1, y0, y1).map(([x, y]) => [x, y, EAVE]);
    const inside = [xm, ym, EAVE];
    if (x1 - x0 >= y1 - y0) {
        Poly([sw, se, b, a], "slate", inside);
        Poly([nw, ne, b, a], "slate", inside);
        Poly([sw, nw, a], "slate", inside);
        Poly([se, ne, b], "slate", inside);
    } else {
        Poly([sw, nw, b, a], "slate", inside);
        Poly([se, ne, b, a], "slate", inside);
        Poly([sw, se, a], "slate", inside);
        Poly([nw, ne, b], "slate", inside);
    }
}

// --- The old customs house ---
Wing(-OLD_HALF, OLD_HALF, SOUTH_WING.y0, SOUTH_WING.y1, SOUTH_WING.ridge);
Wing(-OLD_HALF, OLD_HALF, NORTH_WING.y0, NORTH_WING.y1, NORTH_WING.ridge);
Block(Rect(-LINK.half, LINK.half, LINK.y0, LINK.y1), LINK.top, "glass");
Spiked(Rect(TOWER.x0, TOWER.x1, TOWER.y0, TOWER.y1), TOWER.top, TOWER.spike, "brick", "slate");
Spiked(Ring(TURRET.x, TURRET.y, TURRET.radius, TURRET_SIDES), TURRET.top, TURRET.spike, "brick", "slate");

// --- The glass hall ---
Block(Rect(-HALL.half, HALL.half, HALL.y0, HALL.y1), HALL.top, "glass");

// --- The curved glass roof: a quarter ellipse across, rising from the Rhine side; glass end walls, a white back ---
mesh.NewShell();
{
    const v = VAULT, ax = v.x1 - v.x0, az = v.high - v.low;
    const profile = Array.from({ length: VAULT_STEPS + 1 }, (_, k) => {
        const t = (Math.PI / 2) * (k / VAULT_STEPS);
        return [v.x0 + ax * Math.cos(t), v.low + az * Math.sin(t)]; // (x1, low) up to (x0, high)
    });
    const inside = [(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, v.low / 2];
    for (let k = 0; k < VAULT_STEPS; k++) {
        const [xa, za] = profile[k], [xb, zb] = profile[k + 1];
        Poly([[xa, v.y0, za], [xa, v.y1, za], [xb, v.y1, zb], [xb, v.y0, zb]], "glass", inside);
    }
    Poly([[v.x1, v.y0, 0], [v.x1, v.y1, 0], [v.x1, v.y1, v.low], [v.x1, v.y0, v.low]], "glass", inside); // the Rhine side
    Poly([[v.x0, v.y0, 0], [v.x0, v.y1, 0], [v.x0, v.y1, v.high], [v.x0, v.y0, v.high]], "white", inside); // the back
    for (const y of [v.y0, v.y1]) Poly([[v.x0, y, 0], [v.x1, y, 0], ...profile.map(([x, z]) => [x, y, z])], "glass", inside);
}

// --- The white drum, the wall slab, the glazed drum ---
Block(Ring(CYLINDER.x, CYLINDER.y, CYLINDER.radius, CYLINDER_SIDES), CYLINDER.top, "white");
Block(Rect(-SLAB.half, SLAB.half, SLAB.y0, SLAB.y1), SLAB.top, "white");
Block(Ring(DRUM.x, DRUM.y, DRUM.radius, DRUM_SIDES), DRUM.top, "drum");

// --- The prow: white walls, its top sloping down to the tip ---
mesh.NewShell();
{
    const y0 = PROW.plan[0][1], y1 = PROW.plan.at(-1)[1];
    const Top = ([, y]) => PROW.back + (PROW.tip - PROW.back) * ((y - y0) / (y1 - y0));
    Walls(PROW.plan, 0, Top, "white");
    Poly(PROW.plan.map(p => [...p, Top(p)]), "white", [...Mean(PROW.plan.map(([x, y]) => [x, y, 0])).slice(0, 2), 0]);
}

// --- Textures, about 1 px per unit; image y runs down ---
const random = SeededRandom(0xc0c0a);
const Clamp = c => Math.max(0, Math.min(255, Math.round(c)));
const Shade = (rgb, d) => rgb.map(c => c + d);
const Png = (w, h, Color) => EncodePng(w, h, (px, py) => [...Color(px, py).map(Clamp), 255]);
const noise = Array.from({ length: 1024 }, () => random() - 0.5);
const Noise = (px, py, amount) => noise[(px * 31 + py * 17) % 1024] * amount;

// Old wall (128 x 128 over 128 x 169 units): light sandstone, a cornice on top, three floors of two
// windows each — tall arched ones on the ground floor over a rusticated base.
const SANDSTONE = [0xb9, 0xab, 0x92];
const WINDOW = [0x2c, 0x30, 0x36];
const oldwall = Png(128, 128, (px, py) => {
    let c = Shade(SANDSTONE, Noise(px, py, 10));
    if (py < 6) return Shade(SANDSTONE, py < 2 ? 14 : py < 5 ? 4 : -28); // the cornice and its shadow
    const cell = px % 64;
    const floors = [[16, 38], [56, 78]]; // upper floors' windows, rows
    for (const [y0, y1] of floors) {
        if (cell >= 22 && cell < 42 && py >= y0 && py < y1) c = Shade(WINDOW, (cell === 32 ? 30 : 0) + (py === y0 + 8 ? 30 : 0)); // cross bars
        if (cell >= 20 && cell < 44 && py >= y1 && py < y1 + 2) c = Shade(SANDSTONE, 20); // the sill
    }
    // Ground floor: arched windows, their heads round.
    const arch = Math.hypot(cell - 32, py - 100) <= 11 && py < 100;
    if ((cell >= 21 && cell < 43 && py >= 100 && py < 122) || arch) c = Shade(WINDOW, cell === 32 ? 30 : 0);
    if (py >= 92 && py % 6 === 0) c = Shade(c, -14); // rusticated courses
    if (py >= 84 && py < 87) c = Shade(SANDSTONE, py === 84 ? 16 : -16); // the band over the ground floor
    return c;
});
// Brick (64 x 64): reddish brown courses, a small arched window, sandstone quoins at the edges.
const BRICK = [0x8a, 0x58, 0x44];
const brickShades = Array.from({ length: 128 }, () => (random() - 0.5) * 18);
const brick = Png(64, 64, (px, py) => {
    const row = Math.floor(py / 4), bx = px + (row % 2) * 4;
    let c = py % 4 === 0 || bx % 8 === 0 ? Shade(BRICK, 34) : Shade(BRICK, brickShades[(row * 9 + Math.floor(bx / 8)) % 128]);
    if (px < 5 || px >= 59) c = Shade(SANDSTONE, (Math.floor(py / 8) % 2) * -14); // quoins
    if ((px >= 26 && px < 38 && py >= 24 && py < 48) || Math.hypot(px - 32, py - 24) <= 6) c = WINDOW;
    return c;
});
// Slate (128 x 128): dark blue grey scales in rows down the slope.
const SLATE = [0x4a, 0x52, 0x5c];
const slate = Png(128, 128, (px, py) => {
    const row = Math.floor(py / 8), sx = (px + (row % 2) * 6) % 12;
    return Shade(SLATE, (py % 8 === 7 ? -16 : 0) + (sx === 0 ? -10 : 0) + noise[(row * 13 + Math.floor((px + (row % 2) * 6) / 12)) % 1024] * 14);
});
// Glass (64 x 64): pale blue grey panes, the sky's light brighter at the top, light grey mullions.
const GLASS = [0x7a, 0x8f, 0xa2];
const MULLION = [0xc4, 0xc8, 0xcc];
const glass = Png(64, 64, (px, py) => {
    if (px % 32 < 2 || py % 32 < 2) return MULLION;
    return Shade(GLASS, 16 - (py % 32) * 0.8 + noise[(Math.floor(px / 32) * 7 + Math.floor(py / 32) * 3) % 1024] * 16);
});
// Drum (128 x 64, one floor): a white floor band on top, glass under it, mullions every 16 px.
const WHITE = [0xe2, 0xe4, 0xe4];
const drum = Png(128, 64, (px, py) => {
    if (py < 10) return Shade(WHITE, py === 9 ? -30 : 0);
    if (px % 16 < 2) return MULLION;
    return Shade(GLASS, 10 - (py - 10) * 0.5);
});
// White (128 x 128): concrete and aluminium panels, faint joints.
const white = Png(128, 128, (px, py) => Shade(WHITE, (px % 64 === 0 || py % 32 === 0 ? -16 : 0) + Noise(px, py, 5)));
// Flat (128 x 128 over 256 units): flat roofs seen from above, grey gravel.
const flat = Png(128, 128, (px, py) => Shade([0x86, 0x86, 0x82], Noise(px, py, 22)));
const textures = { oldwall, brick, slate, glass, drum, white, flat };

const materials = Object.fromEntries(Object.keys(textures).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
WriteAddonFile(`models/melon_racer/${NAME}.dmx`, DmxText(mesh, NAME, materials));
for (const [part, png] of Object.entries(textures)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, png);
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, metalness: part === "glass" || part === "drum" ? 0.3 : 0 }));
}
const perPart = Object.entries(mesh.tris).map(([part, tris]) => `${part} ${tris.length}`).join(", ");
const xs = mesh.v.map(p => p[0]), ys = mesh.v.map(p => p[1]), zs = mesh.v.map(p => p[2]);
console.log(`${NAME}.dmx: ${mesh.triangleCount} triangles (budget ${TRIANGLE_BUDGET}; ${perPart}); `
    + `x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}, y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}, ${Math.max(...zs).toFixed(0)} high`);
console.log(`import: Hammer, File > Import > models/melon_racer/${NAME}.dmx (origin on the floor in the middle of its length, the prow +Y, the Rhine side +X; set it on harbor_dock's tip)`);
