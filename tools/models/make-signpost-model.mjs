// Generates wayfinding signs that show players where a route goes — `node tools/models/make-signpost-model.mjs`:
// three prop_statics, all of them in the addon's shared glowing green (materials/glowgreen.vmat), so they read
// from far off and in the dark, and look the same as the kicker's chevrons:
//   signpost_arrow        an arrow board on a post, pointing +X, readable from both sides (+-Y); the arrow
//                         ARROW.length long at ARROW.z, the post on a foot plate (origin under the post)
//   signpost_chevrons     a curve warning board: CHEVRONS.count chevrons on a rail on two legs, pointing +Y
//                         (a left turn for a melon driving along +X towards it) — yaw it 180 for a right turn:
//                         the chevrons are solid shapes, from behind they point the other way
//   signpost_floor_arrow  a flat arrow lying on the floor, FLOOR.height high, pointing +X; no collision, a
//                         melon rolls straight over it
// Writes models/melon_racer/signpost/signpost_<variant>.{obj,vmdl} (+ _physics.obj: plain boxes).
// Origin on the floor; scale only uniformly.
import { AxisBox, Mesh, ObjText, Shape, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// The arrow on the post: tail at -length/2, tip at +length/2 (x), shaft `shaft` high, head `head` high
// and `headLength` long, its middle `z` up, `thick` across; the post `post` square up to the arrow's middle.
const ARROW = { length: 96, shaft: 18, head: 42, headLength: 32, z: 92, thick: 4, post: 6, foot: [20, 2] };
// The curve board: `count` chevrons `spacing` apart along Y, each `width` along Y (tip to wing ends),
// `height` high, its arms `stroke` thick (along Y), `thick` along X; on a rail `rail` high under them,
// two legs `leg` square to the floor at the rail's ends; the chevrons' bottom `z` up.
const CHEVRONS = { count: 3, spacing: 30, width: 26, height: 48, stroke: 10, thick: 4, z: 34, rail: 6, leg: 5 };
// The floor arrow: like the post's arrow, lying flat (x along, y across), `height` high.
const FLOOR = { length: 128, shaft: 24, head: 64, headLength: 44, height: 1 };

const NAME = "signpost";
const MODEL_DIR = `models/melon_racer/${NAME}`;
const GENERATOR = "tools/models/make-signpost-model.mjs";
const MATERIALS = { glow: "materials/glowgreen.vmat" };

/** An arrow outline in (along, across), pointing +along, centered on 0. */
function ArrowOutline({ length, shaft, head, headLength }) {
    const tail = -length / 2, neck = length / 2 - headLength, tip = length / 2;
    return [[tail, -shaft / 2], [neck, -shaft / 2], [neck, -head / 2], [tip, 0], [neck, head / 2], [neck, shaft / 2], [tail, shaft / 2]];
}
/** A chevron outline in (along, up), its tip at along = 0 pointing +along, its wings back to -width. */
function ChevronOutline({ width, height, stroke }) {
    const h = height / 2;
    return [[0, 0], [-width + stroke, h], [-width, h], [-stroke, 0], [-width, -h], [-width + stroke, -h]].map(([a, b]) => [a + stroke, b]);
}

function SignArrow(physics) {
    const a = ARROW, mesh = new Mesh(64), t = a.thick / 2, p = a.post / 2;
    if (physics) {
        AxisBox(mesh, [-a.length / 2, -t, a.z - a.head / 2], [a.length / 2, t, a.z + a.head / 2], "glow");
        AxisBox(mesh, [-p, -p, 0], [p, p, a.z], "glow");
        return mesh;
    }
    // Extruded along Y: the shape's (u, v) is (z, x), so the outline is written in (x, z) and swapped.
    mesh.Extrude(Shape(ArrowOutline(a).map(([x, z]) => [z + a.z, x])), -t, t, "glow", "y");
    AxisBox(mesh, [-p, -p, a.foot[1]], [p, p, a.z - a.shaft / 2], "glow");
    AxisBox(mesh, [-a.foot[0] / 2, -a.foot[0] / 2, 0], [a.foot[0] / 2, a.foot[0] / 2, a.foot[1]], "glow");
    return mesh;
}

function SignChevrons(physics) {
    const c = CHEVRONS, mesh = new Mesh(64), t = c.thick / 2, span = (c.count - 1) * c.spacing + c.width, y0 = -span / 2;
    const top = c.z + c.height, railTop = c.z;
    if (physics) {
        AxisBox(mesh, [-t, y0, railTop - c.rail], [t, -y0, top], "glow");
        for (const y of [y0 + c.leg / 2, -y0 - c.leg / 2]) AxisBox(mesh, [-t, y - c.leg / 2, 0], [t, y + c.leg / 2, railTop], "glow");
        return mesh;
    }
    // Extruded along X: the shape's (u, v) is (y, z). The chevrons' tips towards +Y.
    for (let i = 0; i < c.count; i++) {
        const tipY = y0 + c.width + i * c.spacing;
        mesh.Extrude(Shape(ChevronOutline(c).map(([a, b]) => [tipY - c.stroke + a, c.z + c.height / 2 + b])), -t, t, "glow", "x");
    }
    AxisBox(mesh, [-t, y0, railTop - c.rail], [t, -y0, railTop - 1], "glow");
    for (const y of [y0 + c.leg / 2, -y0 - c.leg / 2]) AxisBox(mesh, [-t, y - c.leg / 2, 0], [t, y + c.leg / 2, railTop - c.rail], "glow");
    return mesh;
}

function FloorArrow(physics) {
    if (physics) return null;
    const mesh = new Mesh(64);
    mesh.Extrude(Shape(ArrowOutline(FLOOR)), 0, FLOOR.height, "glow", "z");
    return mesh;
}

const VARIANTS = { arrow: SignArrow, chevrons: SignChevrons, floor_arrow: FloorArrow };
for (const [variant, Build] of Object.entries(VARIANTS)) {
    const name = `${NAME}_${variant}`, render = Build(false), physics = Build(true);
    const obj = `${MODEL_DIR}/${name}.obj`, physicsObj = physics ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(render, name, GENERATOR));
    if (physics) WriteAddonFile(physicsObj, ObjText(physics, name, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name, mesh: obj, physicsObj, materials: MATERIALS }));
    console.log(`  ${name}: ${render.triangleCount} triangles (collision ${physics ? physics.triangleCount : "none"})`);
}
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_<variant>.vmdl"`);
