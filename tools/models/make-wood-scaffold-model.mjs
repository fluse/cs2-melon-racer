// Builds a wooden scaffold that hangs on a rock wall, for decoration (the
// lighthouse parkour's rock) — `node tools/models/make-wood-scaffold-model.mjs`:
// a plank deck on brackets (a beam out of the wall, a strut under it, a
// ledger against the wall), a railing with posts round the front and the
// ends, ropes from the front up to iron anchors in the wall above. Low-poly
// and flat-shaded like the coast rocks: every piece a box, planks each a
// little off (length, height) so it looks hand-built. Seeded, so every run
// gives the same scaffold. Variants (VARIANTS):
//   wood_scaffold         one deck (BAY wide), a bucket and a pile of loose planks on it
//   wood_scaffold_double  two decks LEVEL apart, the posts running through both,
//                         a ladder from the lower one up through a hatch in the upper one
// Origin on the wall face, in the middle of the bay, at the (upper) deck's
// top; the scaffold reaches out along +X, the wall behind it. The ledgers and
// beams reach WALL_SINK behind the origin, so on a curved wall push the prop
// in until its ends touch (over 192 a wall of radius 700 curves away ~7).
// Collision: the decks, the railings as solid fences (walls for bounces) and
// the brackets — a melon dropping onto it lands on the planks. No ropes, no props.
// Writes models/melon_racer/wood_scaffold/<variant>.vmdl (+ .obj, _physics.obj)
// and materials/melon_racer/wood_scaffold/wood_scaffold_<part>.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { AxisBox, Beam, Mesh, ObjText, SeededRandom, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- shape (units; the melon is ~14 across) ---
const BAY = 192; // along Y
const DEPTH = 64; // out from the wall
const WALL_SINK = 8; // ledgers and beams reaching into the wall
const BRACKETS = [-80, 0, 80]; // y of each bracket (beam, strut, ledger) and front post
const PLANKS = 7; // across the depth
const PLANK_THICKNESS = 4;
const PLANK_GAP = 0.8;
const BEAM = 6; // the brackets' beams and ledgers, square
const STRUT = 5;
const STRUT_DROP = 56; // how far below the deck the strut meets the wall
const POST = 5;
const RAIL_HEIGHT = 44; // top rail over the deck
const MID_RAIL = 22;
const RAIL = 3.5; // rail board thickness
const TOE_BOARD = 8;
const ROPE_TOP = 176; // the anchors over the (upper) deck
const ROPE_RADIUS = 0.9;
const LEVEL = 128; // the double's lower deck under the upper one
const HATCH = { y0: 36, y1: 76, x1: 30 }; // the upper deck's opening for the ladder (the planks nearer the wall than x1)
const LADDER = { y0: 44, y1: 68, footX: 26, topX: 14, rungStep: 14, over: 36 }; // stiles at y0/y1, leaning to the wall, `over` above the deck

// --- tessellation: as low as still reads round ---
const ROPE_SIDES = 3;
const BUCKET_SIDES = 7;

// --- look: weathered wood, hemp rope, dark iron ---
const COLORS = {
    plank: [0xb2, 0x86, 0x58],
    plank_light: [0xc6, 0x9c, 0x6a],
    beam: [0x7a, 0x56, 0x3a],
    rope: [0xd2, 0xbe, 0x8e],
    iron: [0x4a, 0x4c, 0x50],
};

const NAME = "wood_scaffold";
const MODEL_DIR = "models/melon_racer/wood_scaffold";
const MATERIAL_DIR = "materials/melon_racer/wood_scaffold";
const GENERATOR = "tools/models/make-wood-scaffold-model.mjs";

/**
 * One deck with its top at z: brackets, planks (skipping `hatch`), a toe
 * board, rails along the front and both ends; posts from `postBottom` up.
 */
function Deck(mesh, physics, random, z, { hatch, postBottom = z - 10 } = {}) {
    const half = BAY / 2, under = z - PLANK_THICKNESS;
    for (const y of BRACKETS) {
        AxisBox(mesh, [-WALL_SINK, y - BEAM / 2, under - STRUT_DROP - 8], [2, y + BEAM / 2, under], "beam"); // ledger
        AxisBox(mesh, [-WALL_SINK, y - BEAM / 2, under - BEAM], [DEPTH + 2, y + BEAM / 2, under], "beam"); // beam under the deck
        Beam(mesh, [1, y, under - STRUT_DROP], [DEPTH - 8, y, under - BEAM / 2], STRUT, STRUT, "beam", [0, 1, 0]);
        AxisBox(physics, [-WALL_SINK, y - BEAM / 2, under - BEAM], [DEPTH + 2, y + BEAM / 2, under], "beam");
    }
    const width = DEPTH / PLANKS;
    for (let i = 0; i < PLANKS; i++) {
        const x0 = i * width + PLANK_GAP / 2, x1 = (i + 1) * width - PLANK_GAP / 2;
        const lift = (random() - 0.5) * 0.8, part = random() < 0.35 ? "plank_light" : "plank";
        const y0 = -half - 2 + random() * 5, y1 = half + 2 - random() * 5;
        const pieces = hatch && x1 <= hatch.x1 ? [[y0, hatch.y0], [hatch.y1, y1]] : [[y0, y1]];
        for (const [a, b] of pieces) AxisBox(mesh, [x0, a, under + lift], [x1, b, z + lift], part);
    }
    AxisBox(physics, [0, -half, under], [DEPTH, half, z], "plank"); // the hatch stays closed: a melon can't fit through it anyway
    AxisBox(mesh, [DEPTH - 2, -half - 1, z], [DEPTH, half + 1, z + TOE_BOARD], "plank");
    // Posts: one at each bracket along the front, one at each end against the wall.
    const top = z + RAIL_HEIGHT;
    for (const y of BRACKETS) AxisBox(mesh, [DEPTH, y - POST / 2, postBottom], [DEPTH + POST, y + POST / 2, top + 3], "beam");
    for (const y of [-half, half]) {
        AxisBox(mesh, [DEPTH, y - POST / 2, postBottom], [DEPTH + POST, y + POST / 2, top + 3], "beam");
        AxisBox(mesh, [2, y - POST / 2, z - 2], [2 + POST, y + POST / 2, top + 3], "beam");
    }
    // Rails: top and middle, front (outside the posts) and ends (inside them).
    for (const h of [top, z + MID_RAIL]) {
        AxisBox(mesh, [DEPTH + POST, -half - 4, h - 4], [DEPTH + POST + RAIL, half + 4, h], "plank");
        for (const s of [-1, 1]) {
            const inner = s * (half - POST / 2), outer = inner - s * RAIL; // the board on the deck's side of the end posts
            AxisBox(mesh, [-2, Math.min(inner, outer), h - 4], [DEPTH + POST, Math.max(inner, outer), h], "plank");
        }
    }
    AxisBox(physics, [DEPTH, -half - 4, z], [DEPTH + POST + RAIL, half + 4, top], "beam");
    for (const s of [-1, 1]) AxisBox(physics, [0, s * half - POST / 2, z], [DEPTH, s * half + POST / 2, top], "beam");
}

/** Ropes from the front's top rail at each outer bracket up to an iron anchor in the wall at `anchorZ`. */
function Ropes(mesh, deckZ, anchorZ) {
    for (const y of [BRACKETS[0], BRACKETS.at(-1)]) {
        const foot = [DEPTH + POST / 2, y, deckZ + RAIL_HEIGHT + 2], anchor = [5, y, anchorZ];
        mesh.Tube([foot, anchor], ROPE_RADIUS, ROPE_SIDES, "rope", false);
        mesh.Tube([[DEPTH - 1, y, foot[2] - 3], [DEPTH + POST + RAIL + 1.5, y, foot[2] - 3], [DEPTH + POST + RAIL + 1.5, y, foot[2] + 3], [DEPTH - 1, y, foot[2] + 3]], ROPE_RADIUS * 1.2, ROPE_SIDES, "rope", false); // lashed round the post
        AxisBox(mesh, [-WALL_SINK, y - 6, anchorZ - 8], [2, y + 6, anchorZ + 8], "iron"); // the plate
        Beam(mesh, [0, y, anchorZ], [6, y, anchorZ], 2.5, 2.5, "iron"); // the eye bolt
    }
}

/** A wooden bucket at (x, y) on the deck at z. */
function Bucket(mesh, x, y, z) {
    mesh.Tube([[x, y, z], [x, y, z + 12]], i => 5 + i, BUCKET_SIDES, "beam");
    mesh.Tube([[x, y, z + 4], [x, y, z + 5.5]], 6.6, BUCKET_SIDES, "iron", false); // the hoop
    Beam(mesh, [x - 6, y, z + 12], [x, y, z + 19], 1, 1, "iron", [0, 1, 0]);
    Beam(mesh, [x, y, z + 19], [x + 6, y, z + 12], 1, 1, "iron", [0, 1, 0]);
}
/** A pile of three loose planks round (x, y), each turned a little. */
function PlankPile(mesh, random, x, y, z) {
    for (let i = 0; i < 3; i++) {
        const a = (random() - 0.5) * 0.25, half = 30 + random() * 6, cx = x + (random() - 0.5) * 6;
        const dir = [Math.sin(a), Math.cos(a), 0], at = [cx, y + (random() - 0.5) * 6, z + PLANK_THICKNESS * (i + 0.5)];
        Beam(mesh, V3.Sub(at, V3.Scale(dir, half)), V3.Add(at, V3.Scale(dir, half)), 9, PLANK_THICKNESS, i % 2 ? "plank_light" : "plank");
    }
}
/** The double's ladder: from the lower deck up through the hatch, `over` above the upper one. */
function Ladder(mesh, physics) {
    const z0 = -LEVEL, z1 = LADDER.over;
    const X = z => LADDER.footX + ((LADDER.topX - LADDER.footX) * (z - z0)) / (z1 - z0);
    for (const y of [LADDER.y0, LADDER.y1]) {
        Beam(mesh, [X(z0), y, z0], [X(z1), y, z1], 3, 4, "beam", [1, 0, 0]);
        Beam(physics, [X(z0), y, z0], [X(z1), y, z1], 3, 4, "beam", [1, 0, 0]);
    }
    for (let z = z0 + LADDER.rungStep; z < z1 - 4; z += LADDER.rungStep) Beam(mesh, [X(z), LADDER.y0 - 1, z], [X(z), LADDER.y1 + 1, z], 2, 2, "plank", [1, 0, 0]);
}

function Single() {
    const mesh = new Mesh(64), physics = new Mesh(), random = SeededRandom(17);
    Deck(mesh, physics, random, 0);
    Ropes(mesh, 0, ROPE_TOP);
    Bucket(mesh, 34, -46, 0);
    PlankPile(mesh, random, 22, 40, 0);
    return { mesh, physics };
}
function Double() {
    const mesh = new Mesh(64), physics = new Mesh(), random = SeededRandom(23);
    Deck(mesh, physics, random, 0, { hatch: HATCH, postBottom: -LEVEL - 10 });
    Deck(mesh, physics, random, -LEVEL);
    Ropes(mesh, 0, ROPE_TOP);
    Ladder(mesh, physics);
    Bucket(mesh, 40, -50, -LEVEL);
    PlankPile(mesh, random, 22, -40, 0);
    return { mesh, physics };
}

const VARIANTS = [
    { name: "wood_scaffold", build: Single },
    { name: "wood_scaffold_double", build: Double },
];

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
let total = 0;
for (const variant of VARIANTS) {
    const { mesh, physics } = variant.build();
    const obj = `${MODEL_DIR}/${variant.name}.obj`, physicsObj = `${MODEL_DIR}/${variant.name}_physics.obj`;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${variant.name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    const all = Object.values(mesh.tris).flat().flat().map(([v]) => mesh.v[v - 1]);
    const size = [0, 1, 2].map(i => Math.max(...all.map(c => c[i])) - Math.min(...all.map(c => c[i])));
    console.log(`  ${variant.name}.vmdl: ${mesh.triangleCount} triangles, collision ${physics.triangleCount}; ${size.map(n => n.toFixed(0)).join(" x ")}`);
    total += mesh.triangleCount;
}
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, metalness: part === "iron" ? 0.6 : 0 }));
}
console.log(`${NAME}: ${VARIANTS.length} variants, ${total} triangles in all`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/<variant>.vmdl"`);
