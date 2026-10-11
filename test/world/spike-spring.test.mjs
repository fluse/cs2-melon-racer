// Spike springs: the rules (world/spike-spring/logic.js) and UpdateSpikeSprings
// against the fake engine — every prop_dynamic named "spike_spring…" gets its
// rise/sink on the shared clock, and a melon over it breaks while its spikes
// are out (not while they're down, not a race-locked one).
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { ParseSpikeSpringName, SpikeSpringPeriod, SpikeSpringState, SpikeSpringInputs, IsOverSpikeSpring } = await import("../../src/melon_drive/world/spike-spring/logic.js");
const { spikeSprings, UpdateSpikeSprings, ResetSpikeSprings } = await import("../../src/melon_drive/world/index.js");
const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const C = await import("../../src/melon_drive/constants/index.js");

const DEFAULT = { down: C.SPIKE_SPRING_DOWN_SECONDS, up: C.SPIKE_SPRING_UP_SECONDS, offset: 0 };

test("spike spring names: plain, timed, offset, words anywhere", () => {
    assert.deepEqual(ParseSpikeSpringName("spike_spring"), DEFAULT);
    assert.deepEqual(ParseSpikeSpringName("spike_spring_left"), DEFAULT);
    assert.deepEqual(ParseSpikeSpringName("spike_spring_2_0.5"), { down: 2, up: 0.5, offset: 0 });
    assert.deepEqual(ParseSpikeSpringName("spike_spring_offset1.2"), { ...DEFAULT, offset: 1.2 });
    assert.deepEqual(ParseSpikeSpringName("spike_spring_2_1_offset0.5_a"), { down: 2, up: 1, offset: 0.5 });
    assert.deepEqual(ParseSpikeSpringName("spike_spring_downtime_uptime_1.5_0.5"), { down: 1.5, up: 0.5, offset: 0 });
    assert.deepEqual(ParseSpikeSpringName("spike_spring_offset0.3_row_a_3_0.5"), { down: 3, up: 0.5, offset: 0.3 });
    assert.deepEqual(ParseSpikeSpringName("spike_spring_2"), DEFAULT, "one number alone isn't a timing");
    assert.equal(ParseSpikeSpringName("spike_springs"), undefined);
    assert.equal(ParseSpikeSpringName("spring_spike"), undefined);
});

test("one round: down, rise (hurts after the pop), up, sink (hurts for its first share)", () => {
    const c = { down: 2, up: 1, offset: 0 };
    const rise = c.down, up = rise + C.SPIKE_SPRING_RISE_SECONDS, sink = up + c.up;
    assert.deepEqual(SpikeSpringState(0, c), { phase: "down", lethal: false });
    assert.deepEqual(SpikeSpringState(rise + C.SPIKE_SPRING_POP_SECONDS / 2, c), { phase: "rise", lethal: false });
    assert.deepEqual(SpikeSpringState(rise + C.SPIKE_SPRING_POP_SECONDS, c), { phase: "rise", lethal: true });
    assert.deepEqual(SpikeSpringState(up + 0.01, c), { phase: "up", lethal: true });
    const lethalSink = C.SPIKE_SPRING_SINK_SECONDS * C.SPIKE_SPRING_SINK_LETHAL_SHARE;
    assert.deepEqual(SpikeSpringState(sink + lethalSink * 0.9, c), { phase: "sink", lethal: true });
    assert.deepEqual(SpikeSpringState(sink + lethalSink * 1.1, c), { phase: "sink", lethal: false });
    assert.deepEqual(SpikeSpringState(SpikeSpringPeriod(c), c), { phase: "down", lethal: false }, "starts over");
});

test("the offset runs a spring's clock ahead", () => {
    const c = { down: 2, up: 1, offset: 2 };
    assert.equal(SpikeSpringState(0, c).phase, "rise");
    assert.equal(SpikeSpringState(0, { ...c, offset: 0 }).phase, "down");
});

test("inputs: rise and sink play once and set the pose after them; any other jump snaps", () => {
    assert.deepEqual(SpikeSpringInputs("down", "rise"), [["SetAnimationNotLooping", "rise"], ["SetIdleAnimationLooping", "up"]]);
    assert.deepEqual(SpikeSpringInputs("up", "sink"), [["SetAnimationNotLooping", "sink"], ["SetIdleAnimationLooping", "down"]]);
    assert.deepEqual(SpikeSpringInputs("rise", "up"), []);
    assert.deepEqual(SpikeSpringInputs("sink", "down"), []);
    assert.deepEqual(SpikeSpringInputs("up", "up"), []);
    assert.deepEqual(SpikeSpringInputs(undefined, "up"), [["SetAnimationLooping", "up"], ["SetIdleAnimationLooping", "up"]]);
    assert.deepEqual(SpikeSpringInputs(undefined, "sink"), [["SetAnimationLooping", "down"], ["SetIdleAnimationLooping", "down"]]);
});

/** Angles in degrees. */
const At = (pitch, yaw, roll) => ({ pitch, yaw, roll });
const FLAT = At(0, 0, 0);

test("over the spikes on the floor: inside the square, turned with the yaw, between depth and height", () => {
    const h = C.SPIKE_SPRING_HALF_SIZE;
    assert.ok(IsOverSpikeSpring({ x: 0, y: 0, z: 10 }, FLAT));
    assert.ok(IsOverSpikeSpring({ x: h, y: h, z: 0 }, FLAT), "corner");
    assert.ok(!IsOverSpikeSpring({ x: h + 1, y: 0, z: 0 }, FLAT));
    assert.ok(!IsOverSpikeSpring({ x: h, y: h, z: 0 }, At(0, 45, 0)), "the corner is outside once turned 45°");
    assert.ok(IsOverSpikeSpring({ x: h * 1.3, y: 0, z: 0 }, At(0, 45, 0)), "but the diagonal reaches further");
    assert.ok(!IsOverSpikeSpring({ x: 0, y: 0, z: C.SPIKE_SPRING_HEIGHT + 1 }, FLAT), "jumped over");
    assert.ok(!IsOverSpikeSpring({ x: 0, y: 0, z: -C.SPIKE_SPRING_DEPTH - 1 }, FLAT));
});

test("on a ceiling (roll 180) the spikes point down", () => {
    const ceiling = At(0, 0, 180);
    assert.ok(IsOverSpikeSpring({ x: 0, y: 0, z: -20 }, ceiling), "under it");
    assert.ok(!IsOverSpikeSpring({ x: 0, y: 0, z: 20 }, ceiling), "above it, behind the ceiling");
    assert.ok(!IsOverSpikeSpring({ x: 0, y: 0, z: -C.SPIKE_SPRING_HEIGHT - 1 }, ceiling), "too far below");
});

test("on a wall the zone sticks out of it sideways", () => {
    // Pitch 90 turns the spikes towards +X, roll 90 towards -Y, any yaw on top.
    assert.ok(IsOverSpikeSpring({ x: 20, y: 0, z: 0 }, At(90, 0, 0)));
    assert.ok(!IsOverSpikeSpring({ x: -20, y: 0, z: 0 }, At(90, 0, 0)), "behind the wall");
    assert.ok(!IsOverSpikeSpring({ x: 0, y: 0, z: 20 }, At(90, 0, 0)), "above it, where a floor spring would reach");
    assert.ok(IsOverSpikeSpring({ x: 0, y: -20, z: 0 }, At(0, 0, 90)));
    assert.ok(!IsOverSpikeSpring({ x: 0, y: 20, z: 0 }, At(0, 0, 90)));
    assert.ok(IsOverSpikeSpring({ x: 0, y: 20, z: 0 }, At(90, 90, 0)), "pitch 90, yaw 90: towards +Y");
    const h = C.SPIKE_SPRING_HALF_SIZE;
    assert.ok(IsOverSpikeSpring({ x: 20, y: h, z: h }, At(90, 0, 0)), "the square lies in the wall");
    assert.ok(!IsOverSpikeSpring({ x: 20, y: 0, z: h + 1 }, At(90, 0, 0)));
});

/** @type {any} */
let kart;

beforeEach(() => {
    world.reset();
    karts.clear();
    ResetSpikeSprings();
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    world.add(new Entity({ name: C.HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetIntroSpawnPoint());
    assert.ok(kart, "setup: kart created");
});

/** @param {string} name @param {string} [className] */
const AddSpring = (name, className = C.SPIKE_SPRING_CLASS) => world.add(new Entity({ name, className, origin: { x: 500, y: 0, z: 0 } }));
/** @param {Entity} target */
const FiredAt = (target) => world.fired.filter((f) => f.target === target).map((f) => [f.input, f.value]);
const RISE_AT = C.SPIKE_SPRING_DOWN_SECONDS;
const UP_AT = RISE_AT + C.SPIKE_SPRING_RISE_SECONDS + 0.01;

test("only prop_dynamics named spike_spring… are run; the first update snaps their pose", () => {
    const spring = AddSpring("spike_spring");
    const other = AddSpring("spike_lamp");
    const brush = AddSpring("spike_spring_brush", "func_brush");
    UpdateSpikeSprings(0);
    assert.deepEqual(FiredAt(spring), [["SetAnimationLooping", "down"], ["SetIdleAnimationLooping", "down"]]);
    assert.deepEqual(FiredAt(other), []);
    assert.deepEqual(FiredAt(brush), []);
    assert.equal(spikeSprings.size, 1);
});

test("rise and sink are fired once each, on the clock", () => {
    const spring = AddSpring("spike_spring");
    UpdateSpikeSprings(0);
    world.fired = [];
    UpdateSpikeSprings(RISE_AT + 0.01);
    UpdateSpikeSprings(RISE_AT + 0.02);
    assert.deepEqual(FiredAt(spring), [["SetAnimationNotLooping", "rise"], ["SetIdleAnimationLooping", "up"]]);
    world.fired = [];
    UpdateSpikeSprings(UP_AT);
    assert.deepEqual(FiredAt(spring), [], "up: the idle animation holds the pose");
    UpdateSpikeSprings(UP_AT + C.SPIKE_SPRING_UP_SECONDS);
    assert.deepEqual(FiredAt(spring), [["SetAnimationNotLooping", "sink"], ["SetIdleAnimationLooping", "down"]]);
});

test("a melon on the spikes breaks while they're out, not while they're down", () => {
    AddSpring("spike_spring");
    kart.melon.Teleport({ position: { x: 505, y: 3, z: 8 } });
    UpdateSpikeSprings(0);
    assert.ok(!kart.breaking, "down: safe");
    UpdateSpikeSprings(UP_AT);
    assert.equal(kart.breaking, true, "up: broken");
});

test("a melon beside it, or a race-locked one, isn't broken", () => {
    AddSpring("spike_spring");
    kart.melon.Teleport({ position: { x: 500 + C.SPIKE_SPRING_HALF_SIZE + 10, y: 0, z: 8 } });
    UpdateSpikeSprings(UP_AT);
    assert.ok(!kart.breaking, "beside it");
    kart.melon.Teleport({ position: { x: 500, y: 0, z: 8 } });
    kart.locked = true;
    UpdateSpikeSprings(UP_AT);
    assert.ok(!kart.breaking, "race-locked");
});

test("a spring that spawns later joins at the next search", () => {
    AddSpring("spike_spring");
    UpdateSpikeSprings(0);
    const late = AddSpring("spike_spring_late");
    UpdateSpikeSprings(0.1);
    assert.equal(spikeSprings.size, 1, "not searched again yet");
    UpdateSpikeSprings(C.SPIKE_SPRING_SCAN_SECONDS);
    assert.ok(spikeSprings.has(late));
    assert.ok(world.messages.some((m) => m.includes("spike_spring_late")), "said in the console");
});

test("a round restart looks the springs up again", () => {
    const old = AddSpring("spike_spring");
    UpdateSpikeSprings(0);
    old.Remove();
    ResetSpikeSprings();
    const fresh = AddSpring("spike_spring");
    UpdateSpikeSprings(0);
    assert.deepEqual([...spikeSprings.keys()], [fresh]);
});

test("a spring in the ceiling breaks a melon under it, not one on the floor above", () => {
    world.add(new Entity({ name: "spike_spring", className: C.SPIKE_SPRING_CLASS, origin: { x: 500, y: 0, z: 100 }, angles: { pitch: 0, yaw: 0, roll: 180 } }));
    kart.melon.Teleport({ position: { x: 500, y: 0, z: 120 } });
    UpdateSpikeSprings(UP_AT);
    assert.ok(!kart.breaking, "above the ceiling");
    kart.melon.Teleport({ position: { x: 500, y: 0, z: 75 } });
    UpdateSpikeSprings(UP_AT);
    assert.equal(kart.breaking, true, "under it");
});
