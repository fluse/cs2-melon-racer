// The free-look drone: its pure rules (dev/drone-logic.js) and flying it
// against the fake engine (dev/free-look.js, UpdateDrone) — into the world
// it slides, through melons it flies.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { DroneWishVelocity, StepDroneVelocity, ClipVelocity, DroneTargetTilt, StepDroneTilt } from "../../src/melon_drive/dev/drone-logic.js";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { SetFreeLook, UpdateDrone } = await import("../../src/melon_drive/dev/free-look.js");
const C = await import("../../src/melon_drive/constants/index.js");

const close = (a, b) => Math.abs(a - b) < 1e-6;

test("wish velocity: W along the view (diving when looking down), A/D level sideways, jump/duck straight up/down", () => {
    const level = DroneWishVelocity({ forward: 1, strafe: 0, lift: 0 }, { pitch: 0, yaw: 90 }, 100);
    assert.ok(close(level.x, 0) && close(level.y, 100) && close(level.z, 0));
    const down = DroneWishVelocity({ forward: 1, strafe: 0, lift: 0 }, { pitch: 90, yaw: 0 }, 100);
    assert.ok(close(down.z, -100), "looking straight down, W dives");
    const right = DroneWishVelocity({ forward: 0, strafe: 1, lift: 0 }, { pitch: 40, yaw: 0 }, 100);
    assert.ok(close(right.x, 0) && close(right.y, -100) && close(right.z, 0), "D: to the right, level");
    const up = DroneWishVelocity({ forward: 0, strafe: 0, lift: 1 }, { pitch: 0, yaw: 0 }, 100);
    assert.ok(close(up.z, 100));
    const both = DroneWishVelocity({ forward: 1, strafe: 1, lift: 0 }, { pitch: 0, yaw: 0 }, 100);
    assert.ok(close(Math.hypot(both.x, both.y, both.z), 100), "diagonal isn't faster");
    assert.deepEqual(DroneWishVelocity({ forward: 0, strafe: 0, lift: 0 }, { pitch: 0, yaw: 0 }, 100), { x: 0, y: 0, z: 0 });
});

test("inertia: two thirds of the way to the wish after 1/DRONE_RESPONSE s, the same for any tick length; coasting on after letting go", () => {
    const t = 1 / C.DRONE_RESPONSE;
    const once = StepDroneVelocity({ x: 0, y: 0, z: 0 }, { x: 600, y: 0, z: 0 }, t);
    assert.ok(close(once.x, 600 * (1 - Math.exp(-1))));
    let ticks = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 10; i++) {
        ticks = StepDroneVelocity(ticks, { x: 600, y: 0, z: 0 }, t / 10);
    }
    assert.ok(close(ticks.x, once.x), "tick length doesn't matter");
    const coasting = StepDroneVelocity({ x: 600, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0.1);
    assert.ok(close(coasting.x, 600 * Math.exp(-C.DRONE_RESPONSE * 0.1)) && coasting.x > 300, "still flying a tick after letting go");
    const turning = StepDroneVelocity({ x: 600, y: 0, z: 0 }, { x: 0, y: 600, z: 0 }, 0.1);
    assert.ok(turning.x > turning.y, "carries its momentum into a turn");
});

test("clipping: what goes into a surface is taken away, the rest slides along it", () => {
    assert.deepEqual(ClipVelocity({ x: -100, y: 50, z: 0 }, { x: 1, y: 0, z: 0 }), { x: 0, y: 50, z: 0 });
    assert.deepEqual(ClipVelocity({ x: 100, y: 50, z: 0 }, { x: 1, y: 0, z: 0 }), { x: 100, y: 50, z: 0 }, "moving away: untouched");
});

test("tilt: leans into speeding up, back when braking, a little while cruising — eased at DRONE_TILT_RATE", () => {
    const fullAccel = C.DRONE_RESPONSE * C.DRONE_SPEED;
    const pulling = DroneTargetTilt({ x: 0, y: 0, z: 0 }, { x: fullAccel, y: 0, z: 0 }, 0, C.DRONE_SPEED);
    assert.equal(pulling.pitch, C.DRONE_MAX_TILT, "nose down pulling away");
    assert.equal(pulling.roll, 0);
    const braking = DroneTargetTilt({ x: C.DRONE_SPEED, y: 0, z: 0 }, { x: -fullAccel, y: 0, z: 0 }, 0, C.DRONE_SPEED);
    assert.ok(braking.pitch < 0, "nose up braking");
    const cruising = DroneTargetTilt({ x: C.DRONE_SPEED, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0, C.DRONE_SPEED);
    assert.ok(close(cruising.pitch, C.DRONE_CRUISE_TILT * C.DRONE_MAX_TILT));
    const right = DroneTargetTilt({ x: 0, y: 0, z: 0 }, { x: 0, y: -fullAccel / 2, z: 0 }, 0, C.DRONE_SPEED);
    assert.ok(close(right.roll, C.DRONE_MAX_TILT / 2), "right side down speeding up to the right");
    const eased = StepDroneTilt({ pitch: 0, roll: 0 }, { pitch: 90, roll: -90 }, 0.1);
    assert.deepEqual(eased, { pitch: C.DRONE_TILT_RATE * 0.1, roll: -C.DRONE_TILT_RATE * 0.1 });
});

/** @type {any} */
let kart;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 0 } }));
    world.add(new PointTemplate({ name: C.DRONE_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_dynamic" })] }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetHubSpawnPoint());
    assert.equal(SetFreeLook(kart, true), true, "setup: flying");
});

test("W flies the drone along the view; it ends up tipped into its flight", () => {
    const start = { ...kart.drone.position };
    kart.pawn.pressed.add("FORWARD");
    for (let i = 0; i < 20; i++) {
        UpdateDrone(kart, 0.1);
    }
    const at = kart.drone.body.GetAbsOrigin();
    assert.ok(at.x > start.x + 500, "flew forward (yaw 0 = +x)");
    assert.ok(close(at.y, start.y) && close(at.z, start.z));
    assert.ok(kart.drone.body.GetAbsAngles().pitch > 0, "leaning forward");
    assert.equal(kart.pawn.GetAbsOrigin().x, kart.pawnAnchor.x, "the pawn stays at its anchor");
});

test("a wall stops the drone and it slides along; a melon in the way doesn't", () => {
    const other = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 1 })), GetHubSpawnPoint());
    kart.pawn.pressed.add("FORWARD").add("LEFT"); // ahead and to the left: +x, +y
    kart.drone.velocity = DroneWishVelocity({ forward: 1, strafe: -1, lift: 0 }, { pitch: 0, yaw: 0 }, C.DRONE_SPEED);
    const start = { ...kart.drone.position };
    // A wall facing -x a few units ahead; the other player's melon right in front of it.
    world.traceSphere = (c) => {
        const ignored = [].concat(c.ignoreEntity ?? []);
        if (!ignored.includes(other.melon) && c.end.x > start.x + 1) {
            return { didHit: true, fraction: 0.1, end: { ...c.start, x: c.start.x + 1 }, normal: { x: -1, y: 0, z: 0 }, hitEntity: other.melon, startedInSolid: false };
        }
        if (c.end.x > start.x + 5) {
            const fraction = (start.x + 5 - c.start.x) / (c.end.x - c.start.x);
            return { didHit: true, fraction, end: { x: start.x + 5, y: c.start.y + (c.end.y - c.start.y) * fraction, z: c.start.z }, normal: { x: -1, y: 0, z: 0 }, startedInSolid: false };
        }
        return { didHit: false, fraction: 1, end: c.end, normal: { x: 0, y: 0, z: 0 }, startedInSolid: false };
    };
    UpdateDrone(kart, 0.1);
    const at = kart.drone.position;
    assert.ok(at.x <= start.x + 5, "stopped at the wall, not at the melon in front of it");
    assert.ok(at.x > start.x + 1, "flew through the melon");
    assert.ok(at.y > start.y + 1, "slid along the wall");
    assert.equal(kart.drone.velocity.x, 0, "nothing left into the wall");
});
