// The tutorial stations (src/melon_drive/tutorial/, GAMEPLAY.md "Tutorial
// stations"): two halls side by side, each a row of rooms along +X, one room
// per station, in the old tutorial's look (concrete walls and floor, glowing
// green trims). Every step of a station has its own section in its room: a
// glowing line across the floor where it starts and the step's number and
// text lying on the floor just past it — the same number and text as the HUD card, read
// from TUTORIAL_STATIONS. This writes the blockout — rooms, the stations'
// obstacles, every trigger, spawn, ghost path and world text — as
// maps/prefabs/tutorial_stations_course.vmap (overwritten on every run:
// change the layout here, not in Hammer), and once, if it's missing,
// maps/prefabs/tutorial_stations.vmap with that prefab placed in it
// (lighting, decoration and Hammer work go there).
// `node tools/maps/make-tutorial-prefab.mjs`
//
// Frame: the floor at z 0. Hall A (the entrance, stations 1-3) along +X at
// y = 0, hall B (stations 4-6) beside it at y = HALL_B_Y — both y -384..384
// inside, around their own middle. Station 3's end and hall B's start are
// joined by teleporters (one long hall wouldn't fit the map's +-16384).
// Each station: its trigger tutorial_station_<id> over the whole room
// (tutorial_enter/tutorial_leave), its spawn tutorial_spawn_<id> by the door
// it's entered through, its goals tutorial_goal_<id>_<goal>
// (docs/mapping-api/25-tutorial-stations.md). Guide marks on the floor are one
// non-solid func_brush, so a melon rolls over them without a bump.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Vmap, BoxPolygons, SCRIPT_ENTITY } from "../lib/vmap.mjs";
import { TUTORIAL_STATIONS } from "../../src/melon_drive/tutorial/constants.js";

const COURSE_FILE = "maps/prefabs/tutorial_stations_course.vmap";
const ROUTE_FILE = "maps/prefabs/tutorial_stations.vmap";

const MATERIALS = {
    floor: "materials/concrete/vertigo_concretefloorc.vmat",
    wall: "materials/concrete/vertigo_concretewallb.vmat",
    wall2: "materials/concrete/hr_c/hr_concrete_wall_006.vmat", // every other wall panel
    block: "materials/concrete/hr_c/hr_concrete_wall_001.vmat",
    glow: "materials/glowgreen.vmat", // the guides: floor marks, gates, edges to land on
    wallGlow: "materials/glowblue.vmat", // the architecture's lights: walls, pillars, doorways
    accent: "materials/glowviolet.vmat", // the crash wall and the teleporter portals
};

const HALF_WIDTH = 384; // a hall's inside, y -HALF_WIDTH..HALF_WIDTH round its middle
const WALL = 32; // wall thickness
const WALL_HEIGHT = 448; // the halls' walls: over the tower (320) plus a jump (~85); higher only where a melon gets higher (TALL_WALLS)
const TRIGGER_TOP = 768; // station triggers reach this high
// The side walls are built in panels SEGMENT long, a pillar with a glowing
// strip between each two, a plinth with a glowing edge, a cornice on top, the
// panels alternating two concretes — kept plain on purpose (more detail was
// tried and looked busy). Where an obstacle hugs the
// wall (WALL_PLAIN: the climbing shaft, the tower) the panel stays flat.
const SEGMENT = 512;
const PILLAR = { half: 32, depth: 24, over: 24 }; // 64 wide, 24 out of the wall, 24 over its top
const PLINTH = { height: 24, depth: 8 };
const CORNICE = { height: 16, depth: 16 };
const DOOR_HALF = 160; // doorways between rooms, y -DOOR_HALF..DOOR_HALF
const DOOR_HEIGHT = 256;
const SPAWN_Z = 16; // info_targets just over the floor (the script traces down to it)
const GHOST_Z = 8; // the ghost melon's origin over the floor
// Section signs lie on the floor: just past the start line, a hair over the
// floor marks (1 high), letters FLOOR_TEXT_SIZE * 0.25 = ~22 units tall.
const FLOOR_TEXT_GAP = 48;
const FLOOR_TEXT_Z = 2;
const FLOOR_TEXT_SIZE = 88;
const HALL_B_Y = 1280; // hall B's middle
const SHIFT_X = -6400; // hall A centred on the prefab's origin

// Wall jumps: 240 u/s up (WALL_JUMP_UP_SPEED: ~0.3 s to the top of the hop),
// 160 u/s off the wall (WALL_JUMP_PUSH_SPEED) — 64 apart the melon (~14 wide)
// is at the other wall at the top of its hop and jumps on from there.
const CORRIDOR_GAP = 64;
const CLIMB_HEIGHT = 224; // the shelf on top: some 6-7 wall jumps up (~35 a hop)

const map = new Vmap(COURSE_FILE);
let triangles = 0;
const report = [];
const guideMarks = []; // non-solid floor marks, one func_brush at the end

/** A world box from min to max, its origin in its middle. */
function Box(min, max, material) {
    const o = min.map((n, i) => (n + max[i]) / 2);
    map.Mesh(BoxPolygons(min.map((n, i) => n - o[i]), max.map((n, i) => n - o[i]), material), o, { world: true });
    triangles += 12;
}

/** A vertical prism over the ring (x, y points, either winding), z0..z1, in polygons at the world origin. */
function Prism(ring, z0, z1, material) {
    const area = ring.reduce((sum, p, i) => sum + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0);
    const ccw = area > 0 ? ring : [...ring].reverse();
    const n = ccw.length;
    triangles += 2 * (n - 2) + 2 * n;
    return {
        positions: [...ccw.map(([x, y]) => [x, y, z0]), ...ccw.map(([x, y]) => [x, y, z1])],
        faces: [
            { loop: ccw.map((_, i) => n + i), material },
            { loop: ccw.map((_, i) => n - 1 - i), material },
            ...ccw.map((_, i) => ({ loop: [i, (i + 1) % n, n + ((i + 1) % n), n + i], material })),
        ],
    };
}

/** Several polygon sets as one. */
function Merge(parts) {
    const positions = [], faces = [];
    for (const part of parts) {
        const base = positions.length;
        positions.push(...part.positions);
        faces.push(...part.faces.map(f => ({ loop: f.loop.map(i => i + base), material: f.material })));
    }
    return { positions, faces };
}

/** A ramp: from x0 (z 0) up to x1 (z rise), y0..y1 wide, solid down to the floor. */
function Ramp(x0, x1, y0, y1, rise, material) {
    const positions = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x1, y0, rise], [x1, y1, rise]];
    const faces = [
        { loop: [0, 3, 2, 1], material }, // bottom
        { loop: [0, 1, 4], material }, // -y side
        { loop: [3, 5, 2], material }, // +y side
        { loop: [1, 2, 5, 4], material }, // the high end
        { loop: [0, 4, 5, 3], material }, // the slope
    ];
    triangles += 8;
    map.Mesh({ positions, faces }, [0, 0, 0], { world: true });
}

/** A flat strip on the floor from p0 to p1 (x, y), `width` wide, 1 high. */
function Strip(p0, p1, width) {
    const d = [p1[0] - p0[0], p1[1] - p0[1]];
    const len = Math.hypot(...d);
    const n = [(-d[1] / len) * (width / 2), (d[0] / len) * (width / 2)];
    return Prism([[p0[0] + n[0], p0[1] + n[1]], [p1[0] + n[0], p1[1] + n[1]], [p1[0] - n[0], p1[1] - n[1]], [p0[0] - n[0], p0[1] - n[1]]], 0, 1, MATERIALS.glow);
}

/** A chevron on the floor at (x, y) pointing along `yaw` (degrees). */
function Chevron(x, y, yaw, size = 48) {
    const a = (yaw * Math.PI) / 180;
    const at = (f, s) => [x + Math.cos(a) * f - Math.sin(a) * s, y + Math.sin(a) * f + Math.cos(a) * s];
    guideMarks.push(Prism([at(size / 2, 0), at(-size / 2, size / 2), at(-size / 4, 0), at(-size / 2, -size / 2)], 0, 1, MATERIALS.glow));
}

/** Dashes along p0 -> p1 (the 45-degree guide line). */
function DashedLine(p0, p1, dash = 28, gap = 20, width = 10) {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const dir = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
    for (let s = 0; s + dash <= len; s += dash + gap) {
        guideMarks.push(Strip([p0[0] + dir[0] * s, p0[1] + dir[1] * s], [p0[0] + dir[0] * (s + dash), p0[1] + dir[1] * (s + dash)], width));
    }
}

/** A rectangle outlined on the floor (the brake box). */
function FloorBox(x0, y0, x1, y1, width = 10) {
    guideMarks.push(Strip([x0, y0], [x1, y0], width), Strip([x1, y0], [x1, y1], width), Strip([x1, y1], [x0, y1], width), Strip([x0, y1], [x0, y0], width));
}

function Spawn(name, x, y, yaw = 0) {
    map.Entity("info_target", { targetname: name }, { origin: [x, y, SPAWN_Z], angles: [0, yaw, 0] });
}

function ScriptOutput(param, output = "OnStartTouch") {
    return { output, target: SCRIPT_ENTITY, input: "RunScriptInput", param };
}

function Goal(station, goal, min, max) {
    map.Trigger(`tutorial_goal_${station}_${goal}`, min, max, [ScriptOutput("tutorial_goal")]);
}

/**
 * World text, plain ASCII, centred on `origin`, facing a reader who looks
 * along `readerYaw` (0: a melon driving +X); `flat`: lying on the floor,
 * else standing.
 */
function Text(message, origin, size = 40, readerYaw = 0, flat = false) {
    map.Entity("point_worldtext", {
        targetname: "",
        message: message.replace(/°/g, " DEG").replace(/[^\x20-\x7e]/g, "-"),
        enabled: "1",
        fullbright: "1",
        color: "190 255 140 255",
        world_units_per_pixel: "0.25",
        font_size: String(size),
        font_name: "Arial Black",
        justify_horizontal: "1",
        justify_vertical: "1",
        reorient_mode: "0",
        depth_render_offset: "0.125",
    // A point_worldtext with pitch and roll 0 lies flat, read from above: its
    // text along its own +X, the letters' tops towards its +Y (checked in
    // Hammer: yaw 270 reads right for a melon driving +X). Standing, it's
    // rolled +90 about its +X: the tops up, read from its -Z side.
    }, { origin, angles: [0, readerYaw - 90, flat ? 0 : 90] });
}

/**
 * Where step `step` (1-based) of station `station` starts: a glowing line
 * across the floor from y0 to y1 at x, its number and text lying on the
 * floor just past it, read from the chase camera driving over it.
 */
function Section(station, step, x, hallY, y0 = -HALF_WIDTH, y1 = HALF_WIDTH) {
    const text = TUTORIAL_STATIONS[station - 1].steps[step - 1]?.text;
    if (!text) return;
    guideMarks.push(Strip([x, hallY + y0], [x, hallY + y1], 12));
    Text(`${step}  ${text}`, [x + FLOOR_TEXT_GAP, hallY + (y0 + y1) / 2, FLOOR_TEXT_Z], FLOOR_TEXT_SIZE, 0, true);
}

/** A ghost melon and its path (points [x, y, z over the floor]). */
function Ghost(station, points) {
    map.Entity("prop_dynamic", {
        targetname: `tutorial_ghost_${station}`,
        model: "models/melon_racer/melon/melon.vmdl",
        solid: "0",
        rendermode: "kRenderTransAlpha",
        renderamt: "110",
        disableshadows: "1",
    }, { origin: [points[0][0], points[0][1], GHOST_Z + (points[0][2] ?? 0)] });
    points.forEach(([x, y, z = 0], i) => map.Entity("info_target", { targetname: `tutorial_ghost_${station}_${i + 1}` }, { origin: [x, y, GHOST_Z + z] }));
}

/**
 * A teleporter's portal: a violet glowing frame across the way at x, from y0
 * to y1, standing on z, the melon through it along +X (`dir` -1: along -X),
 * a sign over it and "TELEPORT" on the floor in front — so it's plain that
 * driving on takes the melon somewhere else.
 */
function Portal(x, y0, y1, z, label, dir = 1) {
    const HEIGHT = 176, POST = 16;
    Box([x - 8, y0, z], [x + 8, y0 + POST, z + HEIGHT], MATERIALS.accent);
    Box([x - 8, y1 - POST, z], [x + 8, y1, z + HEIGHT], MATERIALS.accent);
    Box([x - 8, y0, z + HEIGHT], [x + 8, y1, z + HEIGHT + POST], MATERIALS.accent);
    const readerYaw = dir > 0 ? 0 : 180;
    Text(label, [x - dir * 10, (y0 + y1) / 2, z + HEIGHT + 56], 40, readerYaw);
    Text("TELEPORT", [x - dir * 90, (y0 + y1) / 2, z + 2], 72, readerYaw, true);
    for (const k of [1, 2]) Chevron(x - dir * (130 + k * 70), (y0 + y1) / 2, dir > 0 ? 0 : 180, 40);
}

/** Two glowing posts with a goal between them, the melon through along X. */
function Gate(station, goal, x, y) {
    const half = 80;
    Box([x - 8, y - half - 16, 0], [x + 8, y - half, 96], MATERIALS.glow);
    Box([x - 8, y + half, 0], [x + 8, y + half + 16, 96], MATERIALS.glow);
    Goal(station, goal, [x - 16, y - half, 0], [x + 16, y + half, 128]);
}

/** @type {{ x0: number, x1: number, y: number, doors: number[] }[]} */
const halls = [];
/** Wall stretches higher than WALL_HEIGHT: hall middle y, side (-1 south, +1 north, 0 the end walls), x range, height. */
const TALL_WALLS = [];
/** Wall stretches left flat (no pillar, plinth, band, cornice): an obstacle runs along them. */
const WALL_PLAIN = [];

/** A box between two corners given in any order. */
function AnyBox(a, b, material) {
    Box(a.map((n, i) => Math.min(n, b[i])), a.map((n, i) => Math.max(n, b[i])), material);
}

/** @param {{ y: number }} hall @param {number} side @param {number} x0 @param {number} x1 */
function Overlaps(list, hall, side, x0, x1) {
    return list.filter(w => w.y === hall.y && w.side === side && w.x0 < x1 && w.x1 > x0);
}

/**
 * A hall's side walls in panels (see SEGMENT) and its end walls.
 * @param {{ x0: number, x1: number, y: number, doors: number[] }} hall
 */
function HallWalls(hall) {
    for (const side of [-1, 1]) {
        const face = hall.y + side * HALF_WIDTH; // the inner face; outward is +side
        const In = d => face - side * d; // d units out of the wall into the hall
        for (let sx = hall.x0, i = 0; sx < hall.x1; sx += SEGMENT, i++) {
            const ex = Math.min(sx + SEGMENT, hall.x1);
            const height = Math.max(WALL_HEIGHT, ...Overlaps(TALL_WALLS, hall, side, sx, ex).map(w => w.height));
            AnyBox([sx, face, 0], [ex, face + side * WALL, height], i % 2 ? MATERIALS.wall2 : MATERIALS.wall);
            const plain = Overlaps(WALL_PLAIN, hall, side, sx - PILLAR.half, ex + PILLAR.half).length > 0;
            if (plain) {
                AnyBox([sx, face, height - 4], [ex, In(2), height], MATERIALS.wallGlow); // a glowing top edge only
                continue;
            }
            AnyBox([sx, face, 0], [ex, In(PLINTH.depth), PLINTH.height], MATERIALS.block);
            AnyBox([sx, In(PLINTH.depth), PLINTH.height - 6], [ex, In(PLINTH.depth + 2), PLINTH.height], MATERIALS.wallGlow);
            AnyBox([sx, face, height - CORNICE.height], [ex, In(CORNICE.depth), height], MATERIALS.block);
            // The pillar at the panel's start: not at the hall's ends, nor in a doorway's wall.
            if (sx > hall.x0 && hall.doors.every(d => Math.abs(d - sx) > PILLAR.half + WALL)) {
                AnyBox([sx - PILLAR.half, face, 0], [sx + PILLAR.half, In(PILLAR.depth), height + PILLAR.over], MATERIALS.block);
                AnyBox([sx - 3, In(PILLAR.depth), 40], [sx + 3, In(PILLAR.depth + 2), height - 40], MATERIALS.wallGlow);
            }
        }
    }
    for (const [x, out] of [[hall.x0, -1], [hall.x1, 1]]) {
        const height = Math.max(WALL_HEIGHT, ...Overlaps(TALL_WALLS, hall, 0, x - 1, x + 1).map(w => w.height));
        AnyBox([x, hall.y - HALF_WIDTH - WALL, 0], [x + out * WALL, hall.y + HALF_WIDTH + WALL, height], MATERIALS.wall);
        AnyBox([x, hall.y - HALF_WIDTH, height - CORNICE.height], [x - out * CORNICE.depth, hall.y + HALF_WIDTH, height], MATERIALS.block);
    }
}

/**
 * A hall: floor, walls, a door between each two rooms, each station's
 * trigger and spawn. `rooms` from x0 on: { length, station?, sign }.
 * Returns each room's x0.
 */
function Hall(x0, y, rooms) {
    const xs = [];
    let x = x0;
    for (const room of rooms) {
        xs.push(x);
        x += room.length;
    }
    const x1 = x;
    const y0 = y - HALF_WIDTH, y1 = y + HALF_WIDTH;
    Box([x0 - WALL, y0 - WALL, -16], [x1 + WALL, y1 + WALL, 0], MATERIALS.floor);
    halls.push({ x0, x1, y, doors: xs.slice(1) }); // its side and end walls: HallWalls, once every obstacle is known
    rooms.forEach((room, i) => {
        const rx = xs[i];
        if (i > 0) {
            Box([rx - WALL / 2, y0, 0], [rx + WALL / 2, y - DOOR_HALF, WALL_HEIGHT], MATERIALS.wall);
            Box([rx - WALL / 2, y + DOOR_HALF, 0], [rx + WALL / 2, y1, WALL_HEIGHT], MATERIALS.wall);
            Box([rx - WALL / 2, y - DOOR_HALF, DOOR_HEIGHT], [rx + WALL / 2, y + DOOR_HALF, WALL_HEIGHT], MATERIALS.wall);
            Box([rx - WALL / 2 - 4, y - DOOR_HALF, DOOR_HEIGHT - 6], [rx - WALL / 2, y + DOOR_HALF, DOOR_HEIGHT], MATERIALS.wallGlow);
            // The doorway framed: a glowing jamb on each side, both faces; a cornice along the top.
            for (const face of [-1, 1]) {
                const fx = rx + face * (WALL / 2);
                for (const jamb of [-1, 1]) {
                    const jy = y + jamb * DOOR_HALF;
                    AnyBox([fx, jy, 0], [fx + face * 4, jy - jamb * 12, DOOR_HEIGHT], MATERIALS.wallGlow);
                }
                AnyBox([fx, y0, WALL_HEIGHT - CORNICE.height], [fx + face * CORNICE.depth, y1, WALL_HEIGHT], MATERIALS.block);
            }
            Text(room.sign, [rx - WALL / 2 - 2, y, DOOR_HEIGHT + 64]);
            Chevron(rx - 160, y, 0);
            Chevron(rx - 100, y, 0);
        } else {
            Text(room.sign, [rx + 4, y, DOOR_HEIGHT + 64], 40, 180); // on the hall's west wall, read looking back
        }
        if (room.station !== undefined) {
            map.Trigger(`tutorial_station_${room.station}`, [rx + WALL / 2, y0, 0], [rx + room.length - WALL / 2, y1, TRIGGER_TOP], [
                ScriptOutput("tutorial_enter"),
                ScriptOutput("tutorial_leave", "OnEndTouch"),
            ]);
            Spawn(`tutorial_spawn_${room.station}`, rx + 112, y, 0);
        }
    });
    return xs;
}

// ===================== hall A: entrance, 1 DRIVING, 2 BOOST & HEAL, 3 WALLS =====================
const A = 0; // hall A's middle
const [ENTRANCE, S1, S2, S3] = Hall(SHIFT_X - 512, A, [
    { length: 512, sign: "TUTORIAL STATIONS" },
    { length: 4352, station: 1, sign: "1 - DRIVING" },
    { length: 4608, station: 2, sign: "2 - BOOST & HEAL" },
    { length: 4096, station: 3, sign: "3 - WALLS" },
]);
const HALL_A_END = S3 + 4096;
Spawn("tutorial_entrance", ENTRANCE + 128, A, 0);
Text("THE CARD ON THE LEFT EXPLAINS EACH STEP", [ENTRANCE + 480, A, 170], 24);

// --- 1 DRIVING: a section per step, in order ---
Section(1, 1, S1 + 200, A); // W: a straight to speed up on
for (let x = S1 + 400; x < S1 + 1200; x += 200) Chevron(x, A, 0);
Section(1, 2, S1 + 1300, A); // S: a box to stop in
FloorBox(S1 + 1500, A - 200, S1 + 1900, A + 200);
Text("STOP HERE", [S1 + 1700, A, 60], 28);
Section(1, 3, S1 + 2100, A); // steering round a glowing post (W + the mouse): a dashed circle, clockwise arrows on it
const POST = [S1 + 2450, A], RING = 220;
Box([POST[0] - 12, POST[1] - 12, 0], [POST[0] + 12, POST[1] + 12, 96], MATERIALS.glow);
const ringAt = (a) => [POST[0] + RING * Math.cos(a), POST[1] + RING * Math.sin(a)];
for (let k = 0; k < 24; k += 2) guideMarks.push(Strip(ringAt((-k * Math.PI) / 12), ringAt((-(k + 1) * Math.PI) / 12), 10));
for (let k = 0; k < 4; k++) {
    const a = -Math.PI / 4 - (k * Math.PI) / 2; // clockwise seen from above
    const [x, y] = ringAt(a);
    Chevron(x, y, (a * 180) / Math.PI - 90, 36);
}
Section(1, 4, S1 + 2800, A); // the slalom
Gate(1, "a", S1 + 3050, A - 200);
Gate(1, "b", S1 + 3350, A + 200);
Gate(1, "c", S1 + 3650, A - 200);
Chevron(S1 + 2920, A - 200, 0);
Chevron(S1 + 3200, A, 45);
Chevron(S1 + 3500, A, -45);
Section(1, 5, S1 + 3800, A); // the hurdle: 40 high, a jump clears ~85
Box([S1 + 4000, A - HALF_WIDTH, 0], [S1 + 4032, A + HALF_WIDTH, 40], MATERIALS.block);
Box([S1 + 3996, A - HALF_WIDTH, 40], [S1 + 4036, A + HALF_WIDTH, 44], MATERIALS.glow);
Goal(1, "hurdle", [S1 + 4080, A - HALF_WIDTH, 0], [S1 + 4200, A + HALF_WIDTH, 160]);
Text("SPACE", [S1 + 3990, A, 90], 32);
Ghost(1, [
    ...Array.from({ length: 17 }, (_, k) => [...ringAt(Math.PI - (k * 2 * Math.PI) / 16)]), // once round the post, clockwise
    [S1 + 2850, A - 200], [S1 + 3050, A - 200], [S1 + 3200, A], [S1 + 3350, A + 200], [S1 + 3500, A], [S1 + 3650, A - 200], [S1 + 3850, A - 60], [S1 + 3980, A], [S1 + 4016, A, 70], [S1 + 4100, A]]);

// --- 2 BOOST & HEAL: boost along a straight (losing health as it goes), the heal gate, a long straight for momentum ---
Section(2, 1, S2 + 200, A);
for (let x = S2 + 400; x < S2 + 1700; x += 220) Chevron(x, A, 0, 40);
Section(2, 2, S2 + 1000, A, 0, HALF_WIDTH); // the health cost shows while still boosting
Section(2, 3, S2 + 1800, A);
const HEAL_X = S2 + 2100;
map.Prefab("maps/prefabs/heal_gate.vmap", [HEAL_X, A, 48], [0, 90, 0]);
report.push(`station 2: heal_gate.vmap placed at ${HEAL_X} ${A} 48, yaw 90 — check in Hammer that its trigger spans the way along X`);
Section(2, 4, S2 + 2400, A);
for (let x = S2 + 2600; x < S2 + 4400; x += 300) Chevron(x, A, 0, 40);
Text("TOP SPEED - LET GO OF W - AGAIN", [S2 + 3400, A, 120], 24);

// --- 3 WALLS ---
// Section 1: a glowing target on the south wall, arrows leading at it: jump
// at it, SPACE again on the touch.
// The target well into the room (a long run-up), no pillar near it (WALL_PLAIN below).
Section(3, 1, S3 + 250, A);
const TARGET_X = S3 + 1100;
Box([TARGET_X - 32, A - HALF_WIDTH, 32], [TARGET_X + 32, A - HALF_WIDTH + 2, 96], MATERIALS.glow);
Text("JUMP HERE", [TARGET_X, A - HALF_WIDTH + 4, 120], 28, 270);
for (let k = 0; k < 4; k++) Chevron(S3 + 640 + k * 90, A - 20 - k * 80, -45, 40);
// Section 2: a dashed line at 45 degrees into the north wall, a glowing
// square where it hits, the ghost jumping off there.
Section(3, 2, S3 + 1500, A);
const HIT = [S3 + 2200, A + HALF_WIDTH - 16];
DashedLine([HIT[0] - 560, HIT[1] - 560], HIT);
Box([HIT[0] - 24, A + HALF_WIDTH - 2, 24], [HIT[0] + 24, A + HALF_WIDTH, 72], MATERIALS.glow);
Ghost(3, [[HIT[0] - 560, HIT[1] - 560], [HIT[0] - 140, HIT[1] - 140, 40], [HIT[0], HIT[1], 70], [HIT[0] + 300, HIT[1] - 300, 30], [HIT[0] + 420, HIT[1] - 420]]);
// Section 3: climbing with wall jumps — a shaft CORRIDOR_GAP wide along the
// north wall, a jump recharge zone keeping the charges full, up onto a shelf
// CLIMB_HEIGHT up; the shelf's far end a teleporter on to station 4 (hall B).
Section(3, 3, S3 + 2800, A);
const CX0 = S3 + 3000, CX1 = S3 + 3400, CY1 = A + HALF_WIDTH, CY0 = CY1 - CORRIDOR_GAP;
Box([CX0, CY0 - WALL, 0], [CX1, CY0, CLIMB_HEIGHT + 64], MATERIALS.wall);
Box([CX0 - 4, CY0 - WALL, CLIMB_HEIGHT + 58], [CX1, CY0, CLIMB_HEIGHT + 64], MATERIALS.glow);
const SHELF_Y0 = A + 128;
Box([CX1, SHELF_Y0, 0], [HALL_A_END, CY1, CLIMB_HEIGHT], MATERIALS.block);
Box([CX1, SHELF_Y0, CLIMB_HEIGHT - 6], [CX1 + 4, CY1, CLIMB_HEIGHT], MATERIALS.glow);
Box([CX1, SHELF_Y0, CLIMB_HEIGHT - 6], [HALL_A_END, SHELF_Y0 + 4, CLIMB_HEIGHT], MATERIALS.glow);
map.ZoneTrigger("tutorial_jump_recharge", "jump_recharge_enter", "jump_recharge_leave", [CX0, CY0, 0], [CX1, CY1, CLIMB_HEIGHT + 64]);
for (const effect of ["jump_recharge_rings", "jump_recharge_sparks"]) {
    map.Entity("info_particle_system", { effect_name: `particles/melon_racer/${effect}.vpcf`, start_active: "1" }, { origin: [CX0 + 80, (CY0 + CY1) / 2, 4] });
}
Chevron(CX0 - 120, (CY0 + CY1) / 2, 0, 32);
Chevron(CX0 - 60, (CY0 + CY1) / 2, 0, 32);
Text("CLIMB UP", [CX0 - 8, (CY0 + CY1) / 2, CLIMB_HEIGHT + 96], 28);
Goal(3, "climb", [CX1, SHELF_Y0, CLIMB_HEIGHT], [CX1 + 192, CY1, CLIMB_HEIGHT + 128]);
map.Trigger("teleport_stop_to_tutorial_spawn_4", [HALL_A_END - 160, SHELF_Y0, CLIMB_HEIGHT], [HALL_A_END, CY1, CLIMB_HEIGHT + 160], [ScriptOutput("melon_teleport")]);
Portal(HALL_A_END - 168, SHELF_Y0, CY1, CLIMB_HEIGHT, "TELEPORT > STATION 4");
for (let x = CX1 + 260; x < HALL_A_END - 420; x += 80) Chevron(x, (SHELF_Y0 + CY1) / 2, 0, 32); // then the portal's own
// The way on at floor level too: hall A's far wall, a teleporter to station 4.
map.Trigger("teleport_stop_to_tutorial_spawn_4", [HALL_A_END - 96, A - HALF_WIDTH, 0], [HALL_A_END, A + 120, 256], [ScriptOutput("melon_teleport")]);
Portal(HALL_A_END - 104, A - HALF_WIDTH, A + 120, 0, "TELEPORT > STATION 4");

// ===================== hall B: 4 CRASHES, 5 MENU, 6 RACES =====================
const B = HALL_B_Y;
const [, S4, S5, S6] = Hall(SHIFT_X + 1024, B, [
    { length: 512, sign: "BACK TO STATION 3" },
    { length: 3200, station: 4, sign: "4 - CRASHES" },
    { length: 1280, station: 5, sign: "5 - MENU" },
    { length: 2816, station: 6, sign: "6 - RACES" },
]);
const HALL_B_END = S6 + 2816;
Spawn("tutorial_back_3", HALL_A_END - 300, A - 200, 180);
map.Trigger("teleport_stop_to_tutorial_back_3", [S4 - 512, B - HALF_WIDTH, 0], [S4 - 416, B + HALF_WIDTH, 256], [ScriptOutput("melon_teleport")]);
Portal(S4 - 408, B - HALF_WIDTH, B + HALF_WIDTH, 0, "TELEPORT < STATION 3", -1);

// --- 4 CRASHES ---
Section(4, 1, S4 + 200, B); // open floor to boost round in circles
Text("BOOST - CIRCLE ROUND IF YOU RUN OUT OF ROOM", [S4 + 800, B, 120], 22);
Section(4, 2, S4 + 1500, B, -HALF_WIDTH, -32); // south: a lane into the crash wall
Box([S4 + 2400, B - HALF_WIDTH, 0], [S4 + 2432, B - 64, 256], MATERIALS.accent);
for (let x = S4 + 1650; x < S4 + 2350; x += 140) Chevron(x, B - 224, 0, 40);
Ghost(4, [[S4 + 1600, B - 224], [S4 + 2380, B - 224]]);
// North: a 20-degree ramp (FORWARD_ACCEL beats GRAVITY * sin) up a 320 tower,
// then off it onto the flat floor.
Section(4, 3, S4 + 1500, B, 32, HALF_WIDTH);
const RAMP_X0 = S4 + 1600, RAMP_X1 = S4 + 2480, TOWER_X1 = S4 + 2740, TOWER_Z = 320;
Ramp(RAMP_X0, RAMP_X1, B + 128, B + HALF_WIDTH, TOWER_Z, MATERIALS.block);
Box([RAMP_X1, B + 128, 0], [TOWER_X1, B + HALF_WIDTH, TOWER_Z], MATERIALS.block);
Box([RAMP_X1, B + 124, TOWER_Z - 6], [TOWER_X1, B + 128, TOWER_Z], MATERIALS.glow);
Text("JUMP OFF - FLAT LANDING", [TOWER_X1 + 8, B + 256, TOWER_Z + 96], 24);
Section(4, 4, S4 + 2900, B);

// --- 5 MENU: a sign per step along the room ---
for (let step = 1; step <= TUTORIAL_STATIONS[4].steps.length; step++) Section(5, step, S5 + 100 + step * 190, B);

// --- 6 RACES: a sign per step, the exit gate to the hub at the end ---
for (let step = 1; step <= 4; step++) Section(6, step, S6 + 100 + step * 450, B);
Section(6, 5, S6 + 2250, B);
const EXIT_X = S6 + 2500;
Box([EXIT_X, B - DOOR_HALF - 16, 0], [EXIT_X + 16, B - DOOR_HALF, 192], MATERIALS.glow);
Box([EXIT_X, B + DOOR_HALF, 0], [EXIT_X + 16, B + DOOR_HALF + 16, 192], MATERIALS.glow);
Box([EXIT_X, B - DOOR_HALF - 16, 192], [EXIT_X + 16, B + DOOR_HALF + 16, 208], MATERIALS.glow);
Goal(6, "exit", [EXIT_X - 20, B - DOOR_HALF, 0], [EXIT_X + 40, B + DOOR_HALF, 192]);
map.Trigger("tutorial_exit_to_hub", [EXIT_X + 80, B - HALF_WIDTH, 0], [HALL_B_END, B + HALF_WIDTH, TRIGGER_TOP], [ScriptOutput("hub_teleport")]);
Text("TO THE HUB", [EXIT_X - 4, B, 260], 32);
for (let x = S6 + 2300; x < EXIT_X - 40; x += 100) Chevron(x, B, 0, 40);

// --- the halls' walls, high and flat where the obstacles need it ---
TALL_WALLS.push({ y: B, side: 1, x0: RAMP_X1 - SEGMENT, x1: TOWER_X1 + SEGMENT, height: 576 }); // a wall jump off the tower's top
WALL_PLAIN.push({ y: A, side: 1, x0: CX0 - 64, x1: HALL_A_END }); // the climbing shaft (64 wide: nothing may stick out into it) and the shelf
WALL_PLAIN.push({ y: A, side: -1, x0: TARGET_X - 300, x1: TARGET_X + 300 }); // the wall-jump target: no pillar next to it
WALL_PLAIN.push({ y: A, side: 1, x0: HIT[0] - 300, x1: HIT[0] + 300 }); // the 45-degree spot: no pillar in the way in or out
WALL_PLAIN.push({ y: B, side: 1, x0: RAMP_X0, x1: TOWER_X1 }); // the ramp and the tower
for (const hall of halls) HallWalls(hall);

// --- the floor marks: one non-solid func_brush ---
map.Entity("func_brush", { targetname: "tutorial_guide_marks", Solidity: "1", disableshadows: "1" }, { meshes: [map.Mesh(Merge(guideMarks), [0, 0, 0])] });

map.Write(COURSE_FILE);
if (!existsSync(fileURLToPath(new URL(`../../${ROUTE_FILE}`, import.meta.url)))) {
    const route = new Vmap(ROUTE_FILE);
    route.Prefab(COURSE_FILE, [0, 0, 0]);
    route.Write(ROUTE_FILE);
}
report.push(`hall A: x ${SHIFT_X - 512}..${HALL_A_END}; hall B: x ${SHIFT_X + 1024}..${HALL_B_END}, y ${HALL_B_Y - HALF_WIDTH}..${HALL_B_Y + HALF_WIDTH}`);
for (const line of report) console.log(line);
console.log(`${triangles} triangles (blockout + marks)`);
