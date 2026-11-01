// Generates kicker ramps to place by hand — `node tools/models/make-kicker-model.mjs`:
// small ramps that throw a melon up onto a step or over a gap without losing
// its speed. Each is its own prop_static, flat-shaded, in a different look so
// a row of them doesn't repeat:
//   kicker_planks  planks across a timber frame, two shades, steel plates at toe and lip (128 x 112, 48 high)
//   kicker_steel   a steel plate between yellow side plates, hazard stripes along the lip (128 x 96, 40 high)
//   kicker_board   an improvised one: a board leaning on a crate, a barrel beside it (112 x 56, 36 high)
//   kicker_rock    a tilted rock slab with rough broken sides (144 x 128, 48 high; rock tinted per prop),
//                  small glowing green chevrons in a row on its driving surface pointing up the ramp (the addon's shared materials/glowgreen.vmat)
// Writes models/melon_racer/kicker/kicker_<variant>.{obj,vmdl} (+ _physics.obj:
// the plain wedge, no planks, gaps or stripes) and
// materials/melon_racer/kicker/kicker_<part>.vmat (+ _color.png).
// Origin on the floor in the middle of the high end (the lip): the ramp runs
// back along -X and rises towards +X — put the origin on a step's edge, yaw
// the way the melon drives. Scale only uniformly (keeps the slope).
//
// Jump physics (src/melon_drive): at MAX_SPEED 650 a 48 high, ~21 degree kicker
// throws the melon ~230 u/s up — over a 96 gap onto a +64 step with ~10 to
// spare; a jump off its lip (JUMP_SPEED 370 from 48 up) clears much more.
import { Circle, Mesh, ObjText, SeededRandom, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

const PLANKS = { length: 128, width: 112, height: 48, plank: 14, gap: 1.5, deck: 2.5, cheek: 5, plate: 10 };
const STEEL = { length: 128, width: 96, height: 40, side: 5, deck: 3, hazard: 24, stripe: 8 };
const BOARD = { length: 112, width: 56, height: 36, board: 3, crate: 28, crateWidth: 64, slat: 4, barrel: 13, barrelHeight: 38 };
const ROCK = { length: 144, width: 128, height: 48, points: 5, flare: [8, 22], seed: 11 };
// Small chevrons on the rock slab's top, pointing up the ramp (+X), in a row down its middle: `count` of
// them `spacing` apart, the first tip `first` from the lip; each `width` across, `depth` from its tip
// back to its wings' ends, its arms `stroke` thick (along X); `lift` off the surface. Not in the collision.
const ROCK_ARROWS = { count: 3, spacing: 26, first: 30, width: 24, depth: 12, stroke: 5, lift: 0.25 };

// --- tessellation ---
const BARREL_SIDES = 10;
const PHYSICS_BARREL_SIDES = 6;

const COLORS = {
    wood: [0xa0, 0x76, 0x48],
    wood_dark: [0x7a, 0x55, 0x30],
    frame: [0x5a, 0x3e, 0x24], // the timber frame and cheeks, crate slats
    steel: [0x8c, 0x92, 0x9a],
    dark: [0x2b, 0x30, 0x38], // graphite: hazard stripes, barrel ends, the steel kicker's back
    yellow: [0xf0, 0xb8, 0x24],
    red: [0xd8, 0x34, 0x2a], // the barrel
    rock: [0x7d, 0x78, 0x70],
    rock_top: [0xa8, 0x9f, 0x8e], // the rock slab's driving surface
};
const MATERIAL_OPTIONS = { steel: { metalness: 0.6 }, rock: { tint: 1 }, rock_top: { tint: 1 } };
// Parts in one of the addon's shared materials (materials/*.vmat), not written here.
const SHARED_MATERIALS = { arrow: "materials/glowgreen.vmat" };

const NAME = "kicker";
const MODEL_DIR = `models/melon_racer/${NAME}`;
const MATERIAL_DIR = `materials/melon_racer/${NAME}`;
const GENERATOR = "tools/models/make-kicker-model.mjs";

/** A flat polygon (3D points), turned to face `out`; UVs projected from the world. Repeated points are dropped, a sliver skipped. */
function Poly(mesh, points, out, part) {
    points = points.filter((p, i) => V3.Dot(V3.Sub(p, points[(i + 1) % points.length]), V3.Sub(p, points[(i + 1) % points.length])) > 1e-6);
    if (points.length < 3) return;
    const n = points.reduce((s, p, i) => V3.Add(s, V3.Cross(p, points[(i + 1) % points.length])), [0, 0, 0]);
    if (Math.hypot(...n) < 1e-6) return;
    if (V3.Dot(n, out) < 0) points = [...points].reverse();
    const u = V3.Unit(n), across = Math.abs(u[2]) > 0.7 ? null : V3.Unit(V3.Cross([0, 0, 1], u));
    mesh.Face(points, points.map(p => (across ? [V3.Dot(p, across) / 64, p[2] / 64] : [p[0] / 64, p[1] / 64])), part);
}
/** A solid from x0 to x1, y0 to y1: its bottom at zb (or [at x0, at x1]), its top a plane from zt0 (at x0) to zt1 (at x1); the top its own part. */
function Slab(mesh, x0, x1, y0, y1, zb, zt0, zt1, part, topPart = part) {
    [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)];
    const [zb0, zb1] = Array.isArray(zb) ? zb : [zb, zb];
    const B = (x, y) => [x, y, x === x0 ? zb0 : zb1], T = (x, y) => [x, y, x === x0 ? zt0 : zt1];
    Poly(mesh, [T(x0, y0), T(x1, y0), T(x1, y1), T(x0, y1)], [0, 0, 1], topPart);
    Poly(mesh, [B(x0, y0), B(x1, y0), B(x1, y1), B(x0, y1)], [0, 0, -1], part);
    Poly(mesh, [B(x0, y0), B(x1, y0), T(x1, y0), T(x0, y0)], [0, -1, 0], part);
    Poly(mesh, [B(x0, y1), B(x1, y1), T(x1, y1), T(x0, y1)], [0, 1, 0], part);
    Poly(mesh, [B(x0, y0), B(x0, y1), T(x0, y1), T(x0, y0)], [-1, 0, 0], part);
    Poly(mesh, [B(x1, y0), B(x1, y1), T(x1, y1), T(x1, y0)], [1, 0, 0], part);
}
/** The driving surface's height at x on a kicker `length` long, `height` high (x from -length to 0). */
const Deck = (k, x) => (k.height * (x + k.length)) / k.length;
/** A kicker's collision: one wedge from the floor at its toe to its height at the lip. */
const Wedge = (mesh, k, y = k.width / 2) => Slab(mesh, -k.length, 0, -y, y, 0, 0, k.height, "wood");
/** A cylinder along Z, its ends their own part. */
function Barrel(mesh, x, y, r, z0, z1, sides, part, endPart) {
    const ring = Circle(x, y, r, sides);
    Poly(mesh, ring.map(([a, b]) => [a, b, z1]), [0, 0, 1], endPart);
    Poly(mesh, ring.map(([a, b]) => [a, b, z0]), [0, 0, -1], endPart);
    ring.forEach(([a, b], i) => {
        const [c, d] = ring[(i + 1) % sides];
        Poly(mesh, [[a, b, z0], [c, d, z0], [c, d, z1], [a, b, z1]], [(a + c) / 2 - x, (b + d) / 2 - y, 0], part);
    });
}

function Planks(physics) {
    const k = PLANKS, mesh = new Mesh(64), half = k.width / 2, inner = half - k.cheek;
    if (physics) { Wedge(mesh, k); return mesh; }
    // The frame under the deck (shows through the gaps), the cheeks flush with the deck on both sides.
    Slab(mesh, -k.length, 0, -inner, inner, 0, 0, k.height - k.deck, "frame");
    for (const s of [-1, 1]) Slab(mesh, -k.length, 0, s * inner, s * half, 0, 0, k.height, "frame");
    // Steel plates at the toe and the lip, planks across between them.
    const At = x => Deck(k, x);
    Slab(mesh, -k.length, -k.length + k.plate, -inner, inner, 0, 0.5, At(-k.length + k.plate), "steel");
    Slab(mesh, -k.plate, 0, -inner, inner, At(-k.plate) - k.deck, At(-k.plate), k.height, "steel");
    let i = 0;
    for (let x = -k.length + k.plate + k.gap; x < -k.plate - k.gap; x += k.plank + k.gap, i++) {
        const x1 = Math.min(x + k.plank, -k.plate - k.gap);
        Slab(mesh, x, x1, -inner, inner, At(x) - k.deck, At(x), At(x1), i % 2 ? "wood_dark" : "wood");
    }
    // A steel angle down the back of the lip.
    Slab(mesh, 0, 0.6, -inner, inner, k.height - 6, k.height, k.height, "steel");
    return mesh;
}

function Steel(physics) {
    const k = STEEL, mesh = new Mesh(64), half = k.width / 2, inner = half - k.side;
    if (physics) { Wedge(mesh, k); return mesh; }
    const At = x => Deck(k, x);
    // The deck plate on a dark body, yellow side plates flush with it.
    Slab(mesh, -k.length, 0, -inner, inner, 0, 0, k.height, "dark", "steel");
    for (const s of [-1, 1]) Slab(mesh, -k.length, 0, s * inner, s * half, 0, 0, k.height, "yellow");
    // Hazard stripes along the lip, on the deck (just above it) and down the back.
    const lift = 0.25, normal = V3.Unit([-k.height, 0, k.length]), On = (x, y) => V3.Add([x, y, At(x)], V3.Scale(normal, lift));
    for (let y = -inner - k.hazard, i = 0; y < inner; y += k.stripe, i++) {
        if (i % 2) continue;
        // A diagonal band: from (x0, y) at the band's start to (0, y + hazard) at the lip, clipped to the deck's width.
        const x0 = -k.hazard, Clip = v => Math.min(Math.max(v, -inner), inner);
        const pts = [[x0, Clip(y)], [x0, Clip(y + k.stripe)], [0, Clip(y + k.stripe + k.hazard)], [0, Clip(y + k.hazard)]];
        Poly(mesh, pts.map(([x, yy]) => On(x, yy)), normal, "yellow");
    }
    for (let y = -inner, i = 0; y < inner; y += k.stripe, i++) {
        const y1 = Math.min(y + k.stripe, inner);
        Poly(mesh, [[lift, y, 0], [lift, y1, 0], [lift, y1, k.height], [lift, y, k.height]], [1, 0, 0], i % 2 ? "dark" : "yellow");
    }
    return mesh;
}

function Board(physics) {
    const k = BOARD, mesh = new Mesh(64), half = k.width / 2, crateHalf = k.crateWidth / 2;
    const crateTop = Deck(k, -k.crate) - k.board; // the board rests on the crate's front edge, its end reaching on over it
    const barrel = [-k.crate / 2, crateHalf + k.barrel + 4];
    if (physics) {
        Wedge(mesh, k);
        Slab(mesh, -k.crate, 0, -crateHalf, crateHalf, 0, crateTop, crateTop, "wood");
        Barrel(mesh, ...barrel, k.barrel, 0, k.barrelHeight, PHYSICS_BARREL_SIDES, "red", "red");
        return mesh;
    }
    // The crate at the high end: a box, slats round its sides.
    Slab(mesh, -k.crate, 0, -crateHalf, crateHalf, 0, crateTop, crateTop, "wood");
    for (const z of [2, crateTop - 6]) {
        Slab(mesh, -k.crate - 0.5, 0.5, -crateHalf - 0.5, crateHalf + 0.5, z, z + k.slat, z + k.slat, "frame");
    }
    for (const x of [-k.crate - 0.5, -k.slat + 0.5]) for (const s of [-1, 1]) { // corner posts
        Slab(mesh, x, x + k.slat, s * (crateHalf + 0.5), s * (crateHalf - k.slat), 0, crateTop, crateTop, "frame");
    }
    // The board: from the floor up onto the crate's front edge, on to the lip over it; open underneath (the collision is a wedge).
    const At = x => Deck(k, x);
    Slab(mesh, -k.length, 0, -half, half, [At(-k.length) - k.board, At(0) - k.board], At(-k.length), At(0), "wood_dark", "wood");
    // A barrel beside the crate.
    Barrel(mesh, ...barrel, k.barrel, 0, k.barrelHeight, BARREL_SIDES, "red", "dark");
    for (const z of [8, k.barrelHeight - 10]) Barrel(mesh, ...barrel, k.barrel + 0.6, z, z + 2.5, BARREL_SIDES, "dark", "dark");
    return mesh;
}

function Rock(physics) {
    // The driving surface a plane; its edges split into points, each dropped
    // to the floor a random way out — broken faces. Render and collision alike.
    const k = ROCK, mesh = new Mesh(64), random = SeededRandom(k.seed), half = k.width / 2, n = k.points;
    const Top = (x, y) => [x, y, Deck(k, x)];
    const edge = [ // round the top, counter-clockwise from above, with the way out at each point
        ...Array.from({ length: n }, (_, i) => [Top(-k.length + (k.length * i) / n, -half), [0, -1]]),
        ...Array.from({ length: n }, (_, i) => [Top(0, -half + (k.width * i) / n), [1, 0]]),
        ...Array.from({ length: n }, (_, i) => [Top(-(k.length * i) / n, half), [0, 1]]),
        ...Array.from({ length: n }, (_, i) => [Top(-k.length, half - (k.width * i) / n), [-1, 0]]),
    ];
    const [lo, hi] = k.flare;
    const foot = edge.map(([p, [dx, dy]]) => {
        const out = (lo + (hi - lo) * random()) * Math.min(1, p[2] / 16 + 0.15), along = (random() - 0.5) * 8;
        return [p[0] + dx * out - dy * along, p[1] + dy * out + dx * along, 0];
    });
    Poly(mesh, edge.map(([p]) => p), [0, 0, 1], "rock_top");
    if (!physics) {
        // The chevrons just above the surface, each two arms (each convex, so each its own face) meeting at the tip.
        const a = ROCK_ARROWS, normal = V3.Unit([-k.height, 0, k.length]), On = (x, y) => V3.Add(Top(x, y), V3.Scale(normal, a.lift));
        for (let i = 0; i < a.count; i++) {
            const tip = -a.first - i * a.spacing, wing = tip - a.depth, w = a.width / 2;
            for (const s of [-1, 1]) Poly(mesh, [On(tip, 0), On(wing, s * w), On(wing - a.stroke, s * w), On(tip - a.stroke, 0)], normal, "arrow");
        }
    }
    edge.forEach(([p], i) => {
        const j = (i + 1) % edge.length, q = edge[j][0], out = [edge[i][1][0], edge[i][1][1], 0];
        // A middle point a little out from the edge: the side breaks in two faces.
        const m = V3.Add(V3.Scale(V3.Add(V3.Add(p, q), V3.Add(foot[i], foot[j])), 0.25), V3.Scale(out, 3 * random()));
        for (const tri of [[p, q, m], [q, foot[j], m], [foot[j], foot[i], m], [foot[i], p, m]]) Poly(mesh, tri, V3.Add(out, [0, 0, 0.2]), "rock");
    });
    return mesh;
}

const VARIANTS = { planks: Planks, steel: Steel, board: Board, rock: Rock };
const materials = { ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])), ...SHARED_MATERIALS };
// Materials first: Hammer recompiles a changed .vmdl at once, and a material not written yet leaves it the ERROR model.
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0, ...MATERIAL_OPTIONS[part] }));
}
for (const [variant, Build] of Object.entries(VARIANTS)) {
    const name = `${NAME}_${variant}`, render = Build(false), physics = Build(true);
    const obj = `${MODEL_DIR}/${name}.obj`, physicsObj = `${MODEL_DIR}/${name}_physics.obj`;
    const used = Object.fromEntries(Object.keys(render.tris).map(part => [part, materials[part]]));
    WriteAddonFile(obj, ObjText(render, name, GENERATOR));
    WriteAddonFile(physicsObj, ObjText(physics, name, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name, mesh: obj, physicsObj, materials: used }));
    console.log(`  ${name}: ${render.triangleCount} triangles (collision ${physics.triangleCount})`);
}
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<variant>.vmdl"`);
