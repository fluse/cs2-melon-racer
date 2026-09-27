// The real UpdateKart jump handling, run against the fake engine: jumps only
// with measured ground contact, and wall jumps in the air at a wall.
// Floor/wall probes are line traces (see UpdateGrounded) — world.traceLine.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { karts } = await import("../src/melon_drive/kart-registry.js");
const { SetUpPlayerKart } = await import("../src/melon_drive/kart-spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/spawn-points.js");
const { UpdateKart } = await import("../src/melon_drive/kart-physics.js");
const C = await import("../src/melon_drive/constants.js");

const DT = 1 / 64;
const FLOOR_Z = 0;

/** @type {CSPlayerPawn} */
let pawn;
/** @type {any} */
let kart;

/** Trace results for a flat floor at FLOOR_Z and, optionally, a wall at x = wallX facing -x. */
function Geometry({ floorBelow = true, wallX = undefined } = {}) {
    world.traceLine = (c) => {
        const down = c.end.z < c.start.z - 1;
        if (down && floorBelow) {
            return { didHit: true, startedInSolid: false, fraction: 0.5, end: { ...c.end, z: FLOOR_Z }, normal: { x: 0, y: 0, z: 1 } };
        }
        if (!down && wallX !== undefined && c.end.x > wallX) {
            const fraction = (wallX - c.start.x) / (c.end.x - c.start.x);
            return { didHit: true, startedInSolid: false, fraction, end: { ...c.end, x: wallX }, normal: { x: -1, y: 0, z: 0 } };
        }
        return { didHit: false, startedInSolid: false, fraction: 1, end: c.end, normal: { x: 0, y: 0, z: 1 } };
    };
}

/**
 * One tick of UpdateKart where last tick we commanded `commanded` and
 * physics now reports `actual`.
 */
function Tick({ commanded, actual, jump = false }) {
    world.time += DT;
    kart.lastVelocity = { ...commanded };
    kart.melon.velocity = { ...actual };
    pawn.justPressed = new Set(jump ? ["JUMP"] : []);
    UpdateKart(0, kart, DT);
    return kart.melon.GetAbsVelocity();
}

/** Velocities for a melon falling freely: gravity took its full share. */
const falling = (vz, vx = 0) => ({ commanded: { x: vx, y: 0, z: vz }, actual: { x: vx, y: 0, z: vz - C.GRAVITY * DT } });
/** Velocities for a melon rolling on the floor: no vertical change. */
const rolling = (vx = 200) => ({ commanded: { x: vx, y: 0, z: 0 }, actual: { x: vx, y: 0, z: 0 } });

beforeEach(() => {
    world.reset();
    karts.clear();
    world.time = 100;
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 30 } }));
    pawn = world.add(new CSPlayerPawn({ slot: 0 }));
    kart = SetUpPlayerKart(pawn, GetIntroSpawnPoint());
    kart.nextJumpTime = 0;
    kart.lastGroundedTime = undefined;
});

test("jumping on the floor works", () => {
    Geometry();
    const v = Tick({ ...rolling(), jump: true });
    assert.equal(v.z, C.JUMP_SPEED);
});

test("no jump while falling, even just above the floor", () => {
    // Regression: the old 48-unit downward ray counted this as ground.
    Geometry({ floorBelow: true });
    const v = Tick({ ...falling(-50), jump: true });
    assert.ok(v.z < 0, `still falling (vz=${v.z})`);
});

test("a jump right after leaving the floor still works (short hop tolerance)", () => {
    Geometry();
    Tick(rolling()); // on the floor
    const v = Tick({ ...falling(0, 200), jump: true }); // one tick into a rolling hop
    assert.equal(v.z, C.JUMP_SPEED);
});

test("no jump once the hop tolerance has run out", () => {
    Geometry();
    Tick(rolling());
    world.time += C.GROUND_COYOTE_TIME + DT;
    const v = Tick({ ...falling(0, 200), jump: true });
    assert.ok(v.z < 0);
});

test("wall jump: in the air at a wall, jump pushes off it and up", () => {
    const wallX = kart.melon.GetAbsOrigin().x + C.WALL_CONTACT_DISTANCE / 2;
    Geometry({ floorBelow: false, wallX });
    const v = Tick({ ...falling(-100, 300), jump: true });
    assert.equal(v.z, C.WALL_JUMP_UP_SPEED);
    assert.ok(v.x <= -C.WALL_JUMP_PUSH_SPEED + 1e-9, `pushed away from the wall (vx=${v.x})`);
});

test("wall jump: no wall nearby, no jump in the air", () => {
    Geometry({ floorBelow: false });
    const v = Tick({ ...falling(-100, 300), jump: true });
    assert.ok(v.z < 0);
});

test("wall jump: only once per wall until the ground is touched again", () => {
    const wallX = kart.melon.GetAbsOrigin().x + C.WALL_CONTACT_DISTANCE / 2;
    Geometry({ floorBelow: false, wallX });
    Tick({ ...falling(-100, 300), jump: true });
    world.time += C.WALL_JUMP_COOLDOWN + DT;
    kart.melon.origin = { ...kart.melon.origin, x: wallX - C.WALL_CONTACT_DISTANCE / 2 }; // back at the same wall
    const again = Tick({ ...falling(-100, 300), jump: true });
    assert.ok(again.z < 0, "same wall a second time: no wall jump");
});
