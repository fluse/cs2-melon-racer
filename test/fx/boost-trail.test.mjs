// The boost trail: when it's on (fx/boost-trail/logic.js) and how
// src/melon_drive/fx/boost-trail/boost-trail.js starts, keeps and stops it on a melon,
// against the fake engine in helpers/cs-script-mock.mjs.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { ShouldShowBoostTrail } = await import("../../src/melon_drive/fx/boost-trail/logic.js");
const { UpdateBoostTrail, StopBoostTrail } = await import("../../src/melon_drive/fx/boost-trail/boost-trail.js");
const { MAX_SPEED, BOOST_TRAIL_START_MARGIN, BOOST_TRAIL_STOP_MARGIN, BOOST_TRAIL_TEMPLATE_NAME, BOOST_TRAIL_FADE_SECONDS } =
    await import("../../src/melon_drive/constants/index.js");

/** Settles Instance.Delay(...).then(...) chains (the fake Delay resolves immediately). */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const HERE = { x: 1000, y: 2000, z: 64 };
const between = MAX_SPEED + (BOOST_TRAIL_START_MARGIN + BOOST_TRAIL_STOP_MARGIN) / 2;

test("off at normal top speed, on well above it", () => {
    assert.equal(ShouldShowBoostTrail(false, MAX_SPEED, false), false);
    assert.equal(ShouldShowBoostTrail(false, MAX_SPEED + BOOST_TRAIL_START_MARGIN + 1, false), true);
});

test("hysteresis: between the margins it keeps whatever state it's in", () => {
    assert.equal(ShouldShowBoostTrail(false, between, false), false);
    assert.equal(ShouldShowBoostTrail(true, between, false), true);
    assert.equal(ShouldShowBoostTrail(true, MAX_SPEED + BOOST_TRAIL_STOP_MARGIN - 1, false), false);
});

test("never for a broken or race-locked melon, however fast", () => {
    assert.equal(ShouldShowBoostTrail(false, MAX_SPEED * 3, true), false);
    assert.equal(ShouldShowBoostTrail(true, MAX_SPEED * 3, true), false);
    assert.equal(ShouldShowBoostTrail(false, MAX_SPEED * 3, true, true), false);
});

test("a PERFECT bounce's speed shows no trail (only its spark); the attack boost still does", () => {
    const fast = MAX_SPEED + BOOST_TRAIL_START_MARGIN + 100;
    assert.equal(ShouldShowBoostTrail(false, fast, false, false, true), false);
    assert.equal(ShouldShowBoostTrail(true, fast, false, false, true), false);
    assert.equal(ShouldShowBoostTrail(false, fast, false, true, true), true);
});

test("after a PERFECT bounce no trail starts; once back at normal speed, the next boost shows one again", () => {
    AddTemplate();
    const kart = Kart(MAX_SPEED * 1.3);
    kart.perfectBounceBoost = true;
    UpdateBoostTrail(kart);
    assert.equal(firedInputs("Start").length, 0);
    kart.melon.Teleport({ velocity: { x: MAX_SPEED, y: 0, z: 0 } });
    UpdateBoostTrail(kart);
    assert.equal(kart.perfectBounceBoost, false);
    kart.melon.Teleport({ velocity: { x: MAX_SPEED * 1.3, y: 0, z: 0 } });
    UpdateBoostTrail(kart);
    assert.equal(firedInputs("Start").length, 1);
});

test("the attack boost shows it at once, at any speed — like Rocket League", () => {
    assert.equal(ShouldShowBoostTrail(false, 0, false, true), true);
    assert.equal(ShouldShowBoostTrail(false, MAX_SPEED / 2, false, true), true);
});

/** A template holding one particle system at a Hammer offset from it. */
function AddTemplate() {
    return world.add(new PointTemplate({
        name: BOOST_TRAIL_TEMPLATE_NAME,
        spawn: () => [new Entity({ className: "info_particle_system", origin: { x: 300, y: 0, z: 0 } })],
    }));
}

/** A kart as far as UpdateBoostTrail looks at it, moving at `speed` along x. @param {number} speed */
function Kart(speed) {
    const melon = world.add(new Entity({ className: "prop_physics_multiplayer", origin: HERE }));
    melon.Teleport({ velocity: { x: speed, y: 0, z: -50 } });
    return /** @type {any} */ ({ melon, breaking: false, locked: false });
}

/** @param {string} input */
const firedInputs = (input) => world.fired.filter((f) => f.input === input).map((f) => f.target);

beforeEach(() => world.reset());

test("a boost starts one trail on the melon, riding along, and doesn't respawn it every tick", () => {
    AddTemplate();
    const kart = Kart(MAX_SPEED * 1.3);
    UpdateBoostTrail(kart);
    UpdateBoostTrail(kart);
    const started = firedInputs("Start");
    assert.equal(started.length, 1);
    assert.deepEqual(started[0].GetAbsOrigin(), HERE);
    assert.equal(started[0].GetParent(), kart.melon);
});

test("pressing attack boost starts it on a slow melon, letting go stops it", () => {
    AddTemplate();
    const kart = Kart(MAX_SPEED / 2);
    kart.attackBoosting = true;
    UpdateBoostTrail(kart);
    assert.equal(firedInputs("Start").length, 1);
    kart.attackBoosting = false;
    UpdateBoostTrail(kart);
    assert.equal(firedInputs("Stop").length, 1);
    assert.equal(kart.boostTrail, undefined);
});

test("slowing down stops it, and its entities go once the particles have faded", async () => {
    AddTemplate();
    const kart = Kart(MAX_SPEED * 1.3);
    UpdateBoostTrail(kart);
    const [trail] = firedInputs("Start");
    kart.melon.Teleport({ velocity: { x: MAX_SPEED, y: 0, z: 0 } });
    UpdateBoostTrail(kart);
    assert.deepEqual(firedInputs("Stop"), [trail]);
    assert.equal(kart.boostTrail, undefined);
    assert.deepEqual(world.delays, [BOOST_TRAIL_FADE_SECONDS]);
    await flush();
    assert.equal(trail.IsValid(), false);
});

test("breaking stops it even at full speed", () => {
    AddTemplate();
    const kart = Kart(MAX_SPEED * 1.3);
    UpdateBoostTrail(kart);
    kart.breaking = true;
    UpdateBoostTrail(kart);
    assert.equal(firedInputs("Stop").length, 1);
});

test("a new melon entity gets its own trail instead of keeping the old one's", () => {
    AddTemplate();
    const kart = Kart(MAX_SPEED * 1.3);
    UpdateBoostTrail(kart);
    kart.melon = Kart(MAX_SPEED * 1.3).melon;
    UpdateBoostTrail(kart);
    assert.equal(firedInputs("Stop").length, 1);
    const started = firedInputs("Start");
    assert.equal(started.length, 2);
    assert.equal(started[1].GetParent(), kart.melon);
});

test("without the template in the map nothing breaks — and StopBoostTrail on no trail is a no-op", () => {
    const kart = Kart(MAX_SPEED * 1.3);
    UpdateBoostTrail(kart);
    assert.deepEqual(firedInputs("Start"), []);
    StopBoostTrail(kart);
    StopBoostTrail(kart);
    assert.deepEqual(firedInputs("Stop"), []);
});
