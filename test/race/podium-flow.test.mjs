// The podium through the real heat flow (race/heat/race-flow.js →
// race/podium/podium.js) and the real UpdateKart, against the fake engine:
// the top three end up on their podium_spawn_<place> after the last track,
// held there (jumping works, driving doesn't) until the hold runs out or
// something takes them down.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { RespawnKartAtCheckpoint } = await import("../../src/melon_drive/kart/teleport.js");
const flow = await import("../../src/melon_drive/race/heat/race-flow.js");
const { TryStartRace, TryAbortRace, FinishKart, UpdateRaceFlow, RestoreRaceFlowSnapshot } = flow;
const { UpdateKart } = await import("../../src/melon_drive/movement/index.js");
const C = await import("../../src/melon_drive/constants/index.js");

const TRACK = 1;
const HUB = { x: 250, y: -520, z: 16 };
/** Podium steps, well away from the hub spawn. */
const STEP = { 1: { x: 1000, y: 0, z: 64 }, 2: { x: 1000, y: 100, z: 48 }, 3: { x: 1000, y: -100, z: 32 } };
const DT = 1 / 64;

/** @type {any[]} */
let kartList;

/** @param {number} slot @param {string} playerName */
function AddKart(slot, playerName) {
    const pawn = world.add(new CSPlayerPawn({ slot, playerName }));
    world.playerPawns.push(pawn);
    return SetUpPlayerKart(pawn, GetHubSpawnPoint());
}

/** @param {number} time */
function Tick(time) {
    world.time = time;
    UpdateRaceFlow(time);
}

/** A one-track Grand Prix for `racers`, finished in `order`, back in the hub at time 100. */
function RunGrandPrix(racers, order) {
    for (const kart of racers) {
        kart.inHub = true;
    }
    world.time = 0;
    TryStartRace();
    Tick(C.COUNTDOWN_SECONDS);
    for (const kart of order) {
        FinishKart(kart);
    }
    Tick(10);
    Tick(100);
    assert.equal(flow.phase, C.RacePhase.HUB, "setup: back in the hub");
}

/** Floor straight under everything (the spawn points' floor traces land on it). */
function Floor() {
    world.traceLine = (c) => {
        const down = c.end.z < c.start.z - 1;
        return down
            ? { didHit: true, startedInSolid: false, fraction: 0.5, end: { ...c.end, z: c.start.z - C.FLOOR_TRACE_UP }, normal: { x: 0, y: 0, z: 1 } }
            : { didHit: false, startedInSolid: false, fraction: 1, end: c.end, normal: { x: 0, y: 0, z: 1 } };
    };
}

beforeEach(() => {
    world.reset();
    karts.clear();
    RestoreRaceFlowSnapshot({ phase: C.RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });
    Floor();
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.HUB_SPAWN_NAME, className: "info_player_start", origin: HUB }));
    for (const place of [1, 2, 3]) {
        world.add(new Entity({ name: C.PodiumSpawnName(place), className: "info_target", origin: STEP[place], angles: { pitch: 0, yaw: 180, roll: 0 } }));
    }
    world.add(new Entity({ name: `start_${TRACK}`, className: "trigger_multiple", origin: { x: 3000, y: 0, z: 0 } }));
    world.add(new Entity({ name: `checkpoint_${TRACK}_1`, className: "trigger_multiple", origin: { x: 3000, y: 0, z: 0 } }));
    kartList = ["Anna", "Ben", "Cleo", "Dan"].map((name, slot) => AddKart(slot, name));
});

/** @param {any} kart @param {number} place */
function AssertOnStep(kart, place) {
    const at = kart.melon.GetAbsOrigin();
    assert.equal(at.x, STEP[place].x, `place ${place}: x`);
    assert.equal(at.y, STEP[place].y, `place ${place}: y`);
    assert.equal(kart.podium?.place, place);
}

test("after the last track the top three stand on their steps, the rest at the hub", () => {
    const [a, b, c, d] = kartList;
    RunGrandPrix(kartList, [c, a, d, b]);
    AssertOnStep(c, 1);
    AssertOnStep(a, 2);
    AssertOnStep(d, 3);
    assert.equal(b.podium, undefined);
    assert.equal(b.melon.GetAbsOrigin().x !== STEP[1].x, true, "fourth place stays at the hub");
    // Respawn point stays the hub: the respawn button takes them down.
    assert.notEqual(c.checkpointPosition.x, STEP[1].x);
    assert.equal(c.pawn.eyeAngles.yaw, 180, "facing the step's yaw");
});

test("the confetti starts with the podium and stops when the hold ends", () => {
    const [a] = kartList;
    RunGrandPrix([a], [a]);
    const confetti = world.fired.filter((f) => f.name === C.PODIUM_CONFETTI_NAME);
    assert.deepEqual(confetti.map((f) => [f.input, f.delay]), [["Stop", undefined], ["Start", undefined], ["Stop", C.PODIUM_HOLD_SECONDS]]);
});

test("a cancelled Grand Prix puts nobody on the podium", () => {
    const [a, b] = kartList;
    for (const kart of [a, b]) {
        kart.inHub = true;
    }
    world.time = 0;
    TryStartRace();
    FinishKart(a);
    TryAbortRace();
    assert.equal(a.podium, undefined);
    assert.equal(b.podium, undefined);
    assert.equal(world.fired.some((f) => f.name === C.PODIUM_CONFETTI_NAME), false, "no confetti");
});

test("a place without its podium_spawn stays at the hub", () => {
    world.entities = world.entities.filter((e) => e.name !== C.PodiumSpawnName(2));
    const [a, b] = kartList;
    RunGrandPrix([a, b], [a, b]);
    AssertOnStep(a, 1);
    assert.equal(b.podium, undefined);
});

test("on the podium: no driving, no attack boost — jumping works", () => {
    const [a] = kartList;
    RunGrandPrix([a], [a]);
    a.pawn.pressed = new Set(["FORWARD", "ATTACK"]);
    a.pawn.justPressed = new Set(["JUMP"]);
    a.lastVelocity = { x: 0, y: 0, z: 0 };
    a.melon.velocity = { x: 0, y: 0, z: 0 };
    const health = a.health;
    world.time += DT;
    UpdateKart(0, a, DT);
    const v = a.melon.GetAbsVelocity();
    assert.equal(v.x, 0);
    assert.equal(v.y, 0);
    assert.equal(v.z, C.JUMP_SPEED);
    assert.equal(a.health, health, "no attack boost cost");
    assert.equal(a.attackBoosting, false);
});

test("off the spot, it's pulled back over it", () => {
    const [a] = kartList;
    RunGrandPrix([a], [a]);
    a.melon.Teleport({ position: { ...a.melon.GetAbsOrigin(), x: STEP[1].x + 10 } });
    a.lastVelocity = { x: 0, y: 0, z: -100 };
    a.melon.velocity = { x: 0, y: 0, z: -100 - C.GRAVITY * DT };
    world.time += DT;
    UpdateKart(0, a, DT);
    assert.ok(a.melon.GetAbsVelocity().x < 0, "back towards the step");
});

test("the hold ends after PODIUM_HOLD_SECONDS, then it drives again", () => {
    const [a] = kartList;
    RunGrandPrix([a], [a]);
    world.time += C.PODIUM_HOLD_SECONDS;
    a.pawn.pressed = new Set(["FORWARD"]);
    a.lastVelocity = { x: 0, y: 0, z: 0 };
    a.melon.velocity = { x: 0, y: 0, z: 0 };
    UpdateKart(0, a, DT);
    assert.equal(a.podium, undefined);
    const v = a.melon.GetAbsVelocity();
    assert.ok(Math.hypot(v.x, v.y) > 0, "accelerates along the view");
});

test("the respawn button, the hub button and the next Grand Prix take it down", () => {
    const [a, b] = kartList;
    RunGrandPrix([a, b], [a, b]);
    RespawnKartAtCheckpoint(a);
    assert.equal(a.podium, undefined);
    flow.ReturnAllToHub([b]);
    assert.equal(b.podium, undefined);

    RunGrandPrix([a, b], [a, b]);
    assert.ok(a.podium);
    a.inHub = true;
    world.time = 200;
    TryStartRace();
    assert.equal(a.podium, undefined);
});
