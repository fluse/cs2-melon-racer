// The real UpdateKart jump handling, run against the fake engine: jumps only
// with measured ground contact, and wall jumps in the air at a wall.
// Floor/wall probes are line traces (see UpdateGrounded) — world.traceLine.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { UpdateKart } = await import("../../src/melon_drive/movement/index.js");
const C = await import("../../src/melon_drive/constants/index.js");

const DT = 1 / 64;
/** A wall this far from the melon's center is at it (within WALL_JUMP_CONTACT_RADIUS). */
const NEAR_WALL = C.WALL_JUMP_CONTACT_RADIUS / 2;
const WALL_TIMING_SPAM_LOCKOUT_HALF = () => C.WALL_TIMING_SPAM_LOCKOUT / 2;
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
/**
 * Falling and gently touching a wall in +x — stopped, but too slow for a
 * wall bounce (below WALL_BOUNCE_MIN_IMPACT): a plain wall touch.
 */
const touchingWall = (vz) => fallingIntoWall(vz, C.WALL_BOUNCE_MIN_IMPACT / 2);
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
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    const v = Tick({ ...touchingWall(-100), jump: true });
    assert.equal(v.z, C.WALL_JUMP_UP_SPEED);
    assert.ok(v.x <= -C.WALL_JUMP_PUSH_SPEED + 1e-9, `pushed away from the wall (vx=${v.x})`);
});

// The timing is the distance: a press counts while the wall is at the melon
// (WALL_JUMP_CONTACT_RADIUS, plus one tick's travel when moving at it) —
// not when it's merely somewhere nearby.
test("wall jump: a wall further than WALL_JUMP_CONTACT_RADIUS (plus one tick's travel) is too far", () => {
    const speed = 300;
    const wallX = kart.melon.GetAbsOrigin().x + C.WALL_JUMP_CONTACT_RADIUS + speed * DT + 2;
    Geometry({ floorBelow: false, wallX });
    const v = Tick({ ...falling(-100, speed), jump: true });
    assert.equal(kart.lastWallJump, undefined, "no wall jump");
    assert.ok(v.z < 0, `still falling (vz=${v.z})`);
});

test("wall jump: flying at a wall it reaches within one tick already counts (a press just before the touch)", () => {
    const speed = 300;
    const wallX = kart.melon.GetAbsOrigin().x + C.WALL_JUMP_CONTACT_RADIUS + speed * DT - 2;
    Geometry({ floorBelow: false, wallX });
    const v = Tick({ ...falling(-100, speed), jump: true });
    assert.ok(kart.lastWallJump, "wall jump");
    assert.equal(v.z, C.WALL_JUMP_UP_SPEED);
});

// Regression: a contact used to stay jumpable for 0.2 s, so a press long
// after leaving the wall still wall-jumped.
test("wall jump: once off the wall, only WALL_JUMP_WINDOW (a tick or two) is left to press", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    Tick(touchingWall(-100)); // at the wall, no press
    kart.melon.origin = { ...kart.melon.origin, x: wallX - 3 * C.WALL_JUMP_CONTACT_RADIUS }; // pushed off it
    world.time += C.WALL_JUMP_WINDOW + DT;
    Tick({ ...falling(-100, -100), jump: true });
    assert.equal(kart.lastWallJump, undefined, "too late — no wall jump");
});

test("wall jump: a press the tick after leaving the wall still counts (WALL_JUMP_WINDOW)", () => {
    assert.ok(DT <= C.WALL_JUMP_WINDOW, "test setup: the window covers at least one tick");
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    Tick(touchingWall(-100)); // at the wall, no jump yet
    kart.melon.origin = { ...kart.melon.origin, x: wallX - 3 * C.WALL_JUMP_CONTACT_RADIUS }; // already off it
    const v = Tick({ commanded: { x: 0, y: 0, z: -110 }, actual: { x: 0, y: 0, z: -110 - C.GRAVITY * DT }, jump: true });
    assert.equal(v.z, C.WALL_JUMP_UP_SPEED);
});

test("wall bounce: lifts the melon by WALL_BOUNCE_UP_SPEED, cancelling its fall", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    const v = Tick(fallingIntoWall(-100));
    assert.ok(kart.lastBounceTime === world.time, "the hit counted as a wall bounce");
    assert.equal(v.z, C.WALL_BOUNCE_UP_SPEED);
});

test("wall bounce in a lift zone: kicked up by the zone's speed instead", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    kart.liftZones = new Map([[new Entity({ name: "lift_zone_600" }), 600]]);
    const v = Tick(fallingIntoWall(-100));
    assert.equal(v.z, 600);
});

test("wall jump in a lift zone: full strength, costs no charge, keeps the bounce's higher kick", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    kart.liftZones = new Map([[new Entity({ name: "lift_zone" }), C.LIFT_ZONE_UP_SPEED]]);
    kart.wallJumpCharge = C.WALL_JUMP_MIN_CHARGE; // nearly spent outside a zone
    const v = Tick({ ...fallingIntoWall(-100), jump: true });
    assert.ok(kart.lastWallJump, "wall jump happened");
    assert.ok(kart.wallJumpCharge >= C.WALL_JUMP_MIN_CHARGE, "no charge used");
    assert.equal(v.z, Math.max(C.LIFT_ZONE_UP_SPEED, C.WALL_JUMP_UP_SPEED));
    assert.ok(v.x <= -C.WALL_JUMP_PUSH_SPEED + 1e-9, `full-strength push off the wall (vx=${v.x})`);
});

test("head-on wall bounce in a lift zone still leaves at LIFT_ZONE_MIN_BOUNCE_SPEED", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    kart.liftZones = new Map([[new Entity({ name: "lift_zone" }), C.LIFT_ZONE_UP_SPEED]]);
    const v = Tick(fallingIntoWall(-100, 300)); // head-on: a MISS
    // (minus this tick's coasting friction, applied on top of the bounce)
    assert.ok(v.x <= -C.LIFT_ZONE_MIN_BOUNCE_SPEED + C.COAST_FRICTION * DT + 1e-6, `away from the wall at the minimum speed (vx=${v.x})`);
});

// Lift zone, narrow shaft: wall A, then the opposite wall B only 0.2 s later.
function LiftShaft() {
    kart.liftZones = new Map([[new Entity({ name: "lift_zone" }), C.LIFT_ZONE_UP_SPEED]]);
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    Tick({ ...fallingIntoWall(-100), jump: true }); // wall jump off wall A
    assert.ok(kart.lastWallJump, "first wall jump");
    Geometry({ floorBelow: false }); // off wall A; wall B is simulated via kart.lastWallContact
    return kart.lastWallJump;
}

test("lift zone: the next wall jump only needs LIFT_ZONE_WALL_JUMP_COOLDOWN, not WALL_JUMP_COOLDOWN", () => {
    const first = LiftShaft();
    world.time += C.LIFT_ZONE_WALL_JUMP_COOLDOWN + DT; // still well inside WALL_JUMP_COOLDOWN
    kart.lastWallContact = { time: world.time + DT, normal: { x: 1, y: 0 } }; // touching wall B this tick
    Tick({ ...falling(-100), jump: true });
    assert.notEqual(kart.lastWallJump, first, "second wall jump off wall B");
});

test("lift zone: a jump pressed just before touching the next wall fires on the touch", () => {
    const first = LiftShaft();
    world.time += C.LIFT_ZONE_WALL_JUMP_COOLDOWN;
    Tick({ ...falling(-100), jump: true }); // pressed early: no fresh wall yet
    assert.equal(kart.lastWallJump, first, "nothing to jump off yet");
    kart.lastWallContact = { time: world.time + DT, normal: { x: 1, y: 0 } }; // touches wall B next tick
    Tick(falling(-100)); // no new press
    assert.notEqual(kart.lastWallJump, first, "the early press fired the wall jump");
});

test("lift zone: an early press older than LIFT_ZONE_JUMP_BUFFER is dropped", () => {
    const first = LiftShaft();
    world.time += C.LIFT_ZONE_WALL_JUMP_COOLDOWN;
    Tick({ ...falling(-100), jump: true });
    world.time += C.LIFT_ZONE_JUMP_BUFFER + DT;
    kart.lastWallContact = { time: world.time + DT, normal: { x: 1, y: 0 } };
    Tick(falling(-100));
    assert.equal(kart.lastWallJump, first, "too early — no wall jump");
});

test("wall jump: no wall nearby, no jump in the air", () => {
    Geometry({ floorBelow: false });
    const v = Tick({ ...falling(-100, 300), jump: true });
    assert.ok(v.z < 0);
});

test("wall jump: only once per wall until the ground is touched again", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    Tick({ ...touchingWall(-100), jump: true });
    const firstWallJump = kart.lastWallJump;
    assert.ok(firstWallJump, "first wall jump happened");
    world.time += C.WALL_JUMP_COOLDOWN + DT;
    kart.melon.origin = { ...kart.melon.origin, x: wallX - NEAR_WALL }; // back at the same wall
    const v = Tick({ ...touchingWall(-100), jump: true });
    assert.equal(kart.lastWallJump, firstWallJump, "same wall a second time: no wall jump");
    assert.ok(v.z < 0, `still falling (vz=${v.z})`);
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
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    kart.wallJumpCharge = 0.5;
    const half = Tick({ ...touchingWall(-100), jump: true });
    assert.ok(Math.abs(half.z - C.WALL_JUMP_UP_SPEED * (0.5 + DT / C.WALL_JUMP_RECHARGE_SECONDS)) < 1e-6, `half-strength jump (vz=${half.z})`);
    assert.ok(kart.wallJumpCharge < 0.5, "the jump used up charge");

    kart.lastWallJump = undefined;
    kart.wallJumpCharge = 0;
    const spent = Tick({ ...touchingWall(-100), jump: true });
    assert.ok(spent.z < 0, "no wall jump with an empty charge");
});

// Regression: a wall jump used to raise the speed cap, so chaining them
// built up speed without limit.
test("wall jump never pushes the melon past its speed cap", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    kart.speedCap = undefined; // plain MAX_SPEED
    // along the wall at top speed already, and just stopped against it
    const v = Tick({ commanded: { x: 100, y: C.MAX_SPEED, z: -100 }, actual: { x: 0, y: C.MAX_SPEED, z: -100 - C.GRAVITY * DT }, jump: true });
    assert.equal(v.z, C.WALL_JUMP_UP_SPEED, "the wall jump happened");
    assert.ok(Math.hypot(v.x, v.y) <= C.MAX_SPEED + 1e-6, `horizontal speed ${Math.hypot(v.x, v.y)} > MAX_SPEED`);
    assert.equal(kart.speedCap, C.MAX_SPEED);
});

// Regression: a press timed for a wall bounce also fired a wall jump, which
// used up charge and replaced the bounce's upward kick with the (weaker)
// wall jump's — timed bounces went lower than untimed ones.
test("a jump press on a wall bounce is only its timing — no wall jump, no charge used", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    kart.wallJumpCharge = 0.5;
    const v = Tick({ ...fallingIntoWall(-100), jump: true });
    assert.equal(kart.lastBounceTime, world.time, "the hit counted as a wall bounce");
    assert.equal(kart.lastWallJump, undefined, "no wall jump");
    assert.ok(kart.wallJumpCharge >= 0.5, `no charge used (${kart.wallJumpCharge})`);
    assert.equal(v.z, C.WALL_BOUNCE_UP_SPEED, "the bounce's kick stays");
    assert.equal(kart.pendingBounce.jumpFactor, 1, "the press counted as perfect timing");
});

test("a late press still inside the bounce's timing window is no wall jump either", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    const bounced = Tick(fallingIntoWall(-100));
    world.time += C.WALL_BOUNCE_PERFECT_JUMP_WINDOW / 2;
    Tick({ commanded: bounced, actual: { ...bounced, z: bounced.z - C.GRAVITY * DT }, jump: true });
    assert.equal(kart.lastWallJump, undefined, "no wall jump");
    assert.ok(kart.pendingBounce.jumpFactor > 0, "counted as late timing");
});

test("after a bounce's timing window, a wall jump needs the wall at the melon again", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    const bounced = Tick(fallingIntoWall(-100));
    kart.melon.origin = { ...kart.melon.origin, x: wallX - 3 * C.WALL_JUMP_CONTACT_RADIUS }; // bounced off it
    world.time += C.WALL_BOUNCE_PERFECT_JUMP_WINDOW;
    Tick({ commanded: bounced, actual: { ...bounced, z: bounced.z - C.GRAVITY * DT }, jump: true });
    assert.equal(kart.pendingBounce, undefined, "the bounce's timing window has closed");
    assert.equal(kart.lastWallJump, undefined, "off the wall: no wall jump");
});

test("in a lift zone a wall jump may still follow a bounce at once", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    kart.liftZones = new Map([[new Entity({ name: "lift_zone" }), C.LIFT_ZONE_UP_SPEED]]);
    Tick({ ...fallingIntoWall(-100), jump: true });
    assert.equal(kart.lastBounceTime, world.time, "a wall bounce");
    assert.ok(kart.lastWallJump, "and a wall jump");
});

// Regression: a wall jump set the upward speed to WALL_JUMP_UP_SPEED ×
// charge, so one right after a ground jump (or during a jump pad flight)
// slowed the climb.
test("a wall jump never lowers the upward speed", () => {
    const wallX = kart.melon.GetAbsOrigin().x + NEAR_WALL;
    Geometry({ floorBelow: false, wallX });
    const rising = C.WALL_JUMP_UP_SPEED + 200;
    const v = Tick({ commanded: { x: C.WALL_BOUNCE_MIN_IMPACT / 2, y: 0, z: rising }, actual: { x: 0, y: 0, z: rising - C.GRAVITY * DT }, jump: true });
    assert.ok(kart.lastWallJump, "the wall jump happened");
    assert.equal(v.z, rising - C.GRAVITY * DT, "upward speed kept");
    assert.ok(v.x <= -C.WALL_JUMP_PUSH_SPEED + 1e-9, `still pushed off the wall (vx=${v.x})`);
});

// Regression: the charge only refilled on ticks that got as far as the jump
// handling — standing still (settled) or race-locked froze the HUD bar.
test("the wall-jump charge refills while standing still and while race-locked", () => {
    Geometry();
    kart.wallJumpCharge = 0.5;
    Tick({ commanded: { x: 0, y: 0, z: 0 }, actual: { x: 0, y: 0, z: 0 } });
    assert.ok(kart.settled, "test setup: the melon is at rest");
    assert.ok(Math.abs(kart.wallJumpCharge - (0.5 + DT / C.WALL_JUMP_RECHARGE_SECONDS)) < 1e-9, `refilled at rest (${kart.wallJumpCharge})`);
    kart.locked = true;
    const before = kart.wallJumpCharge;
    Tick({ commanded: { x: 0, y: 0, z: 0 }, actual: { x: 0, y: 0, z: 0 } });
    assert.ok(kart.wallJumpCharge > before, "refilled while locked");
});

test("a melon arriving whole (full health restored) has a full wall-jump charge", async () => {
    const { RestoreFullHealth } = await import("../../src/melon_drive/health/heal/index.js");
    kart.wallJumpCharge = 0;
    RestoreFullHealth(kart);
    assert.equal(kart.wallJumpCharge, 1);
});

// Regression: any press within WALL_TIMING_SPAM_LOCKOUT of the previous one
// locked timing credit — a ground jump at a wall and then a timed press on
// the hit never got credit.
test("a ground jump just before doesn't block timing credit on the following wall hit", () => {
    Geometry();
    Tick({ ...rolling(), jump: true }); // ground jump
    assert.ok(kart.lastJumpTime === world.time, "test setup: ground jump");
    world.time += WALL_TIMING_SPAM_LOCKOUT_HALF();
    Geometry({ floorBelow: false, wallX: kart.melon.GetAbsOrigin().x + NEAR_WALL });
    Tick({ ...fallingIntoWall(-100), jump: true });
    assert.equal(kart.pendingBounce?.jumpFactor, 1, "the press on the hit counted as perfect timing");
});

test("mashing jump in the air still locks timing credit", () => {
    Geometry({ floorBelow: false });
    Tick({ ...falling(-100, 300), jump: true }); // does nothing: in the air, no wall
    world.time += WALL_TIMING_SPAM_LOCKOUT_HALF();
    Tick({ ...falling(-100, 300), jump: true }); // again — mashing
    world.time += WALL_TIMING_SPAM_LOCKOUT_HALF() / 2;
    Geometry({ floorBelow: false, wallX: kart.melon.GetAbsOrigin().x + NEAR_WALL });
    Tick({ ...fallingIntoWall(-100), jump: true });
    assert.equal(kart.lastBounceTime, world.time, "a wall bounce");
    assert.equal(kart.pendingBounce.jumpFactor, 0, "no timing credit while mashing");
});

test("the jump bar shows the wall-jump charge", async () => {
    const { GetJumpChargeFraction } = await import("../../src/melon_drive/movement/index.js");
    kart.wallJumpCharge = 0.25;
    assert.equal(GetJumpChargeFraction(kart), 0.25);
});

test("collision debug view: wall probes show on the ground too, without counting as wall contact", async () => {
    const { SetCollisionDebug } = await import("../../src/melon_drive/dev/index.js");
    Geometry({ wallX: kart.melon.GetAbsOrigin().x + NEAR_WALL }); // floor + wall
    Tick(rolling(0));
    assert.equal(kart.contactDebug, undefined, "nothing recorded while off");
    SetCollisionDebug(kart, true);
    Tick(rolling(0));
    assert.ok(kart.contactDebug.probes.length > 0, "probes ran on the ground");
    assert.ok(kart.contactDebug.wall?.touching, "the wall is shown at the melon");
    assert.equal(kart.lastWallContact, undefined, "but on the ground it's no wall contact");
});

test("collision debug view: off by default, logs jump presses once switched on", async () => {
    const { SetCollisionDebug } = await import("../../src/melon_drive/dev/index.js");
    Geometry({ floorBelow: false, wallX: kart.melon.GetAbsOrigin().x + NEAR_WALL });
    Tick({ ...falling(-100, 300), jump: true });
    assert.ok(!world.messages.some((m) => m.includes("[collision debug]")), "nothing logged while off");
    SetCollisionDebug(kart, true);
    Tick({ ...falling(-100, 300), jump: true }); // draws probes + wall check, logs the press
    assert.ok(world.messages.some((m) => m.includes("[collision debug]") && m.includes("wall contact")));
    assert.ok(kart.contactDebug && kart.contactDebug.probes.length > 0, "probes recorded");
    SetCollisionDebug(kart, false);
    assert.equal(kart.contactDebug, undefined);
});
