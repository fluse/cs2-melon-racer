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
const { UpdateKart } = await import("../src/melon_drive/physics/index.js");
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
/** Falling while flying into a wall in +x at `vx`, which stopped it dead. */
const fallingIntoWall = (vz, vx = 300) => ({ commanded: { x: vx, y: 0, z: vz }, actual: { x: 0, y: 0, z: vz - C.GRAVITY * DT } });
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
    const v = Tick({ ...fallingIntoWall(-100), jump: true });
    assert.equal(v.z, C.WALL_JUMP_UP_SPEED);
    assert.ok(v.x <= -C.WALL_JUMP_PUSH_SPEED + 1e-9, `pushed away from the wall (vx=${v.x})`);
});

// Regression: contact used to be judged from the melon's center distance
// only, so a melon still flying towards a wall could jump off it before
// touching it.
test("wall jump: wall near but not touched yet (still flying at it), no wall jump", () => {
    const wallX = kart.melon.GetAbsOrigin().x + C.WALL_CONTACT_DISTANCE / 2;
    Geometry({ floorBelow: false, wallX });
    const v = Tick({ ...falling(-100, 300), jump: true });
    assert.ok(v.z < 0, `no wall jump yet (vz=${v.z})`);
});

test("wall jump: once the wall has stopped the melon, it stays jumpable for WALL_JUMP_WINDOW", () => {
    const wallX = kart.melon.GetAbsOrigin().x + C.WALL_CONTACT_DISTANCE / 2;
    Geometry({ floorBelow: false, wallX });
    Tick(fallingIntoWall(-100)); // touches the wall, no jump yet
    const v = Tick({ commanded: { x: 0, y: 0, z: -110 }, actual: { x: 0, y: 0, z: -110 - C.GRAVITY * DT }, jump: true });
    assert.equal(v.z, C.WALL_JUMP_UP_SPEED);
});

test("wall jump: no wall nearby, no jump in the air", () => {
    Geometry({ floorBelow: false });
    const v = Tick({ ...falling(-100, 300), jump: true });
    assert.ok(v.z < 0);
});

test("wall jump: only once per wall until the ground is touched again", () => {
    const wallX = kart.melon.GetAbsOrigin().x + C.WALL_CONTACT_DISTANCE / 2;
    Geometry({ floorBelow: false, wallX });
    Tick({ ...fallingIntoWall(-100), jump: true });
    world.time += C.WALL_JUMP_COOLDOWN + DT;
    kart.melon.origin = { ...kart.melon.origin, x: wallX - C.WALL_CONTACT_DISTANCE / 2 }; // back at the same wall
    const again = Tick({ ...fallingIntoWall(-100), jump: true });
    assert.ok(again.z < 0, "same wall a second time: no wall jump");
});

test("no double jump right after taking off (second press within the hop tolerance)", () => {
    Geometry();
    const first = Tick({ ...rolling(), jump: true });
    assert.equal(first.z, C.JUMP_SPEED);
    const second = Tick({ commanded: first, actual: { ...first, z: first.z - C.GRAVITY * C.GROUND_COYOTE_TIME / 4 }, jump: true });
    assert.ok(second.z < C.JUMP_SPEED, `no second jump (vz=${second.z})`);
});

// Regression: in-engine the floor still pushes the melon up for a tick
// after it jumps, which reads as support — the second press jumped again.
test("no double jump while the floor still pushes during takeoff", () => {
    Geometry();
    const first = Tick({ ...rolling(), jump: true });
    assert.equal(first.z, C.JUMP_SPEED);
    world.time += C.GROUND_COYOTE_TIME; // past the hop tolerance of the jump tick's own contact
    const second = Tick({ commanded: first, actual: { ...first, z: first.z + 20 }, jump: true }); // pushed up: "supported"
    assert.equal(second.z, first.z + 20, "no second jump: vertical speed left as physics had it");
});

test("jumping again right after landing works — no cooldown", () => {
    Geometry();
    Tick({ ...rolling(), jump: true });
    world.time += 0.3;
    Tick(rolling()); // landed
    const again = Tick({ ...rolling(), jump: true });
    assert.equal(again.z, C.JUMP_SPEED);
});

test("wall jump: strength follows the charge, and a spent charge means no wall jump", () => {
    const wallX = kart.melon.GetAbsOrigin().x + C.WALL_CONTACT_DISTANCE / 2;
    Geometry({ floorBelow: false, wallX });
    kart.wallJumpCharge = 0.5;
    const half = Tick({ ...fallingIntoWall(-100), jump: true });
    assert.ok(Math.abs(half.z - C.WALL_JUMP_UP_SPEED * (0.5 + DT / C.WALL_JUMP_RECHARGE_SECONDS)) < 1e-6, `half-strength jump (vz=${half.z})`);
    assert.ok(kart.wallJumpCharge < 0.5, "the jump used up charge");

    kart.lastWallJump = undefined;
    kart.wallJumpCharge = 0;
    const spent = Tick({ ...fallingIntoWall(-100), jump: true });
    assert.ok(spent.z < 0, "no wall jump with an empty charge");
});

// Regression: a wall jump used to raise the speed cap, so chaining them
// built up speed without limit.
test("wall jump never pushes the melon past its speed cap", () => {
    const wallX = kart.melon.GetAbsOrigin().x + C.WALL_CONTACT_DISTANCE / 2;
    Geometry({ floorBelow: false, wallX });
    kart.speedCap = undefined; // plain MAX_SPEED
    // along the wall at top speed already, and just stopped against it
    const v = Tick({ commanded: { x: 100, y: C.MAX_SPEED, z: -100 }, actual: { x: 0, y: C.MAX_SPEED, z: -100 - C.GRAVITY * DT }, jump: true });
    assert.equal(v.z, C.WALL_JUMP_UP_SPEED, "the wall jump happened");
    assert.ok(Math.hypot(v.x, v.y) <= C.MAX_SPEED + 1e-6, `horizontal speed ${Math.hypot(v.x, v.y)} > MAX_SPEED`);
    assert.equal(kart.speedCap, C.MAX_SPEED);
});

test("the jump bar shows the wall-jump charge", async () => {
    const { GetJumpChargeFraction } = await import("../src/melon_drive/physics/index.js");
    kart.wallJumpCharge = 0.25;
    assert.equal(GetJumpChargeFraction(kart), 0.25);
});

test("jump debug view: off by default, logs jump presses once switched on", async () => {
    const { SetJumpDebug } = await import("../src/melon_drive/physics/index.js");
    Geometry({ floorBelow: false, wallX: kart.melon.GetAbsOrigin().x + C.WALL_CONTACT_DISTANCE / 2 });
    Tick({ ...falling(-100, 300), jump: true });
    assert.ok(!world.messages.some((m) => m.includes("[jump debug]")), "nothing logged while off");
    SetJumpDebug(kart, true);
    Tick({ ...falling(-100, 300), jump: true }); // draws probes + wall check, logs the press
    assert.ok(world.messages.some((m) => m.includes("[jump debug]") && m.includes("wall contact")));
    assert.ok(kart.contactDebug && kart.contactDebug.probes.length > 0, "probes recorded");
    SetJumpDebug(kart, false);
    assert.equal(kart.contactDebug, undefined);
});
