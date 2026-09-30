// Time trial end to end: the real start_/checkpoint_/finish_ inputs and the
// race flow, against the fake engine in helpers/cs-script-mock.mjs — the
// clock runs from the start line (free roam) or GO (heat) to the finish of
// the last lap, and each player's best time per track lands in the save data.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { karts } = await import("../src/melon_drive/kart-registry.js");
const { SetUpPlayerKart } = await import("../src/melon_drive/kart-spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/spawn-points.js");
const { BeginHeat, UpdateRaceFlow, ReturnAllToHub, RestoreRaceFlowSnapshot } = await import("../src/melon_drive/race-flow.js");
const { GetBestTime } = await import("../src/melon_drive/time-trial.js");
const { ParseSaveData, GetBestTimes } = await import("../src/melon_drive/logic/time-trial.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, INTRO_SPAWN_NAME, COUNTDOWN_SECONDS, RacePhase } = await import("../src/melon_drive/constants/index.js");
await import("../src/melon_drive/index.js"); // registers the script inputs

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

/** @type {any} */
let kart;
/** @type {Record<string, Entity>} */
let triggers;

/** Fires `input` from the trigger named `triggerName` at game time `time`. */
function Touch(time, triggerName, input = triggerName) {
    world.time = time;
    ScriptInput(input)({ caller: triggers[triggerName], activator: kart.melon });
}

function SavedBest() {
    return GetBestTimes(ParseSaveData(world.saveData));
}

beforeEach(() => {
    world.reset();
    karts.clear();
    RestoreRaceFlowSnapshot({ phase: RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    // Same layout in every test — GetTrackConfig caches the first scan.
    triggers = {};
    for (const name of ["start_1_laps2", "checkpoint_1_1", "start_2", "checkpoint_2_1", "end_of_track_2"]) {
        triggers[name] = world.add(new Entity({ name, className: "trigger_multiple" }));
    }
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0, playerName: "anna" })), GetIntroSpawnPoint());
    assert.ok(kart, "setup: kart created");
});

test("free roam, point-to-point: the clock runs from the start line to the finish", () => {
    Touch(10, "start_2");
    assert.equal(kart.runStartTime, 10);
    Touch(20, "checkpoint_2_1");
    Touch(34.5, "end_of_track_2", "finish_2");

    assert.equal(kart.runStartTime, undefined, "clock stopped");
    assert.deepEqual(kart.lastRun, { trackId: 2, time: 24.5, newBest: true, at: 34.5 });
    assert.deepEqual(SavedBest(), { 2: { anna: 24.5 } });
    assert.equal(kart.trackId, undefined, "off the track until its start is crossed again");
});

test("a slower run keeps the best time, a faster one replaces it", () => {
    for (const [start, end] of [[0, 30], [100, 140], [200, 225]]) {
        Touch(start, "start_2");
        Touch(start + 5, "checkpoint_2_1");
        Touch(end, "end_of_track_2", "finish_2");
    }
    assert.equal(GetBestTime(kart, 2), 25);
    assert.deepEqual(SavedBest(), { 2: { anna: 25 } });
});

test("free roam, loop: the clock covers every lap, and the next attempt starts on the line", () => {
    Touch(0, "start_1_laps2", "start_1");
    Touch(10, "checkpoint_1_1");
    Touch(20, "start_1_laps2", "start_1"); // lap 1 (start fires before finish)
    Touch(20, "start_1_laps2", "finish_1");
    assert.equal(kart.runStartTime, 0, "still running after lap 1");
    Touch(30, "checkpoint_1_1");
    Touch(41, "start_1_laps2", "finish_1"); // lap 2 (this time finish fires first)
    Touch(41, "start_1_laps2", "start_1");

    assert.equal(kart.lastRun.time, 41);
    assert.equal(kart.runStartTime, 41, "a new attempt started on the finish line");
    assert.equal(kart.trackId, 1);
    assert.equal(kart.checkpointIndex, 0);
    assert.equal(kart.lapsCompleted, 0);
});

test("a heat's clock starts at GO, and the finish time is recorded", () => {
    Touch(0, "start_2"); // a free-roaming run doesn't carry into the heat
    kart.racing = true;
    world.time = 50;
    BeginHeat(2);
    assert.equal(kart.runStartTime, undefined, "no clock during the countdown");
    world.time = 50 + COUNTDOWN_SECONDS;
    UpdateRaceFlow(world.time);
    assert.equal(kart.runStartTime, 50 + COUNTDOWN_SECONDS, "GO");

    Touch(60, "start_2"); // crossing the line after GO doesn't restart it
    Touch(70, "checkpoint_2_1");
    Touch(80, "end_of_track_2", "finish_2");
    assert.equal(kart.finished, true);
    assert.equal(kart.lastRun.time, 80 - (50 + COUNTDOWN_SECONDS));
    assert.equal(GetBestTime(kart, 2), 80 - (50 + COUNTDOWN_SECONDS));
});

test("leaving the track cancels the run without a time", () => {
    Touch(0, "start_2");
    ReturnAllToHub([kart]);
    assert.equal(kart.runStartTime, undefined);
    assert.equal(kart.lastRun, undefined);
    assert.equal(world.saveData, "");
});

test("save data other systems keep survives a new best", () => {
    world.saveData = JSON.stringify({ somethingElse: 7 });
    Touch(0, "start_2");
    Touch(5, "checkpoint_2_1");
    Touch(9, "end_of_track_2", "finish_2");
    assert.equal(ParseSaveData(world.saveData).somethingElse, 7);
    assert.deepEqual(SavedBest(), { 2: { anna: 9 } });
});

// The user menu's "Restart Time Trial" (RestartTimeTrial).
const { RestartTimeTrial } = await import("../src/melon_drive/checkpoints.js");
const { CanRestartTimeTrial } = await import("../src/melon_drive/time-trial.js");
const { StartSpawnName, SPAWN_UP_OFFSET, MELON_MAX_HEALTH } = await import("../src/melon_drive/constants/index.js");

test("restart: back to the start spawn, whole and still, clock at zero until the line", () => {
    const spawn = world.add(new Entity({ name: StartSpawnName(2), className: "info_target", origin: { x: 500, y: 600, z: 10 }, angles: { pitch: 0, yaw: 90, roll: 0 } }));
    assert.equal(CanRestartTimeTrial(kart), false, "not before a time trial");
    Touch(0, "start_2");
    Touch(5, "checkpoint_2_1");
    kart.health = 10;
    kart.melon.Teleport({ position: { x: 9000, y: 9000, z: 0 }, velocity: { x: 300, y: 0, z: 0 } });
    assert.equal(CanRestartTimeTrial(kart), true);

    assert.equal(RestartTimeTrial(kart), true);
    const origin = spawn.GetAbsOrigin();
    assert.deepEqual(kart.melon.GetAbsOrigin(), { x: origin.x, y: origin.y, z: origin.z + SPAWN_UP_OFFSET });
    assert.deepEqual(kart.melon.GetAbsVelocity(), { x: 0, y: 0, z: 0 });
    assert.equal(kart.melon.GetAbsAngles().yaw, 90);
    assert.equal(kart.health, MELON_MAX_HEALTH);
    assert.equal(kart.runStartTime, undefined, "the clock waits for the start line");
    assert.equal(kart.trackId, 2, "the strip stays up");
    assert.equal(kart.checkpointIndex, 0);

    Touch(20, "start_2");
    assert.equal(kart.runStartTime, 20, "crossing the line starts the new attempt");
});

test("restart only while on the track in a time trial — not after the finish, in a heat or off the track", () => {
    Touch(0, "start_2");
    Touch(5, "checkpoint_2_1");
    Touch(9, "end_of_track_2", "finish_2");
    assert.equal(kart.trackId, undefined, "finished: off the track");
    assert.equal(CanRestartTimeTrial(kart), false, "no restart once the race is over");
    assert.equal(RestartTimeTrial(kart), false);

    Touch(20, "start_2");
    assert.equal(CanRestartTimeTrial(kart), true, "the next attempt has it again");

    kart.racing = true;
    BeginHeat(2);
    assert.equal(CanRestartTimeTrial(kart), false, "a heat");
    assert.equal(RestartTimeTrial(kart), false);

    ReturnAllToHub([kart]);
    assert.equal(CanRestartTimeTrial(kart), false, "back in the hub");
});
