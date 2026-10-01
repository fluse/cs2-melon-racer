// A broken melon's physics motion is off until its respawn: it stays hidden at
// the crash site, the break's prop_physics pieces spawn right inside it, and
// with motion on they'd shove it — and the chase camera following it —
// around. Runs the real BreakMelon against the fake engine in
// helpers/cs-script-mock.mjs.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { BreakMelon } = await import("../../src/melon_drive/health/index.js");
const { MELON_TEMPLATE_NAME, INTRO_SPAWN_NAME } = await import("../../src/melon_drive/constants/index.js");

/** Settles Instance.Delay(...).then(...) chains (the fake Delay resolves immediately). */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** @type {any} */
let kart;

/** The motion inputs fired at the kart's melon so far, in order. */
const motionInputs = () => world.fired
    .filter((f) => f.target === kart.melon && /Motion$/.test(f.input))
    .map((f) => f.input);

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetIntroSpawnPoint());
    assert.ok(kart, "setup: kart created");
});

test("breaking switches the melon's motion off, the respawn switches it back on", async () => {
    BreakMelon(0, kart, { x: 1, y: 0, z: 0 }, 900);
    assert.deepEqual(motionInputs(), ["DisableMotion"], "off for the whole break");

    await flush(); // BREAK_RESPAWN_DELAY over
    assert.equal(kart.breaking, false, "setup: respawned");
    assert.deepEqual(motionInputs(), ["DisableMotion", "EnableMotion"]);
});

test("a second break while already broken doesn't fire anything again", () => {
    BreakMelon(0, kart, { x: 1, y: 0, z: 0 }, 900);
    BreakMelon(0, kart, { x: 1, y: 0, z: 0 }, 900);
    assert.deepEqual(motionInputs(), ["DisableMotion"]);
});
