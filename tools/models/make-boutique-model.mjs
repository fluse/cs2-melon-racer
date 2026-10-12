// Builds the hub's Melon Boutique, where every melon skin is on show —
// `node tools/models/make-boutique-model.mjs`. An inflatable fair booth in
// the route gates' style (tools/lib/inflatable.mjs), a kit to build the
// display from, since skins keep coming: the melons themselves are placed by
// hand (prop_dynamic of each MELON_SKINS model, no animation).
//
// The booth (origin: on the floor in the middle of its open front, the front
// facing +X, reaching back BOOTH_DEPTH along -X):
//   boutique_frame          an inflatable tube loop round the top on four legs (feet,
//                           seams with straps), a blower at the back right foot   solid legs
//   boutique_wall           an inflatable back wall between the back legs            solid
//   boutique_awning         the striped awning over the front: its white stripes,
//   boutique_awning_stripes   and its colored ones (tint each on its own), a scalloped edge
//   boutique_sign           MELON BOUTIQUE on a board on the front beam, both sides
// The display (each its own origin, place as many as needed):
//   boutique_tier_<height>  a step block in the stage's look, TIER_WIDTH wide, TIER_DEPTH deep:
//                           stack them into the level ladder; origin on the floor under
//                           the middle of its front edge, the front facing +X        solid
//   boutique_ring           a little swim ring a melon sits in; origin under its middle,
//                           the melon's origin RING_MELON_UP above it
//   boutique_plate_<skin>   a name plate for each skin: name and its level (MELON_SKIN_LEVELS),
//                           on two little legs; origin under its middle, facing +X
// Vinyl (frame, wall, ring) is the shared white inflatable material, the
// canvas and the tiers' deck tinted per prop too; graphite and the white
// letters aren't. Writes models/melon_racer/boutique/<piece>.vmdl (+ .obj,
// _physics.obj for the solid ones) and materials/melon_racer/boutique/
// boutique_<part>.vmat (+ _color.png). Re-run after adding a skin (its
// plate). Compile the .vmdl files with resourcecompiler (see the output).
import { BUNGEE, LoadFont, TextShapes } from "../lib/font.mjs";
import { Blower, InflatableBlock, InflatableFoot, SegmentedTube } from "../lib/inflatable.mjs";
import { Circle, Mesh, ObjText, Shape, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";
import { MELON_SKIN_LEVELS, MELON_SKIN_NAMES, MELON_SKINS } from "../../src/melon_drive/kart/constants.js";

// --- The booth ---
const BOOTH_WIDTH = 512; // along Y, the tube loop's centerline
const BOOTH_DEPTH = 448; // along X
const TOP = 192; // the loop's centerline height
const CORNER = 48; // the loop's corners, rounded in plan
const TUBE = { radius: 11, sides: 10, step: 40 };
const SEAM = { radius: 0.86, rounding: 5, rings: [0, 1.5, 5] };
const STRAP = { radius: 10.2, halfWidth: 1.2, part: "dark" };
const FOOT = { plateRadius: 18, plateHeight: 3, platePart: "dark", radius: 16, height: 9, rings: 6, sides: 10, part: "vinyl" };
const LEG_SEGMENTS = 2;
const LOOP_SEGMENTS = 8;
// The back wall: a soft panel between the back legs, its top under the loop.
const WALL = { thickness: 8, round: 0.25, rows: 10, cols: 28 };
// The awning: out over the front from the loop's top, stripes along X, a scalloped edge hanging down.
const AWNING = { out: 80, drop: 40, overhang: 16, stripe: 32, sag: 4, valance: 12, scallop: 12, thickness: 0.6 };
// The sign on the front beam.
const SIGN = { text: "MELON BOUTIQUE", cap: 22, margin: 16, height: 40, sink: 6, thickness: 2.5, edge: [2, 1.2], raise: 0.12, curveStep: 2 };

// --- The display ---
const TIER_WIDTH = 128; // along Y
const TIER_DEPTH = 64; // along X
const TIER_HEIGHTS = [16, 32, 48, 64, 80, 96, 112, 128];
const NOSING = { width: 2.2, inset: 0.6, raise: 0.12 };
const LED = { radius: 0.6, sides: 4, below: 1.6, out: 0.1 };
const RING = { radius: 8.5, tube: 3.4, sides: 8, segments: 16, valve: [1, 1.6] }; // major radius, tube radius
const MELON_RADIUS = 7; // the melon's, about: it rests on the ring's tube
const RING_MELON_UP = RING.tube + Math.sqrt((MELON_RADIUS + RING.tube) ** 2 - RING.radius ** 2);
const PLATE = { width: 40, height: 11, thickness: 1.2, leg: 3, nameCap: 3.4, levelCap: 2.4, gap: 1.6, margin: 2.5, curveStep: 0.8 };

const COLORS = {
    dark: { rgb: [0x2b, 0x30, 0x38], tint: 0 }, // graphite: straps, plates, blower, sign board, nosing
    white: { rgb: [0xf2, 0xf4, 0xf5], tint: 0 }, // letters and edges
    canvas: { rgb: [0xf4, 0xf2, 0xee], tint: 1 }, // the awning, tinted per prop
    deck: { rgb: [0xd8, 0xdc, 0xe0], tint: 1 }, // the stage's light grey, tinted per prop
    light: { rgb: [0xff, 0xf1, 0xd6], tint: 0, glow: 3 }, // the stage's warm white LEDs
};
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat";

const NAME = "boutique";
const MODEL_DIR = "models/melon_racer/boutique";
const MATERIAL_DIR = "materials/melon_racer/boutique";
const GENERATOR = "tools/models/make-boutique-model.mjs";
const font = LoadFont(BUNGEE);
const Rect = (cu, cv, w, h) => [[cu - w / 2, cv - h / 2], [cu + w / 2, cv - h / 2], [cu + w / 2, cv + h / 2], [cu - w / 2, cv + h / 2]];

// --- The frame: a loop round the top, rounded in plan, and a leg up into each corner ---
const hx = BOOTH_DEPTH / 2, hy = BOOTH_WIDTH / 2, mx = -hx; // the loop's middle along X
/** The loop's centerline: a rounded rectangle at TOP, `per` points per corner, from the front's middle round (its ends meet behind the sign). */
function LoopPoints(per = 4) {
    const pts = [[0, 0, TOP]];
    for (const [cx, cy, a0] of [[hx - CORNER, hy - CORNER, 0], [-hx + CORNER, hy - CORNER, 90], [-hx + CORNER, -hy + CORNER, 180], [hx - CORNER, -hy + CORNER, 270]]) {
        for (let i = 0; i <= per; i++) {
            const a = ((a0 + (90 * i) / per) * Math.PI) / 180;
            pts.push([mx + cx + CORNER * Math.cos(a), cy + CORNER * Math.sin(a), TOP]);
        }
    }
    return [...pts, pts[0]];
}
/** A path along points by length, with every point a bend (a ring there). */
function Path(points) {
    const along = [0];
    for (let i = 1; i < points.length; i++) along.push(along[i - 1] + Math.hypot(...V3.Sub(points[i], points[i - 1])));
    const At = s => {
        let i = 1;
        while (i < points.length - 1 && along[i] < s) i++;
        const k = Math.min(1, Math.max(0, (s - along[i - 1]) / (along[i] - along[i - 1] || 1)));
        return V3.Add(points[i - 1], V3.Scale(V3.Sub(points[i], points[i - 1]), k));
    };
    return { At, length: along.at(-1), bends: along.slice(1, -1) };
}
// The legs stand under the middle of each corner's curve.
const LEGS = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => [
    mx + sx * (hx - CORNER + CORNER * Math.SQRT1_2), sy * (hy - CORNER + CORNER * Math.SQRT1_2),
]);

function BuildFrame(mesh, physics) {
    const loop = Path(LoopPoints());
    SegmentedTube(mesh, { ...loop, segments: LOOP_SEGMENTS, radius: TUBE.radius, sides: TUBE.sides, step: TUBE.step, seam: SEAM, strap: STRAP, part: "vinyl" });
    const legBottom = FOOT.plateHeight + FOOT.height - 1;
    for (const [x, y] of LEGS) {
        const leg = Path([[x, y, legBottom], [x, y, TOP]]);
        SegmentedTube(mesh, { ...leg, segments: LEG_SEGMENTS, radius: TUBE.radius, sides: TUBE.sides, step: TUBE.step, seam: SEAM, strap: STRAP, part: "vinyl" });
        InflatableFoot(mesh, x, y, FOOT);
        physics.Tube([[x, y, 0], [x, y, TOP]], TUBE.radius + 2, 8, "vinyl");
    }
    // The blower behind the back right foot (-Y side), its duct into the foot's ring.
    const [bx, by] = LEGS[2];
    Blower(mesh, physics, {
        at: [bx - 30, by], into: [bx - FOOT.radius + 3, by, FOOT.plateHeight + FOOT.height / 2],
        size: [10, 12, 9], ductRadius: 3.2, ductLow: 3.2 + FOOT.plateHeight, boxPart: "dark", ringPart: "dark", ductPart: "vinyl",
    });
}

function BuildWall(mesh, physics) {
    const x = -BOOTH_DEPTH, halfY = hy - CORNER * 0.4, halfZ = (TOP - TUBE.radius + 2) / 2;
    const block = { center: [x, 0, halfZ], half: [WALL.thickness / 2, halfY, halfZ + 4], round: WALL.round, rows: WALL.rows, cols: WALL.cols, part: "vinyl" };
    InflatableBlock(mesh, block); // its bottom a little under the floor, its top into the loop
    physics.Extrude(Shape(Rect(x, 0, WALL.thickness, 2 * halfY)), 0, TOP, "vinyl", "z");
}

// --- The awning: stripes from the loop's top out over the front ---
const awningY = hy + AWNING.overhang;
const stripeCount = Math.ceil((2 * awningY) / AWNING.stripe) | 1; // odd: white at both edges
const stripeWidth = (2 * awningY) / stripeCount;
/** The awning's surface at (t along X from the beam out, y): a straight slope sagging a little between. */
const AwningPoint = (t, y) => [t * AWNING.out, y, TOP + TUBE.radius - t * AWNING.drop - AWNING.sag * Math.sin(Math.PI * t)];
function BuildAwning(mesh, colored) {
    for (let i = colored ? 1 : 0; i < stripeCount; i += 2) {
        const y0 = -awningY + i * stripeWidth, y1 = y0 + stripeWidth;
        const grid = [0, 0.25, 0.5, 0.75, 1].map(t => [AwningPoint(t, y0), AwningPoint(t, y1)]);
        mesh.Surface(grid, "canvas", { away: [AWNING.out / 2, 0, -1e4] }); // the top
        mesh.Surface(grid, "canvas", { away: [AWNING.out / 2, 0, 1e4] }); // the underside
        // The scalloped valance: a flap down from the edge, a half circle at its bottom.
        const top = AwningPoint(1, 0)[2], bottom = top - AWNING.valance, mid = (y0 + y1) / 2, r = stripeWidth / 2;
        const outline = [[y0, top + 0.5], [y0, bottom], ...Array.from({ length: 7 }, (_, k) => {
            const a = Math.PI + (Math.PI * (k + 1)) / 8;
            return [mid + r * Math.cos(a), bottom + AWNING.scallop * Math.sin(a)]; // down to `scallop` under the flap
        }), [y1, bottom], [y1, top + 0.5]];
        mesh.Extrude(Shape(outline), AWNING.out - AWNING.thickness / 2, AWNING.out + AWNING.thickness / 2, "canvas", "x");
    }
}

// --- Text helpers ---
/** `text` in Bungee, cap height `cap` (shrunk to `maxWidth`), centered on (u, v) — the shapes and the cap used. */
function CenteredText(text, cap, maxWidth, u, v, curveStep) {
    const Span = shapes => {
        const us = shapes.flatMap(s => s.outer.map(p => p[0]));
        return [Math.min(...us), Math.max(...us)];
    };
    let shapes = TextShapes(font, text, cap, { curveStep, minSegments: 1 });
    let [min, max] = Span(shapes);
    if (max - min > maxWidth) {
        cap *= maxWidth / (max - min);
        shapes = TextShapes(font, text, cap, { curveStep, minSegments: 1 });
        [min, max] = Span(shapes);
    }
    const du = u - (min + max) / 2, dv = v - cap / 2;
    const Move = c => c.map(([a, b]) => [a + du, b + dv]);
    return { shapes: shapes.map(s => ({ outer: Move(s.outer), holes: s.holes.map(Move) })), cap, width: max - min };
}
/** Mirrored across u = 0, so it reads right from behind. */
const Mirror = shapes => shapes.map(s => ({ outer: s.outer.map(([u, v]) => [-u, v]).reverse(), holes: s.holes.map(h => h.map(([u, v]) => [-u, v]).reverse()) }));

function BuildSign(mesh) {
    const probe = CenteredText(SIGN.text, SIGN.cap, Infinity, 0, 0, SIGN.curveStep);
    const width = probe.width + 2 * SIGN.margin, bottom = TOP + TUBE.radius - SIGN.sink, mid = bottom + SIGN.height / 2;
    const face = SIGN.thickness / 2;
    mesh.Extrude(Shape(Rect(0, mid, width, SIGN.height)), -face, face, "dark", "x");
    const [inset, edge] = SIGN.edge, ew = width - 2 * inset, eh = SIGN.height - 2 * inset;
    const markings = [...Shape(Rect(0, mid, ew, eh), [Rect(0, mid, ew - 2 * edge, eh - 2 * edge)]), ...CenteredText(SIGN.text, SIGN.cap, Infinity, 0, mid, SIGN.curveStep).shapes];
    mesh.Cap(markings, face + SIGN.raise, "white", "x");
    mesh.Cap(Mirror(markings), -face - SIGN.raise, "white", "x", -1);
    return { width };
}

// --- The display pieces ---
function BuildTier(mesh, physics, height) {
    const box = Shape(Rect(-TIER_DEPTH / 2, 0, TIER_DEPTH, TIER_WIDTH));
    for (const m of [mesh, physics]) m.Extrude(box, 0, height, "deck", "z");
    const x1 = -NOSING.inset;
    mesh.Cap(Shape(Rect(x1 - NOSING.width / 2, 0, NOSING.width, TIER_WIDTH)), height + NOSING.raise, "dark", "z");
    mesh.Tube([[LED.out, -TIER_WIDTH / 2, height - LED.below], [LED.out, TIER_WIDTH / 2, height - LED.below]], LED.radius, LED.sides, "light", false);
}

function BuildRing(mesh) {
    // A torus: rings of the tube round the major circle, lying on the floor.
    const centers = Array.from({ length: RING.segments + 1 }, (_, i) => {
        const a = (2 * Math.PI * i) / RING.segments;
        return [RING.radius * Math.cos(a), RING.radius * Math.sin(a), RING.tube];
    });
    mesh.Tube(centers, RING.tube, RING.sides, "vinyl", false);
    // The valve on its outside.
    mesh.Tube([[RING.radius + RING.tube - 0.4, 0, RING.tube], [RING.radius + RING.tube + RING.valve[1], 0, RING.tube + 0.6]], RING.valve[0], 6, "dark");
}

function BuildPlate(mesh, skin) {
    const { width, height, thickness, leg } = PLATE;
    const mid = leg + height / 2, face = thickness / 2;
    mesh.Extrude(Shape(Rect(0, mid, width, height)), -face, face, "dark", "x");
    const inner = width - 2 * PLATE.margin;
    const level = MELON_SKIN_LEVELS[skin] ?? 1;
    const levelText = level <= 1 ? "FREE" : `LV ${level}`;
    const textHeight = PLATE.nameCap + PLATE.gap + PLATE.levelCap;
    const name = CenteredText(MELON_SKIN_NAMES[skin].toUpperCase(), PLATE.nameCap, inner, 0, mid + textHeight / 2 - PLATE.nameCap / 2, PLATE.curveStep);
    const lv = CenteredText(levelText, PLATE.levelCap, inner, 0, mid - textHeight / 2 + PLATE.levelCap / 2, PLATE.curveStep);
    mesh.Cap([...name.shapes, ...lv.shapes], face + 0.08, "white", "x");
    for (const s of [-1, 1]) mesh.Extrude(Shape(Rect(0, s * (width / 2 - 5), 1.2, 1.2)), 0, leg + 0.5, "dark", "z");
}

// --- Writing ---
const materials = {
    vinyl: VINYL_MATERIAL,
    ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])),
};
const Used = mesh => Object.fromEntries(Object.keys(mesh.tris).map(part => [part, materials[part]]));
let boothTotal = 0;
/** Builds one piece with `Build(mesh, physics)`, writes it; `solid` writes its collision. */
function Piece(piece, Build, { solid = false, booth = false, note = "" } = {}) {
    const mesh = new Mesh(64), physics = new Mesh();
    Build(mesh, physics);
    const name = `${NAME}_${piece}`;
    const obj = `${MODEL_DIR}/${name}.obj`, physicsObj = solid ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    if (solid) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Used(mesh) }));
    if (booth) boothTotal += mesh.triangleCount;
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles${solid ? ` (collision ${physics.triangleCount})` : ""}${note}`);
}

Piece("frame", BuildFrame, { solid: true, booth: true });
Piece("wall", BuildWall, { solid: true, booth: true });
Piece("awning", mesh => BuildAwning(mesh, false), { booth: true });
Piece("awning_stripes", mesh => BuildAwning(mesh, true), { booth: true });
let signWidth = 0;
Piece("sign", mesh => { signWidth = BuildSign(mesh).width; }, { booth: true });
for (const height of TIER_HEIGHTS) Piece(`tier_${height}`, (mesh, physics) => BuildTier(mesh, physics, height), { solid: true });
Piece("ring", BuildRing, { note: `; the melon's origin ${RING_MELON_UP.toFixed(1)} above the ring's` });
for (const skin of Object.keys(MELON_SKINS)) Piece(`plate_${skin}`, mesh => BuildPlate(mesh, skin));

for (const [part, { rgb, tint, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint, glow }));
}
console.log(`booth: ${boothTotal} triangles; ${BOOTH_WIDTH + 2 * TUBE.radius} wide, ${BOOTH_DEPTH + TUBE.radius} deep (from x = 0 back), loop ${TOP + TUBE.radius} high, `
    + `awning out to x = ${AWNING.out}, sign ${signWidth.toFixed(0)} wide; inside between the legs ~${(2 * Math.abs(LEGS[0][1]) - 2 * TUBE.radius).toFixed(0)} across`);
console.log(`tiers: ${TIER_WIDTH} wide x ${TIER_DEPTH} deep, heights ${TIER_HEIGHTS.join(" / ")}; ring: put the melon's origin ${RING_MELON_UP.toFixed(1)} above the ring's`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/<name>.vmdl"`);
