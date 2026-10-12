// Builds inflatable hedges for the hub's decoration — `node tools/models/make-hedge-model.mjs`,
// in the trees' style (tools/lib/inflatable.mjs's white vinyl, graphite
// details): the foliage held up off the ground on its branches, so under it
// the woody part shows, as on a real hedge:
//   branches  a row of plants: each a short trunk out of the ground (flared at
//             its foot), forking into curved branches that reach up into the
//             foliage, thin twigs off them; a dark ground strip under all
//   foliage   on top of them: soft vinyl chambers (the formal ones) or puffy
//             pillows (the trees' crown pillows) — its underside rounded, the
//             branches running up into it; a valve on its side
// Three variants (VARIANTS):
//   box       a formal cut hedge: four box chambers pinched together
//   bushy     a loose one: two rows of pillows, its top rising and falling
//   topiary   a low box hedge, two pillow balls on stems over it (the stems
//             part of its foliage)
// One branches model (BRANCHES) under every variant's foliage, so each is
// tinted on its own (the prop's render color tints the white vinyl,
// surfaces/inflatable.vmat — a green foliage, a brown branches; never the
// dark parts), both at the same origin: place a foliage and the branches at
// one spot with the same angles. Every foliage has its underside at
// BRANCHES.bottom, where the branches reach into it. Each is
// LENGTH long along +X from its origin (on the floor, on its center line),
// like the park walls: chain them end to end — the foliage reaches a little
// past both ends, into the next piece's.
// Collision: a box from the ground to the foliage's top on the foliage model
// (and the topiaries' balls) — the gap under it is closed, melons don't get
// stuck in the branches. The branches have none.
// Writes models/melon_racer/hedge/hedge_foliage<suffix>.vmdl (+ .obj,
// _physics.obj), hedge_branches.vmdl (+ .obj) and
// materials/melon_racer/hedge/hedge_dark.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { InflatableBlock, Pillow } from "../lib/inflatable.mjs";
import { ChamferedRect, Mesh, ObjText, SeededRandom, Shape, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- Shared by every variant ---
const LENGTH = 128; // along +X from the origin
const CHAMBER = { overlap: 2, round: 0.35, rows: 8, cols: 16 }; // the box chambers: how far each reaches into the next, superellipsoid exponent, grid
const PILLOW = { sides: 10, rings: 6, seamDepth: 0.08, seamWidth: 0.16, part: "vinyl" };
const BALL = { sides: 12, rings: 8, seamDepth: 0.06, seamWidth: 0.14, part: "vinyl" };
const STRIP = { out: 6, height: 1, chamfer: 6 }; // the dark ground strip: this far out each side of the plants
const VALVE = { radius: 2.4, length: 3.5, capRadius: 3 };
// Branches: per plant a trunk (radius at the fork, `flare` x at the foot),
// branches up into the foliage (radius at the fork, `tip` x where they go
// into it, `into` units up into its underside), twigs off them. Tube sides
// and points along each.
const TRUNK = { radius: 2.3, flare: 1.4, sides: 6, points: 4 };
const BRANCH = { radius: 1.6, tip: 0.6, sides: 5, points: 4, into: 8 };
const TWIG = { radius: 0.8, tip: 0.35, sides: 4, points: 3, length: [6, 11] };
const STEM = { radius: 3.4, sides: 8 }; // a topiary ball's stem
const PHYSICS_CHAMFER = 4;
const PHYSICS_SIDES = 8;

// --- The variants ---
// depth: across; top: the foliage's top; chambers: box chambers along
// LENGTH, or pillows ({ at, r, h }, as the trees'); balls: topiaries { x, r }.
// The branches: depth (the box hedge's), bottom (every foliage's underside:
// the branches show below it); plants along it (each `branches` branches, up
// to `twigs` twigs on each); seed: their random.
const BRANCHES = { depth: 36, bottom: 16, plants: 6, branches: 3, twigs: 2, seed: 3 };
const VARIANTS = [
    { suffix: "", label: "box", depth: 36, top: 58, chambers: 4 },
    {
        suffix: "_2", label: "bushy", depth: 40, top: 60,
        pillows: [
            { at: [6, 9, 31], r: 19, h: 15 }, { at: [29, -9, 30], r: 21, h: 15 }, { at: [52, 10, 31], r: 20, h: 15 },
            { at: [76, -8, 30], r: 21, h: 15 }, { at: [99, 9, 31], r: 20, h: 15 }, { at: [122, -9, 30], r: 19, h: 15 },
            { at: [17, -2, 45], r: 19, h: 15 }, { at: [42, 3, 47], r: 20, h: 14 }, { at: [67, -3, 44], r: 18, h: 14 },
            { at: [91, 2, 47], r: 20, h: 14 }, { at: [115, -1, 45], r: 18, h: 14 },
        ],
    },
    {
        suffix: "_3", label: "topiary", depth: 32, top: 40, chambers: 2,
        balls: [{ x: 32, r: 17 }, { x: 96, r: 17 }],
    },
];
const BALL_GAP = 9; // the stem shows this much between the hedge's top and the ball

const COLORS = {
    dark: [0x2b, 0x30, 0x38], // the hub gates' graphite: ground strip, valve
};
const VINYL_MATERIAL = "materials/melon_racer/surfaces/inflatable.vmat"; // tools/materials/make-inflatable.mjs, tinted per prop

const NAME = "hedge";
const MODEL_DIR = "models/melon_racer/hedge";
const MATERIAL_DIR = "materials/melon_racer/hedge";
const GENERATOR = "tools/models/make-hedge-model.mjs";

const Lerp = (a, b, k) => a.map((n, i) => n + (b[i] - n) * k);
/** A quadratic curve from a over c to b, `points` points. */
const Curve = (a, c, b, points) => Array.from({ length: points }, (_, i) => {
    const k = i / (points - 1);
    return Lerp(Lerp(a, c, k), Lerp(c, b, k), k);
});
/** A tube tapering from r0 to r1 along `points`, ends open (they're in the ground, the foliage or a branch). */
function Tapered(mesh, points, r0, r1, sides) {
    mesh.Tube(points, i => r0 + ((r1 - r0) * i) / (points.length - 1), sides, "vinyl", false, { slopedNormals: true });
}

// --- Foliage ---

function BuildFoliage(t, mesh, physics) {
    const half = (t.top - BRANCHES.bottom) / 2, mid = (t.top + BRANCHES.bottom) / 2;
    if (t.chambers) {
        const each = LENGTH / t.chambers;
        for (let i = 0; i < t.chambers; i++) {
            InflatableBlock(mesh, {
                center: [each * (i + 0.5), 0, mid], half: [each / 2 + CHAMBER.overlap, t.depth / 2, half],
                round: CHAMBER.round, rows: CHAMBER.rows, cols: CHAMBER.cols, part: "vinyl",
            });
        }
    }
    for (const pillow of t.pillows ?? []) Pillow(mesh, pillow, PILLOW);
    for (const { x, r } of t.balls ?? []) {
        const z = t.top + BALL_GAP + r;
        Pillow(mesh, { at: [x, 0, z], r, h: r }, BALL);
        mesh.Tube([[x, 0, t.top - 6], [x, 0, t.top + BALL_GAP + 3]], STEM.radius, STEM.sides, "vinyl", false);
        physics.Tube([[x, 0, z - r], [x, 0, z + r]], r * 0.9, PHYSICS_SIDES, "vinyl");
    }
    // The valve on the -Y side: on the first chamber, or the lowest pillow on that side.
    const side = t.chambers ? { x: 14, y: -t.depth / 2, z: mid } : (() => {
        const p = t.pillows.filter(q => q.at[1] < 0).sort((a, b) => a.at[2] - b.at[2] || a.at[0] - b.at[0])[0];
        return { x: p.at[0], y: p.at[1] - p.r * (1 - PILLOW.seamDepth), z: p.at[2] };
    })();
    const At = s => [side.x, side.y - s, side.z];
    mesh.Tube([At(-1.5), At(VALVE.length)], VALVE.radius, 10, "dark");
    mesh.Tube([At(VALVE.length), At(VALVE.length + 1.2)], VALVE.capRadius, 10, "dark");
    const top = Math.max(t.top, ...(t.pillows ?? []).map(p => p.at[2] + p.h * 0.6));
    physics.Extrude(Shape(ChamferedRect(LENGTH / 2, 0, LENGTH, t.depth, PHYSICS_CHAMFER)), 0, top, "vinyl", "z");
}

// --- Branches ---

/** One plant at (x, y): trunk, branches up into the foliage, twigs off them. */
function Plant(mesh, t, x, y, random) {
    const fork = [x + (random() - 0.5) * 6, y + (random() - 0.5) * 4, t.bottom * (0.3 + random() * 0.15)];
    const foot = [x, y, -1];
    Tapered(mesh, Curve(foot, Lerp(foot, fork, 0.5), fork, TRUNK.points), TRUNK.radius * TRUNK.flare, TRUNK.radius, TRUNK.sides);
    // A knuckle round the foot where it meets the ground.
    mesh.Tube([[x, y, -1], [x, y, 1.2]], TRUNK.radius * TRUNK.flare * 1.15, TRUNK.sides, "vinyl", false);
    const reach = LENGTH / t.plants;
    for (let b = 0; b < t.branches; b++) {
        // Fanned along the hedge and across it.
        const along = (b / (t.branches - 1) - 0.5) * reach * (0.8 + random() * 0.3);
        const across = (b % 2 ? 1 : -1) * t.depth * (0.15 + random() * 0.15);
        const end = [fork[0] + along, fork[1] + across, t.bottom + BRANCH.into + random() * 4];
        const bend = [fork[0] + along * 0.25, fork[1] + across * 0.6, (fork[2] + end[2]) / 2 - 2];
        const path = Curve(fork, bend, end, BRANCH.points);
        Tapered(mesh, path, BRANCH.radius, BRANCH.radius * BRANCH.tip, BRANCH.sides);
        // Twigs: off the branch partway up, ending under the foliage or in it.
        for (let k = 0; k < t.twigs; k++) {
            if (random() < 0.3) continue;
            const from = path[1 + Math.floor(random() * (path.length - 2))];
            // Mostly sideways (along the hedge or out of it) and only a little up: they show in the gap.
            const out = V3.Unit([(random() - 0.5) * 2, Math.sign(across) * (0.3 + random() * 0.7), 0.3 + random() * 0.5]);
            const len = TWIG.length[0] + random() * (TWIG.length[1] - TWIG.length[0]);
            const tip = V3.Add(from, V3.Scale(out, len));
            const kink = V3.Add(V3.Add(from, V3.Scale(out, len * 0.5)), [0, 0, -len * 0.12]);
            Tapered(mesh, Curve(from, kink, tip, TWIG.points), TWIG.radius, TWIG.radius * TWIG.tip, TWIG.sides);
        }
    }
}

function BuildBranches(t, mesh) {
    const random = SeededRandom(t.seed);
    const reach = LENGTH / t.plants;
    for (let i = 0; i < t.plants; i++) {
        const x = reach * (i + 0.5) + (random() - 0.5) * reach * 0.25;
        Plant(mesh, t, x, (i % 2 ? 1 : -1) * t.depth * (0.08 + random() * 0.12), random); // front and back by turns: a thicket
    }
    mesh.Extrude(Shape(ChamferedRect(LENGTH / 2, 0, LENGTH, t.depth * 0.5 + 2 * STRIP.out, STRIP.chamfer)), 0, STRIP.height, "dark", "z");
}

const materials = {
    vinyl: VINYL_MATERIAL,
    ...Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/${NAME}_${part}.vmat`])),
};

/** Writes one model (+ its collision if `physics` has any). */
function WriteModel(name, mesh, physics) {
    const obj = `${MODEL_DIR}/${name}.obj`;
    const physicsObj = physics.triangleCount ? `${MODEL_DIR}/${name}_physics.obj` : undefined;
    WriteAddonFile(obj, ObjText(mesh, NAME, GENERATOR));
    if (physicsObj) WriteAddonFile(physicsObj, ObjText(physics, NAME, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name: NAME, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles${physicsObj ? ` (collision ${physics.triangleCount})` : ""}`);
}

const branches = new Mesh(64);
BuildBranches(BRANCHES, branches);
WriteModel(`${NAME}_branches`, branches, new Mesh());
console.log(`the branches: under every hedge, showing up to ${BRANCHES.bottom}`);
for (const t of VARIANTS) {
    const mesh = new Mesh(64), physics = new Mesh();
    BuildFoliage(t, mesh, physics);
    WriteModel(`${NAME}_foliage${t.suffix}`, mesh, physics);
    const top = Math.max(t.top, ...(t.pillows ?? []).map(p => p.at[2] + p.h), ...(t.balls ?? []).map(b => t.top + BALL_GAP + 2 * b.r));
    console.log(`the ${t.label} hedge: ${mesh.triangleCount + branches.triangleCount} triangles with the branches, ${LENGTH} long, ${t.depth} deep, ${top.toFixed(0)} high`);
}
for (const [part, rgb] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/${NAME}_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint: 0 }));
}
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/${NAME}_{branches,foliage<suffix>}.vmdl"`);
