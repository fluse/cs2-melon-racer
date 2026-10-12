// Builds the beds the inflatable trees (make-tree-model.mjs) stand in, so they
// don't stand bare on the concrete — `node tools/models/make-tree-bed-model.mjs`:
//   wall    a low round wall of curved stone blocks with chamfered tops and
//           a joint between each two (solid)
//   fence   a little picket fence round the bed: posts with pointed caps, two
//           rails, pointed pickets — standing on the wall (fence) or on the
//           floor without one (fence_ground) (solid, a thin ring)
//   fill    the bed's ground inside, a low mound up to the wall: bark mulch
//           (mulch) or grass (grass), the same mesh (solid: melons that jump
//           in land on it). The tree's foot plate and stakes sink into it,
//           its guy ropes run into the ground.
// Mix them freely: wall + fill, wall + fence + fill, fence_ground + fill.
// Every piece around the tree's own origin (its foot, on the floor): place
// them at the tree's spot. Sized for every tree variant: the widest one's
// stakes (52 out) are inside the wall.
// Hard parts, not inflatable, so flat-shaded where they're cut; the stone
// and the fence's wood are light and tinted per prop (render color), the fill
// isn't.
// Writes models/melon_racer/tree/tree_bed_<piece>.vmdl (+ .obj, _physics.obj)
// and materials/melon_racer/tree/tree_bed_{stone,wood,mulch,grass}.vmat (+ _color.png).
// Compile the .vmdl files with resourcecompiler (see the output).
import { Mesh, ObjText, SolidPng, V3, VmatText, VmdlText, WriteAddonFile } from "../lib/model.mjs";

// --- Wall ---
const BED_RADIUS = 60; // the wall's inside: clear of every tree's stakes
const WALL_THICKNESS = 8;
const WALL_HEIGHT = 10;
const WALL_CHAMFER = 1.5; // its top edges, both sides
const WALL_BLOCKS = 12;
const WALL_JOINT = 0.8; // units between two blocks
const WALL_STEPS = 3; // arc pieces per block
const WALL_MID = BED_RADIUS + WALL_THICKNESS / 2;

// --- Fence (on the wall's middle, or on the floor at the same radius) ---
const FENCE_POSTS = 8;
const POST_SIZE = 2.6; // square
const POST_HEIGHT = 18; // to the cap's foot
const POST_CAP = 2; // the pointed cap's height
const PICKET_SPACING = 9; // along the ring, roughly
const PICKET_WIDTH = 2.6;
const PICKET_THICKNESS = 1;
const PICKET_HEIGHT = 15; // to the tip
const PICKET_POINT = 1.8; // the pointed top's height
const RAILS = [4, 11]; // heights over the fence's foot
const RAIL_SIZE = [1, 1.8]; // radial, vertical
const RAIL_STEPS = 16; // round the ring
const GROUND_SINK = 2; // fence_ground's posts and pickets this far into the floor

// --- Fill ---
const FILL_TOP = 4; // at the wall
const FILL_MOUND = 2; // higher in the middle
const FILL_RINGS = [0, 18, 36, 50, BED_RADIUS + 1]; // into the wall a little
const FILL_SIDES = 24;

const PHYSICS_STEPS = 16; // the collision rings' pieces

const COLORS = {
    stone: { rgb: [0xd6, 0xd1, 0xc6], tint: 1 }, // light sandstone, tinted per prop
    wood: { rgb: [0xf2, 0xf0, 0xea], tint: 1 }, // white painted, tinted per prop
    mulch: { rgb: [0x4a, 0x33, 0x24], tint: 0 },
    grass: { rgb: [0x5a, 0x94, 0x38], tint: 0 }, // a natural green, darker than the palette's guide green
};

const MODEL_DIR = "models/melon_racer/tree";
const MATERIAL_DIR = "materials/melon_racer/tree";
const GENERATOR = "tools/models/make-tree-bed-model.mjs";

const Ring = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];
const Centroid = pts => V3.Scale(pts.reduce(V3.Add), 1 / pts.length);

/** A flat convex polygon (3D points) as a fan of flat triangles, turned to face `outward`. */
function Face(mesh, pts, outward, part) {
    const n = V3.Cross(V3.Sub(pts[1], pts[0]), V3.Sub(pts[2], pts[0]));
    const ordered = V3.Dot(n, outward) >= 0 ? pts : [...pts].reverse();
    for (let i = 1; i + 1 < ordered.length; i++) mesh.Tri(ordered[0], ordered[i], ordered[i + 1], part);
}

/** A prism: the flat polygon `front` (3D) and its copy moved by `depth`, joined by sides; `open` side indices left out. */
function Prism(mesh, front, depth, part, { open = [] } = {}) {
    const back = front.map(p => V3.Add(p, depth));
    const mid = Centroid([...front, ...back]);
    Face(mesh, front, V3.Sub(Centroid(front), mid), part);
    Face(mesh, back, V3.Sub(Centroid(back), mid), part);
    front.forEach((p, i) => {
        if (open.includes(i)) return;
        const q = front[(i + 1) % front.length];
        const quad = [p, q, back[(i + 1) % front.length], back[i]];
        Face(mesh, quad, V3.Sub(Centroid(quad), mid), part);
    });
}

/**
 * A profile ([r, z] points, a closed loop) swept round the Z axis from a0 to
 * a1 in `steps`: smooth along the arc, hard where the profile turns; with
 * `ends` both ends closed flat.
 */
function Revolve(mesh, profile, a0, a1, steps, part, { ends = false } = {}) {
    const mid = Centroid(profile.map(([r, z]) => [r, z, 0]));
    const At = k => a0 + ((a1 - a0) * k) / steps;
    profile.forEach((p, i) => {
        const q = profile[(i + 1) % profile.length];
        if (p[0] === q[0] && p[1] === q[1]) return;
        const grid = [p, q].map(([r, z]) => Array.from({ length: steps + 1 }, (_, k) => Ring(r, At(k), z)));
        const am = (a0 + a1) / 2;
        mesh.Surface(grid, part, { away: Ring(mid[0], am, mid[1]), uvScale: [(Math.abs(a1 - a0) * p[0]) / mesh.uvTile, 1 / 8] });
    });
    if (!ends) return;
    for (const [a, dir] of [[a0, -1], [a1, 1]]) {
        const tangent = [-Math.sin(a) * dir, Math.cos(a) * dir, 0];
        const pts = profile.map(([r, z]) => Ring(r, a, z));
        // The profile may not be convex in general; the wall's is.
        Face(mesh, pts, tangent, part);
    }
}

function BuildWall(mesh, physics) {
    const ri = BED_RADIUS, ro = BED_RADIUS + WALL_THICKNESS, h = WALL_HEIGHT, c = WALL_CHAMFER;
    const profile = [[ri, -1], [ro, -1], [ro, h - c], [ro - c, h], [ri + c, h], [ri, h - c]];
    const joint = WALL_JOINT / WALL_MID;
    for (let b = 0; b < WALL_BLOCKS; b++) {
        const a0 = (2 * Math.PI * b) / WALL_BLOCKS + joint / 2, a1 = (2 * Math.PI * (b + 1)) / WALL_BLOCKS - joint / 2;
        // The bottom is in the floor: no face there.
        Revolve(mesh, profile, a0, a1, WALL_STEPS, "stone", { ends: true });
    }
    Revolve(physics, [[ri, 0], [ro, 0], [ro, h], [ri, h]], 0, 2 * Math.PI, PHYSICS_STEPS, "stone");
}

function BuildFence(z0) {
    return (mesh, physics) => {
        const foot = z0 > 0 ? z0 : -GROUND_SINK;
        const r = WALL_MID;
        // Posts: a square, its faces along and across the ring, with a pointed cap.
        for (let i = 0; i < FENCE_POSTS; i++) {
            const a = (2 * Math.PI * i) / FENCE_POSTS;
            const radial = [Math.cos(a), Math.sin(a), 0], along = [-Math.sin(a), Math.cos(a), 0];
            const C = (u, v, z) => V3.Add(V3.Add(V3.Scale(radial, r + u), V3.Scale(along, v)), [0, 0, z]);
            const s = POST_SIZE / 2, top = z0 + POST_HEIGHT;
            Prism(mesh, [C(-s, -s, foot), C(s, -s, foot), C(s, s, foot), C(-s, s, foot)], [0, 0, top - foot], "wood");
            const corners = [C(-s, -s, top), C(s, -s, top), C(s, s, top), C(-s, s, top)], tip = C(0, 0, top + POST_CAP);
            corners.forEach((p, k) => {
                const q = corners[(k + 1) % 4];
                Face(mesh, [p, q, tip], V3.Sub(Centroid([p, q, tip]), C(0, 0, top)), "wood");
            });
        }
        // Pickets between the posts, standing just outside the rails.
        const gap = (2 * Math.PI) / FENCE_POSTS;
        const perGap = Math.max(1, Math.round((gap * r) / PICKET_SPACING) - 1);
        const pr = r + RAIL_SIZE[0] / 2 + PICKET_THICKNESS / 2;
        for (let i = 0; i < FENCE_POSTS; i++)
            for (let k = 1; k <= perGap; k++) {
                const a = gap * (i + k / (perGap + 1));
                const radial = [Math.cos(a), Math.sin(a), 0], along = [-Math.sin(a), Math.cos(a), 0];
                const C = (v, z) => V3.Add(V3.Add(V3.Scale(radial, pr - PICKET_THICKNESS / 2), V3.Scale(along, v)), [0, 0, z]);
                const w = PICKET_WIDTH / 2, shoulder = z0 + PICKET_HEIGHT - PICKET_POINT;
                // Its bottom stands on the wall or in the floor: no face there.
                Prism(mesh, [C(-w, foot), C(w, foot), C(w, shoulder), C(0, z0 + PICKET_HEIGHT), C(-w, shoulder)], V3.Scale(radial, PICKET_THICKNESS), "wood", { open: [0] });
            }
        // Rails, all the way round (the posts cover where they pass).
        const [rw, rh] = RAIL_SIZE;
        for (const z of RAILS) Revolve(mesh, [[r - rw / 2, z0 + z - rh / 2], [r + rw / 2, z0 + z - rh / 2], [r + rw / 2, z0 + z + rh / 2], [r - rw / 2, z0 + z + rh / 2]], 0, 2 * Math.PI, RAIL_STEPS, "wood");
        // Collision: a thin ring as high as the pickets.
        Revolve(physics, [[r - 1.5, z0], [r + 1.5, z0], [r + 1.5, z0 + PICKET_HEIGHT], [r - 1.5, z0 + PICKET_HEIGHT]], 0, 2 * Math.PI, PHYSICS_STEPS, "wood");
    };
}

function BuildFill(part) {
    return (mesh, physics) => {
        const Height = r => FILL_TOP + FILL_MOUND * (1 - (Math.min(r, BED_RADIUS) / BED_RADIUS) ** 2);
        const grid = FILL_RINGS.map(r => Array.from({ length: FILL_SIDES + 1 }, (_, k) => Ring(r, (2 * Math.PI * k) / FILL_SIDES, Height(r))));
        mesh.Surface(grid, part, { away: [0, 0, -1000], wrap: true, uvScale: [4, 1] });
        // Its edge down to the floor, in case it's used without the wall.
        const edge = FILL_RINGS.at(-1);
        const side = [0, Height(edge)].map(z => Array.from({ length: FILL_SIDES + 1 }, (_, k) => Ring(edge, (2 * Math.PI * k) / FILL_SIDES, z)));
        mesh.Surface(side, part, { away: [0, 0, FILL_TOP / 2], wrap: true, uvScale: [4, 1 / 16] });
        // Collision: a flat disc at the edge's height, with its side.
        Revolve(physics, [[0, 0], [edge, 0], [edge, FILL_TOP], [0, FILL_TOP]], 0, 2 * Math.PI, PHYSICS_STEPS, part);
    };
}

const PIECES = [
    { piece: "wall", Build: BuildWall },
    { piece: "fence", Build: BuildFence(WALL_HEIGHT) },
    { piece: "fence_ground", Build: BuildFence(0) },
    { piece: "mulch", Build: BuildFill("mulch") },
    { piece: "grass", Build: BuildFill("grass") },
];
const materials = Object.fromEntries(Object.keys(COLORS).map(part => [part, `${MATERIAL_DIR}/tree_bed_${part}.vmat`]));
for (const { piece, Build } of PIECES) {
    const mesh = new Mesh(64);
    const physics = new Mesh();
    Build(mesh, physics);
    const name = `tree_bed_${piece}`;
    const obj = `${MODEL_DIR}/${name}.obj`;
    const physicsObj = `${MODEL_DIR}/${name}_physics.obj`;
    WriteAddonFile(obj, ObjText(mesh, name, GENERATOR));
    WriteAddonFile(physicsObj, ObjText(physics, name, GENERATOR));
    WriteAddonFile(`${MODEL_DIR}/${name}.vmdl`, VmdlText({ name, mesh: obj, physicsObj, materials: Object.fromEntries(Object.keys(mesh.tris).map(p => [p, materials[p]])) }));
    console.log(`  ${name}.vmdl: ${mesh.triangleCount} triangles (collision ${physics.triangleCount})`);
}
for (const [part, { rgb, tint }] of Object.entries(COLORS)) {
    const texture = `${MATERIAL_DIR}/tree_bed_${part}_color.png`;
    WriteAddonFile(texture, SolidPng(rgb));
    WriteAddonFile(materials[part], VmatText({ texture, generator: GENERATOR, tint }));
}
console.log(`the bed: ${2 * (BED_RADIUS + WALL_THICKNESS)} across, the wall ${WALL_HEIGHT} high, the fence ${PICKET_HEIGHT} over its foot (on the wall: ${WALL_HEIGHT + PICKET_HEIGHT} over the floor)`);
console.log(`compile: game/bin/win64/resourcecompiler.exe -game csgo -addon melon_racer -i "<content path>/${MODEL_DIR}/tree_bed_<piece>.vmdl"`);
