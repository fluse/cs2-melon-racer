// Builds the hub's drone display — `node tools/models/make-drone-display-model.mjs`:
// a show table the drone (make-drone-model.mjs) stands on, and a sign next
// to it telling players they can explore the world with it. In the stage's
// look (make-stage-model.mjs): a light grey body, graphite, a warm white
// LED ring.
//
// The table: a round top on a graphite column and a round foot, a landing
// pad set into the top (a graphite disc, a white ring and a white "H"), an
// LED ring under the top's edge. The drone goes onto the pad as a
// prop_dynamic of models/melon_racer/drone/drone.vmdl, Default Animation
// "landed" (rotors still, the recording light blinking), its origin
// DRONE_ORIGIN_UP above the table's origin.
//
// The sign: a graphite board between two posts, a white edge, readable from both
// sides: a small drone icon and DRONE MODE in Bungee, under it what it does
// and how to get there (the user menu opens with USE, E by default).
//
// Writes
//   models/melon_racer/drone_display/drone_display_table.vmdl  (+ .obj, _physics.obj)
//   models/melon_racer/drone_display/drone_display_sign.vmdl   (+ .obj, _physics.obj)
//   materials/melon_racer/drone_display/drone_display_<part>.vmat (+ _color.png)
// Origins on the floor in the middle; the sign's front faces +X. Compile the
// .vmdl files with resourcecompiler (see the output).
import { BUNGEE, LoadFont, TextShapes } from "../lib/font.mjs";
import { Circle, Mesh, ObjText, Shape, SolidPng, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- The table ---
const TABLE_HEIGHT = 32; // the top's surface: the drone shows at a melon's camera height
const TOP_RADIUS = 20; // the drone is 16 across its guard rings
const TOP_THICKNESS = 3;
const TOP_SIDES = 32;
const COLUMN_RADIUS = 4;
const COLUMN_SIDES = 12;
const FOOT = { radius: 13, height: 2.5, sides: 24 };
const PAD = { radius: 15, raise: 0.1, ring: [12.5, 13.5], hBar: 1.4, hSize: 8 }; // the landing pad on the top
const LED = { radius: 0.6, sides: 4, below: 1.5, out: 0.1 }; // a ring under the top's edge
const DRONE_ORIGIN_UP = TABLE_HEIGHT + 2.5; // the drone's skids are 2.5 under its origin (DRONE_BOTTOM)

// --- The sign ---
const BOARD = { width: 112, height: 50, bottom: 34, thickness: 2.5, edgeInset: 2, edgeWidth: 1 };
const POST = { size: 3.5, over: 3, cap: 1.5, foot: 8, footHeight: 1.5 };
// The lines, top down: [text, cap height]; a line too long for the board shrinks.
const LINES = [
    ["DRONE MODE", 9],
    ["EXPLORE THE WORLD", 5],
    ["FROM ABOVE", 5],
    ["E > ACTIONS > DRONE MODE", 3.2],
];
const LINE_GAP = 3.2;
const TEXT_MARGIN = 7; // to the board's sides
const TEXT_RAISE = 0.12; // letters and edge just in front of the board's face
const TEXT_CURVE_STEP = 1.5;
const ICON = { size: 11, gap: 4, ring: 1.9, ringWidth: 0.7, arm: 0.9, body: 2.4, sides: 12 }; // the drone icon before the title

const COLORS = {
    body: { rgb: [0xd8, 0xdc, 0xe0], tint: 1 }, // the stage's light grey, tinted per prop
    dark: { rgb: [0x2b, 0x30, 0x38], tint: 0 }, // graphite
    white: { rgb: [0xf2, 0xf4, 0xf5], tint: 0 }, // markings and letters
    light: { rgb: [0xff, 0xf1, 0xd6], tint: 1, glow: 3 }, // the stage's warm white LEDs
};

const NAME = "drone_display";
const MODEL_DIR = "models/melon_racer/drone_display";
const MATERIAL_DIR = "materials/melon_racer/drone_display";
const GENERATOR = "tools/models/make-drone-display-model.mjs";

const font = LoadFont(BUNGEE);
/** A rectangle centered on (cu, cv), counter-clockwise. */
const Rect = (cu, cv, w, h) => [[cu - w / 2, cv - h / 2], [cu + w / 2, cv - h / 2], [cu + w / 2, cv + h / 2], [cu - w / 2, cv + h / 2]];
/** A ring from r0 to r1 around (u, v). */
const Ring = (u, v, r0, r1, sides) => Shape(Circle(u, v, r1, sides), [Circle(u, v, r0, sides)]);

function BuildTable(mesh, physics) {
    const top0 = TABLE_HEIGHT - TOP_THICKNESS;
    mesh.Extrude(Shape(Circle(0, 0, TOP_RADIUS, TOP_SIDES)), top0, TABLE_HEIGHT, "body", "z");
    mesh.Extrude(Shape(Circle(0, 0, COLUMN_RADIUS, COLUMN_SIDES)), FOOT.height - 0.2, top0 + 0.2, "dark", "z");
    mesh.Extrude(Shape(Circle(0, 0, FOOT.radius, FOOT.sides)), 0, FOOT.height, "body", "z");
    // The landing pad: a graphite disc, a white ring, a white H.
    const z = TABLE_HEIGHT + PAD.raise;
    mesh.Cap(Shape(Circle(0, 0, PAD.radius, TOP_SIDES)), z, "dark", "z");
    mesh.Cap(Ring(0, 0, PAD.ring[0], PAD.ring[1], TOP_SIDES), z + PAD.raise, "white", "z");
    const { hBar, hSize } = PAD;
    mesh.Cap([Rect(-hSize / 2 + hBar / 2, 0, hBar, hSize), Rect(hSize / 2 - hBar / 2, 0, hBar, hSize), Rect(0, 0, hSize - 2 * hBar + 0.2, hBar)].flatMap(r => Shape(r)), z + PAD.raise, "white", "z");
    // The LED ring under the top's edge.
    const ring = Circle(0, 0, TOP_RADIUS + LED.out, TOP_SIDES).map(([x, y]) => [x, y, TABLE_HEIGHT - LED.below]);
    mesh.Tube([...ring, ring[0]], LED.radius, LED.sides, "light", false);
    physics.Extrude(Shape(Circle(0, 0, TOP_RADIUS, 12)), top0, TABLE_HEIGHT, "body", "z");
    physics.Extrude(Shape(Circle(0, 0, FOOT.radius, 12)), 0, top0, "body", "z");
}

/** The drone icon seen from above, centered on (u, v): four rotor rings on an X of arms, a body. */
function IconShapes(u, v) {
    const reach = ICON.size / 2 - ICON.ring;
    const shapes = Shape(Rect(u, v, ICON.body * 1.6, ICON.body));
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const cu = u + su * reach, cv = v + sv * reach;
        shapes.push(...Ring(cu, cv, ICON.ring - ICON.ringWidth, ICON.ring, ICON.sides));
        // The arm: from the body to inside the ring.
        const d = (ICON.ring - ICON.ringWidth) / Math.SQRT2, a = ICON.arm / 2 / Math.SQRT2;
        const p = [u + su * 0.6, v + sv * 0.6], q = [cu - su * d, cv - sv * d];
        const quad = [[p[0] + sv * a, p[1] - su * a], [q[0] + sv * a, q[1] - su * a], [q[0] - sv * a, q[1] + su * a], [p[0] - sv * a, p[1] + su * a]];
        shapes.push(...Shape(quad));
    }
    return shapes;
}

/** Every line as 2D shapes (u = Y, v = Z) centered on the board, the icon before the title. */
function SignText() {
    const inner = BOARD.width - 2 * TEXT_MARGIN;
    const Span = shapes => {
        const us = shapes.flatMap(s => s.outer.map(p => p[0]));
        return [Math.min(...us), Math.max(...us)];
    };
    const lines = LINES.map(([text, cap], i) => {
        const room = i === 0 ? inner - ICON.size - ICON.gap : inner;
        let shapes = TextShapes(font, text, cap, { curveStep: TEXT_CURVE_STEP, minSegments: 1 });
        let [min, max] = Span(shapes);
        if (max - min > room) {
            cap *= room / (max - min);
            shapes = TextShapes(font, text, cap, { curveStep: TEXT_CURVE_STEP, minSegments: 1 });
            [min, max] = Span(shapes);
        }
        return { shapes, cap, min, max };
    });
    const total = lines.reduce((s, l) => s + l.cap, 0) + LINE_GAP * (lines.length - 1);
    let v = BOARD.bottom + BOARD.height / 2 + total / 2;
    const out = [];
    lines.forEach((l, i) => {
        v -= l.cap;
        const extra = i === 0 ? ICON.size + ICON.gap : 0;
        const left = -(l.max - l.min + extra) / 2;
        const du = left + extra - l.min, dv = v;
        const Move = c => c.map(([a, b]) => [a + du, b + dv]);
        out.push(...l.shapes.map(s => ({ outer: Move(s.outer), holes: s.holes.map(Move) })));
        if (i === 0) out.push(...IconShapes(left + ICON.size / 2, v + l.cap / 2));
        v -= LINE_GAP;
    });
    return { shapes: out, caps: lines.map(l => l.cap) };
}

/** Mirrored across u = 0 (outer still counter-clockwise), so it reads right from behind. */
const Mirror = shapes => shapes.map(s => ({
    outer: s.outer.map(([u, v]) => [-u, v]).reverse(),
    holes: s.holes.map(h => h.map(([u, v]) => [-u, v]).reverse()),
}));

function BuildSign(mesh, physics) {
    const { width, height, bottom, thickness, edgeInset, edgeWidth } = BOARD;
    const mid = bottom + height / 2, face = thickness / 2;
    const board = Shape(Rect(0, mid, width, height));
    mesh.Extrude(board, -face, face, "dark", "x");
    // Each marking on both faces, mirrored on the back: only its face (too thin for sides to show).
    const Both = shapes => {
        mesh.Cap(shapes, face + TEXT_RAISE, "white", "x");
        mesh.Cap(Mirror(shapes), -face - TEXT_RAISE, "white", "x", -1);
    };
    const ew = width - 2 * edgeInset, eh = height - 2 * edgeInset;
    Both(Shape(Rect(0, mid, ew, eh), [Rect(0, mid, ew - 2 * edgeWidth, eh - 2 * edgeWidth)]));
    const text = SignText();
    Both(text.shapes);
    // The posts either side of the board, on foot plates, a cap on top.
    for (const s of [-1, 1]) {
        const u = s * (width / 2 + POST.size / 2 - 0.2), top = bottom + height + POST.over;
        mesh.Extrude(Shape(Rect(0, u, POST.size, POST.size)), 0, top, "dark", "z");
        mesh.Extrude(Shape(Rect(0, u, POST.size + 1, POST.size + 1)), top, top + POST.cap, "body", "z");
        mesh.Extrude(Shape(Rect(0, u, POST.foot, POST.foot)), 0, POST.footHeight, "body", "z");
        physics.Extrude(Shape(Rect(0, u, POST.size, POST.size)), 0, top + POST.cap, "body", "z");
    }
    physics.Extrude(board, -face, face, "body", "x");
    return text;
}

const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`]));
/** Only the parts a mesh uses. */
const Used = mesh => Object.fromEntries(Object.keys(mesh.tris).map(part => [part, materials[part]]));
/** Writes one piece's model, its collision and .vmdl; returns its triangle count. */
function WritePiece(piece, mesh, physics) {
    const name = `${NAME}_${piece}`;
    const obj = `${MODEL_DIR}/${name}.obj`, physicsObj = `${MODEL_DIR}/${name}_physics.obj`;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Used(mesh) }));
    return `  ${name}.vmdl: ${mesh.triangleCount} triangles (collision ${physics.triangleCount})`;
}

const table = new Mesh(64), tablePhysics = new Mesh();
BuildTable(table, tablePhysics);
console.log(`${WritePiece("table", table, tablePhysics)}; top ${TABLE_HEIGHT} high, ${2 * TOP_RADIUS} across`);
const sign = new Mesh(64), signPhysics = new Mesh();
const { caps } = BuildSign(sign, signPhysics);
console.log(`${WritePiece("sign", sign, signPhysics)}; board ${BOARD.width} x ${BOARD.height}, ${BOARD.bottom + BOARD.height} high, letters ${caps.map(c => c.toFixed(1)).join(" / ")}`);
for (const [part, { rgb, tint, glow = 0 }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint, glow }));
}
console.log(`the drone: prop_dynamic models/melon_racer/drone/drone.vmdl, Default Animation "landed", ${DRONE_ORIGIN_UP} above the table's origin`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<piece>.vmdl"`);
