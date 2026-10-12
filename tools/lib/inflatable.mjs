// Shared by the inflatable event structures (make-hub-gate-model.mjs,
// make-pavilion-model.mjs): a fat vinyl tube in segments with pinched seams
// and a strap around each, a foot (a squashed ring on a base plate), a guy
// rope to a stake, and the blower that keeps it all up — so every inflatable
// in the hub is built from the same parts and looks the same. And the
// faceted inflatables (make-rock-model.mjs, make-mountain-model.mjs): a
// convex polytope cut by seeded random planes, each face a vinyl panel
// puffed out between pinched seams on its edges.
import { ChamferedRect, SeededRandom, Shape, V3 } from "./model.mjs";

/** cos / sin raised to `e`, keeping the sign: a superellipse's coordinates. */
const SuperCos = (a, e) => Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** e;
const SuperSin = (a, e) => Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** e;

/**
 * A soft inflatable block: a superellipsoid around `center` with half-sizes
 * `half` ([x, y, z]); `round` (0..1) how round its edges are — small: a box
 * with rounded edges and faces bulging a little, 1: an ellipsoid. `top` and
 * `side`: its roundness up/down and around (default `round`). `rows` pole
 * to pole, `cols` around.
 */
export function InflatableBlock(mesh, { center, half, round, top = round, side = round, rows, cols, part }) {
    const grid = Array.from({ length: rows + 1 }, (_, i) => {
        const phi = -Math.PI / 2 + (Math.PI * i) / rows;
        return Array.from({ length: cols + 1 }, (_, j) => {
            const theta = -Math.PI + (2 * Math.PI * (j % cols)) / cols;
            const r = SuperCos(phi, top);
            return [center[0] + half[0] * r * SuperCos(theta, side), center[1] + half[1] * r * SuperSin(theta, side), center[2] + half[2] * SuperSin(phi, top)];
        });
    });
    mesh.Surface(grid, part, { away: center, wrap: true });
}

/**
 * The outline of InflatableBlock's cross-section at height `z` (its middle
 * by default, the widest), grown by `grow`, `points` round, counter-clockwise.
 */
export function BlockOutline({ center, half, round, top = round, side = round }, grow, points, z = center[2]) {
    // How far in the block has rounded at that height: sin(phi)^top = height share, cos(phi)^top = width share.
    const k = Math.min(1, Math.abs(z - center[2]) / half[2]);
    const share = Math.cos(Math.asin(k ** (1 / top))) ** top;
    return Array.from({ length: points }, (_, j) => {
        const theta = -Math.PI + (2 * Math.PI * j) / points;
        return [center[0] + (half[0] * share + grow) * SuperCos(theta, side), center[1] + (half[1] * share + grow) * SuperSin(theta, side)];
    });
}

/**
 * A pillow: an ellipsoid lathed around its vertical axis (`r` across, `h`
 * up, half-axes, around `at`), a soft seam pinched round its middle by
 * `seamDepth` over `seamWidth` (radians) — the trees' crowns, the hedges' tops.
 */
export function Pillow(mesh, { at, r, h }, { sides, rings, seamDepth, seamWidth, part }) {
    const angles = Array.from({ length: rings + 1 }, (_, i) => (Math.PI * i) / rings);
    // An extra pair of rings either side of the seam, so the pinch shows.
    const near = seamWidth * 0.6;
    angles.push(Math.PI / 2 - near, Math.PI / 2 + near, Math.PI / 2);
    const sorted = [...new Set(angles.map(a => +a.toFixed(6)))].sort((a, b) => a - b);
    const Pinch = a => 1 - seamDepth * Math.exp(-(((a - Math.PI / 2) / seamWidth) ** 2));
    const centers = sorted.map(a => [at[0], at[1], at[2] - h * Math.cos(a)]);
    mesh.Tube(centers, i => r * Math.sin(sorted[i]) * Pinch(sorted[i]), sides, part, false, { slopedNormals: true });
}

/** A polyline as a path by length: { length, At(s) } — the point s units along it. */
export function PolylinePath(points) {
    const along = [0];
    for (let i = 1; i < points.length; i++) along.push(along[i - 1] + Math.hypot(...points[i].map((n, k) => n - points[i - 1][k])));
    const At = s => {
        let i = 1;
        while (i < points.length - 1 && along[i] < s) i++;
        const k = Math.min(1, Math.max(0, (s - along[i - 1]) / (along[i] - along[i - 1] || 1)));
        return points[i - 1].map((n, j) => n + (points[i][j] - n) * k);
    };
    return { length: along.at(-1), At };
}

/**
 * A tube along `At(s)` (0..length) in `segments` equal segments, each end
 * between two pinched to `seam.radius` of the tube and rounded back out over
 * `seam.rounding` units (rings at `seam.rings`), a strap (`strap`) around
 * each seam; the path's own ends aren't pinched (they sit in a foot or a
 * crown). Rings every `step` units mid-segment, plus at each of `bends`
 * (lengths where the path turns sharply). No end caps: every end is hidden
 * — inside the next segment's pinched end, or in a foot or crown.
 */
export function SegmentedTube(mesh, { At, length, bends = [], segments, radius, sides, step, seam, strap, part }) {
    const SeamRadius = d => {
        const k = Math.min(1, d / seam.rounding);
        return radius * (seam.radius + (1 - seam.radius) * Math.sqrt(1 - (1 - k) ** 2));
    };
    const each = length / segments;
    for (let i = 0; i < segments; i++) {
        const s0 = i * each, s1 = (i + 1) * each;
        const seamStart = i > 0, seamEnd = i < segments - 1;
        const at = new Set([s0, s1]);
        if (seamStart) for (const d of seam.rings) at.add(s0 + d);
        if (seamEnd) for (const d of seam.rings) at.add(s1 - d);
        const inner0 = seamStart ? s0 + seam.rounding : s0, inner1 = seamEnd ? s1 - seam.rounding : s1;
        const steps = Math.max(1, Math.round((inner1 - inner0) / step));
        for (let k = 1; k < steps; k++) at.add(inner0 + ((inner1 - inner0) * k) / steps);
        for (const bend of bends) if (bend > s0 && bend < s1) at.add(bend);
        const rings = [...at].sort((a, b) => a - b);
        const Radius = k => Math.min(seamStart ? SeamRadius(rings[k] - s0) : radius, seamEnd ? SeamRadius(s1 - rings[k]) : radius);
        mesh.Tube(rings.map(At), Radius, sides, part, false, { slopedNormals: true });
        // The strap around the seam; its ends are inside the tube, so no caps.
        if (seamEnd) mesh.Tube([s1 - strap.halfWidth, s1 + strap.halfWidth].map(At), strap.radius, sides, strap.part, false);
    }
}

/**
 * A ring lathed around the vertical line through (x, y) from z0, `height`
 * high, its outside rounded like a pool ring's (`radius` outside), closed top
 * and bottom — a foot, or a crown on top.
 */
export function SquashedRing(mesh, x, y, z0, { radius, height, rings, sides, part }) {
    const half = height / 2, inner = radius - half;
    const angles = Array.from({ length: rings + 1 }, (_, i) => -Math.PI / 2 + (Math.PI * i) / rings);
    mesh.Tube(angles.map(a => [x, y, z0 + half + half * Math.sin(a)]), i => inner + half * Math.cos(angles[i]), sides, part, true, { slopedNormals: true });
}

/** A foot: a base plate with a squashed ring on it, under (x, y). */
export function InflatableFoot(mesh, x, y, { plateRadius, plateHeight, platePart, ...ring }) {
    mesh.Extrude(Shape(ChamferedRect(x, y, 2 * plateRadius, 2 * plateRadius, plateRadius * 0.6)), 0, plateHeight, platePart, "z");
    SquashedRing(mesh, x, y, plateHeight, ring);
}

/** A guy rope from `from` (3D) down to a stake in the ground at `stake` (x, y). */
export function GuyRope(mesh, from, stake, { ropeRadius, ropePart, stakeRadius, stakeHeight, stakePart }) {
    mesh.Tube([from, [...stake, stakeHeight - 0.6]], ropeRadius, 4, ropePart, false);
    mesh.Tube([[...stake, -1], [...stake, stakeHeight]], stakeRadius, 6, stakePart);
}

/** The loop a guy rope is tied with: a band around a vertical tube at (x, y, z). */
export function RopeLoop(mesh, x, y, z, radius, sides, part) {
    mesh.Tube([[x, y, z - 1], [x, y, z + 1]], radius + 0.3, sides, part, false);
}

/**
 * The blower: a box on the ground centered on `at` (x, y), its front facing
 * `into` (x, y, z — where the duct ends, inside a foot), a fan housing and
 * intake ring on its back, and a fabric duct from its front down over the
 * ground into `into`. The box goes into `physics` too.
 */
export function Blower(mesh, physics, { at, into, size: [sx, sy, sz], ductRadius, ductLow, boxPart, ringPart, ductPart }) {
    const len = Math.hypot(into[0] - at[0], into[1] - at[1]);
    const d = [(into[0] - at[0]) / len, (into[1] - at[1]) / len];
    const P = (a, z) => [at[0] + d[0] * a, at[1] + d[1] * a, z];
    const box = ChamferedRect(0, 0, sx, sy, 1.5).map(([u, v]) => [at[0] + u * d[0] - v * d[1], at[1] + u * d[1] + v * d[0]]);
    for (const m of [mesh, physics]) m.Extrude(Shape(box), 0, sz, boxPart, "z");
    mesh.Tube([P(-sx / 2 + 0.5, sz / 2), P(-sx / 2 - 1.5, sz / 2)], 4, 12, boxPart);
    mesh.Tube([P(-sx / 2 - 1.5, sz / 2), P(-sx / 2 - 2, sz / 2)], 3, 12, ringPart);
    mesh.Tube([P(sx / 2 - 1, sz / 2), P(sx / 2 + 4, sz / 2 - 0.5), P(sx / 2 + 9, ductLow), into], ductRadius, 10, ductPart, false);
}

// --- Faceted inflatables: a polytope sewn from puffed panels ---

/**
 * The planes ({ n, d }: n . x <= d) a faceted inflatable is cut by, the floor
 * (`sink` under the origin) first: `count` more whose normals spread evenly
 * over an ellipsoid (half-sizes `half`, its middle `lift` up), down to
 * `minZ`, each turned up to `angleJitter` radians off its place and moved
 * in or out by up to `depthJitter` (a share) — by the random of `seed`, so
 * every run cuts the same shape.
 */
export function PolytopePlanes({ half, lift, seed }, { count, minZ, angleJitter, depthJitter, sink }) {
    const random = SeededRandom(seed);
    const center = [0, 0, lift];
    const planes = [{ n: [0, 0, -1], d: sink, floor: true }];
    // Even directions over the sphere down to minZ (a Fibonacci spiral, turned by the seed).
    const turn = random() * 2 * Math.PI;
    const dirs = Array.from({ length: count }, (_, i) => {
        const z = 1 - ((1 - minZ) * (i + 0.5)) / count;
        const r = Math.sqrt(1 - z * z), a = turn + i * Math.PI * (3 - Math.sqrt(5));
        return [r * Math.cos(a), r * Math.sin(a), z];
    });
    for (const dir of dirs) {
        // Turned a little off its place, then onto the ellipsoid: its point and the normal there.
        const kick = V3.Unit([random() - 0.5, random() - 0.5, random() - 0.5]);
        const u = V3.Unit(V3.Add(dir, V3.Scale(kick, angleJitter)));
        if (u[2] < minZ) u[2] = minZ;
        const p = V3.Add(center, [u[0] * half[0], u[1] * half[1], u[2] * half[2]]);
        const n = V3.Unit([u[0] / half[0], u[1] / half[1], u[2] / half[2]]);
        const d = V3.Dot(n, center) + V3.Dot(n, V3.Sub(p, center)) * (1 + depthJitter * (2 * random() - 1));
        planes.push({ n, d });
    }
    return planes;
}

/** The point where three planes meet, or null if they don't in one point. */
function Meet(a, b, c) {
    const bc = V3.Cross(b.n, c.n), det = V3.Dot(a.n, bc);
    if (Math.abs(det) < 1e-9) return null;
    return V3.Scale(V3.Add(V3.Add(V3.Scale(bc, a.d), V3.Scale(V3.Cross(c.n, a.n), b.d)), V3.Scale(V3.Cross(a.n, b.n), c.d)), 1 / det);
}

/**
 * The convex polytope the planes cut: one face per plane that has one, its
 * corners counter-clockwise seen from outside — [{ plane, corners, mid }].
 */
export function Polytope(planes) {
    const corners = [];
    for (let i = 0; i < planes.length; i++)
        for (let j = i + 1; j < planes.length; j++)
            for (let k = j + 1; k < planes.length; k++) {
                const p = Meet(planes[i], planes[j], planes[k]);
                if (!p || planes.some(q => V3.Dot(q.n, p) > q.d + 1e-6)) continue;
                if (!corners.some(c => Math.hypot(...V3.Sub(c, p)) < 1e-4)) corners.push(p);
            }
    return planes.map(plane => {
        const on = corners.filter(c => Math.abs(V3.Dot(plane.n, c) - plane.d) < 1e-4);
        if (on.length < 3) return null;
        const mid = V3.Scale(on.reduce(V3.Add), 1 / on.length);
        const e1 = V3.Unit(V3.Cross(plane.n, Math.abs(plane.n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
        const e2 = V3.Cross(plane.n, e1);
        const Angle = c => Math.atan2(V3.Dot(V3.Sub(c, mid), e2), V3.Dot(V3.Sub(c, mid), e1));
        return { plane, corners: on.sort((a, b) => Angle(a) - Angle(b)), mid };
    }).filter(Boolean);
}

/** A panel's puff: how far its middle bulges out — `share` of its inner radius, at most `max`. */
export function PanelPuff({ corners, mid }, { share, max }) {
    const inner = Math.min(...corners.map((c, i) => {
        const next = corners[(i + 1) % corners.length];
        const edge = V3.Unit(V3.Sub(next, c)), to = V3.Sub(mid, c);
        return Math.hypot(...V3.Sub(to, V3.Scale(edge, V3.Dot(to, edge))));
    }));
    return Math.min(max, share * inner);
}

/** How far out a panel bulges at t (0 at its seam, 1 in its middle): rising fast from the seam (sin^round). */
export const PuffLift = (puff, t, round) => puff * Math.sin((t * Math.PI) / 2) ** round;

/**
 * One panel: `rings` rings from its seam (flat, on the polytope's edges, cut
 * into pieces of about `edgeStep`) to its middle, bulged out by `puff`
 * ({ share, max, round }).
 */
export function Panel(mesh, face, { edgeStep, rings, puff: puffOptions, part }) {
    const { plane, corners, mid } = face;
    const seam = corners.flatMap((c, i) => {
        const next = corners[(i + 1) % corners.length];
        const pieces = Math.max(1, Math.round(Math.hypot(...V3.Sub(next, c)) / edgeStep));
        return Array.from({ length: pieces }, (_, k) => V3.Add(c, V3.Scale(V3.Sub(next, c), k / pieces)));
    });
    seam.push(seam[0]); // Surface's wrap: the last column is the first again
    const puff = PanelPuff(face, puffOptions);
    const grid = Array.from({ length: rings + 1 }, (_, r) => {
        const t = r / rings, lift = PuffLift(puff, t, puffOptions.round);
        return seam.map(p => V3.Add(V3.Add(p, V3.Scale(V3.Sub(mid, p), t)), V3.Scale(plane.n, lift)));
    });
    const perimeter = seam.slice(1).reduce((s, p, i) => s + Math.hypot(...V3.Sub(p, seam[i])), 0);
    mesh.Surface(grid, part, { away: V3.Sub(mid, V3.Scale(plane.n, 1000)), wrap: true, uvScale: [perimeter / mesh.uvTile, puff / 4] });
}

/** The collision: the polytope, its panels' planes moved out by `grow` (a share) of their puff — convex, a few dozen triangles. */
export function PolytopeCollision(physics, planes, faces, grow, puffOptions, part) {
    const grown = planes.map(plane => {
        const face = faces.find(f => f.plane === plane);
        return { ...plane, d: plane.d + (face && !plane.floor ? grow * PanelPuff(face, puffOptions) : 0) };
    });
    for (const { corners } of Polytope(grown))
        for (let i = 1; i + 1 < corners.length; i++) physics.Tri(corners[0], corners[i], corners[i + 1], part);
}

/** The panel whose outward normal is closest to `dir` (horizontal), and the point on its plane at height z straight out that way. */
export function SidePoint(faces, dir, z) {
    const side = faces.filter(f => !f.plane.floor).reduce((a, b) => (V3.Dot(b.plane.n, dir) > V3.Dot(a.plane.n, dir) ? b : a));
    const { n, d } = side.plane;
    // Along dir from the vertical axis at height z until the plane: n . (s dir + z up) = d.
    const s = (d - n[2] * z) / (n[0] * dir[0] + n[1] * dir[1]);
    return { point: [dir[0] * s, dir[1] * s, z], n, face: side };
}
