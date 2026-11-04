// The tutorial stations' rules (src/melon_drive/tutorial/logic.js): every
// step's check, moving through a station, the saved finished stations, the
// HUD card's view — and that the HUD layout has a panel for every key and
// diagram the steps use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    TUTORIAL_STATIONS,
    TUTORIAL_MAX_STEPS,
    TUTORIAL_KEYS,
    TUTORIAL_DIAGRAMS,
    TUTORIAL_STEP_DONE_SECONDS,
    TUTORIAL_COMPLETE_HUD_SECONDS,
    TUTORIAL_PROGRESS_SEGMENTS,
    TUTORIAL_READ_SECONDS,
    SAVE_DATA_TUTORIAL_KEY,
    BOUNCE_RATINGS,
} from "../../src/melon_drive/constants/index.js";
import {
    NewTutorialState,
    StepProgress,
    EnterStation,
    LeaveStation,
    StepTutorial,
    StationFromTriggerName,
    GoalFromTriggerName,
    GetFinishedStations,
    MarkStationFinished,
    TutorialView,
} from "../../src/melon_drive/tutorial/logic.js";
import { GhostPathLength, GhostPositionAt } from "../../src/melon_drive/tutorial/ghost-logic.js";

const [PERFECT, GOOD, BAD] = BOUNCE_RATINGS.map((r) => r.label);

/** @returns {import("../../src/melon_drive/tutorial/logic.js").TutorialSnapshot} */
function Snap(overrides = {}) {
    return {
        speed: 0,
        viewYaw: 0,
        health: 70,
        maxHealth: 70,
        inputs: {},
        boosting: false,
        inHeal: false,
        momentumSteps: 0,
        menuOpen: false,
        menuPage: undefined,
        skin: "default",
        freeLook: false,
        ...overrides,
        events: { goals: [], ...(overrides.events ?? {}) },
    };
}

test("every station has 1..TUTORIAL_MAX_STEPS steps, ids 1..n in order", () => {
    TUTORIAL_STATIONS.forEach((station, i) => {
        assert.equal(station.id, i + 1);
        assert.ok(station.steps.length >= 1 && station.steps.length <= TUTORIAL_MAX_STEPS, `station ${station.id}`);
    });
});

test("every key and diagram a step uses exists", () => {
    const keys = TUTORIAL_KEYS.map((k) => k.key);
    for (const station of TUTORIAL_STATIONS) {
        for (const step of station.steps) {
            for (const key of step.keys ?? []) assert.ok(keys.includes(key), `${step.text}: key ${key}`);
            if (step.diagram) assert.ok(TUTORIAL_DIAGRAMS.includes(step.diagram), `${step.text}: diagram ${step.diagram}`);
        }
    }
});

test("the HUD layout has a panel for every station, step row, key, diagram and progress segment", () => {
    const xml = readFileSync(new URL("../../panorama/layout/custom_game/melon_racer.xml", import.meta.url), "utf8");
    const ids = [
        "tutorial_panel",
        "tutorial_keys",
        "tutorial_diagrams",
        "tutorial_xp",
        ...TUTORIAL_STATIONS.map((s) => `tutorial_station_${s.id}`),
        ...Array.from({ length: TUTORIAL_MAX_STEPS }, (_, i) => `tutorial_step_${i}`),
        ...TUTORIAL_KEYS.map((k) => `tutorial_key_${k.key}`),
        ...TUTORIAL_DIAGRAMS.map((d) => `tutorial_diagram_${d}`),
        ...Array.from({ length: TUTORIAL_PROGRESS_SEGMENTS }, (_, i) => `tutorial_progress_${i}`),
    ];
    assert.deepEqual(ids.filter((id) => !xml.includes(`id="${id}"`)), []);
    const diagrams = [...xml.matchAll(/id="tutorial_diagram_([\w-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(diagrams.filter((d) => !TUTORIAL_DIAGRAMS.includes(d)), [], "a diagram in the layout the script doesn't know");
});

test("trigger names: stations and goals", () => {
    assert.equal(StationFromTriggerName("tutorial_station_3"), 3);
    assert.equal(StationFromTriggerName(`tutorial_station_${TUTORIAL_STATIONS.length + 1}`), undefined);
    assert.equal(StationFromTriggerName("tutorial_station_x"), undefined);
    assert.deepEqual(GoalFromTriggerName("tutorial_goal_1_hurdle"), { station: 1, goal: "hurdle" });
    assert.equal(GoalFromTriggerName("tutorial_goal_hurdle"), undefined);
});

test("hold: counts only while every input is held fast enough", () => {
    const check = { kind: "hold", inputs: ["forward"], seconds: 1, minSpeed: 100 };
    const tally = {};
    assert.equal(StepProgress(check, tally, Snap({ inputs: { forward: true }, speed: 50 }), 0.5), 0);
    assert.equal(StepProgress(check, tally, Snap({ inputs: { forward: true }, speed: 200 }), 0.5), 0.5);
    assert.equal(StepProgress(check, tally, Snap({ inputs: {}, speed: 200 }), 0.5), 0.5);
    assert.equal(StepProgress(check, tally, Snap({ inputs: { forward: true }, speed: 200 }), 0.6), 1);
});

test("each: every input on its own", () => {
    const check = { kind: "each", inputs: ["left", "right"], seconds: 1 };
    const tally = {};
    assert.equal(StepProgress(check, tally, Snap({ inputs: { left: true } }), 2), 0.5);
    assert.equal(StepProgress(check, tally, Snap({ inputs: { right: true } }), 1), 1);
});

test("turn: the view turning counts only while the input is held and moving", () => {
    const check = { kind: "turn", inputs: ["left", "right"], degrees: 180, minSpeed: 100 };
    const tally = {};
    StepProgress(check, tally, Snap({ viewYaw: 170, inputs: { right: true }, speed: 200 }), 0.1);
    assert.equal(StepProgress(check, tally, Snap({ viewYaw: -170, inputs: { right: true }, speed: 200 }), 0.1), 20 / 180, "across +-180 the short way");
    assert.equal(StepProgress(check, tally, Snap({ viewYaw: -80, inputs: {}, speed: 200 }), 0.1), 20 / 180, "not without the input");
    assert.equal(StepProgress(check, tally, Snap({ viewYaw: 10, inputs: { left: true }, speed: 50 }), 0.1), 20 / 180, "not standing still");
    assert.equal(StepProgress(check, tally, Snap({ viewYaw: 170, inputs: { left: true }, speed: 200 }), 0.1), 1);
});

test("goals: each goal once, any order", () => {
    const check = { kind: "goals", goals: ["a", "b"] };
    const tally = {};
    assert.equal(StepProgress(check, tally, Snap({ events: { goals: ["b", "b", "z"] } }), 0), 0.5);
    assert.equal(StepProgress(check, tally, Snap({ events: { goals: ["a"] } }), 0), 1);
});

test("wall jumps and bounces count only at the rating asked for", () => {
    const check = { kind: "wallJump", count: 1, minRating: GOOD };
    assert.equal(StepProgress(check, {}, Snap({ events: { goals: [], wallJump: { rating: BAD } } }), 0), 0);
    assert.equal(StepProgress(check, {}, Snap({ events: { goals: [], wallJump: { rating: undefined } } }), 0), 0);
    assert.equal(StepProgress(check, {}, Snap({ events: { goals: [], wallJump: { rating: PERFECT } } }), 0), 1);
    assert.equal(StepProgress({ kind: "wallJump", count: 1 }, {}, Snap({ events: { goals: [], wallJump: { rating: undefined } } }), 0), 1);
    const bounce = { kind: "bounce", count: 1, minRating: GOOD, minJump: 0.5 };
    assert.equal(StepProgress(bounce, {}, Snap({ events: { goals: [], bounce: { rating: GOOD, jump: 0.2 } } }), 0), 0);
    assert.equal(StepProgress(bounce, {}, Snap({ events: { goals: [], bounce: { rating: GOOD, jump: 0.8 } } }), 0), 1);
});

test("break: only the causes asked for", () => {
    const check = { kind: "break", causes: ["boost"] };
    const tally = {};
    assert.equal(StepProgress(check, tally, Snap({ events: { goals: [], break: "impact" } }), 0), 0);
    assert.equal(StepProgress(check, tally, Snap({ events: { goals: [], break: "boost" } }), 0), 1);
    assert.equal(StepProgress(check, tally, Snap(), 0), 1, "stays done");
});

test("health lost keeps its best, healing needs the zone and full health", () => {
    const lost = { kind: "healthLost", amount: 30 };
    const tally = {};
    assert.equal(StepProgress(lost, tally, Snap({ health: 40 }), 0), 1);
    assert.equal(StepProgress(lost, tally, Snap({ health: 70 }), 0), 1);
    assert.equal(StepProgress({ kind: "healFull" }, {}, Snap({ health: 70 }), 0), 0);
    assert.equal(StepProgress({ kind: "healFull" }, {}, Snap({ health: 35, inHeal: true }), 0), 0.5);
    assert.equal(StepProgress({ kind: "healFull" }, {}, Snap({ health: 70, inHeal: true }), 0), 1);
});

test("menu, skin, drone and read steps", () => {
    assert.equal(StepProgress({ kind: "menuPage", page: "leaderboards" }, {}, Snap({ menuOpen: true, menuPage: "leaderboards" }), 0), 1);
    assert.equal(StepProgress({ kind: "menuPage", page: "leaderboards" }, {}, Snap({ menuOpen: false, menuPage: "leaderboards" }), 0), 0);
    const skin = {};
    assert.equal(StepProgress({ kind: "skin" }, skin, Snap({ skin: "default" }), 0), 0);
    assert.equal(StepProgress({ kind: "skin" }, skin, Snap({ skin: "gold" }), 0), 1);
    const drone = {};
    assert.equal(StepProgress({ kind: "drone" }, drone, Snap({ freeLook: true }), 0), 0.5);
    assert.equal(StepProgress({ kind: "drone" }, drone, Snap({ freeLook: false }), 0), 1);
    assert.equal(StepProgress({ kind: "read" }, {}, Snap(), TUTORIAL_READ_SECONDS), 1);
});

test("a station runs step by step, then finishes once", () => {
    const station = TUTORIAL_STATIONS[0];
    const state = NewTutorialState();
    EnterStation(state, station.id);
    let now = 0;
    let finished;
    // Pass every step by forcing its progress: a check whose tally says done.
    for (let i = 0; i < station.steps.length; i++) {
        assert.equal(state.step, i);
        state.tally = { seconds: 999, degrees: 999, reached: [...(station.steps[i].check.goals ?? [])], done: true, count: 99, best: 1 };
        // ("each" needs per-input tallies)
        for (const input of station.steps[i].check.inputs ?? []) state.tally[input] = 999;
        assert.equal(StepTutorial(state, Snap(), now, 0.1, () => false), undefined);
        assert.notEqual(state.doneAt, undefined, `step ${i} done`);
        now += TUTORIAL_STEP_DONE_SECONDS + 0.01;
        finished = StepTutorial(state, Snap(), now, 0.1, () => false);
    }
    assert.equal(finished, station.id);
    assert.equal(state.station, undefined);
    assert.deepEqual(state.complete, { station: station.id, until: now + TUTORIAL_COMPLETE_HUD_SECONDS, firstTime: true });
    const view = TutorialView(state, [station.id]);
    assert.equal(view?.complete, true);
    assert.equal(view?.firstTime, true);
    assert.match(view?.message ?? "", /STATION 2/);
    StepTutorial(state, Snap(), now + TUTORIAL_COMPLETE_HUD_SECONDS, 0.1, () => true);
    assert.equal(TutorialView(state, [station.id]), undefined, "the card goes away");
});

test("leaving a station hides the card, entering another starts at its first step", () => {
    const state = NewTutorialState();
    EnterStation(state, 2);
    state.step = 1;
    EnterStation(state, 2);
    assert.equal(state.step, 1, "the same station again changes nothing");
    LeaveStation(state, 1);
    assert.equal(state.station, 2, "leaving another station's trigger changes nothing");
    LeaveStation(state, 2);
    assert.equal(TutorialView(state, []), undefined);
    EnterStation(state, 3);
    const view = TutorialView(state, []);
    assert.equal(view?.title, TUTORIAL_STATIONS[2].title);
    assert.equal(view?.steps[0].state, "current");
    assert.equal(view?.steps[1].state, "todo");
});

test("the finished stations are saved per player, each once", () => {
    const finished = GetFinishedStations({ [SAVE_DATA_TUTORIAL_KEY]: { ann: [2, 99, "x"] } });
    assert.deepEqual(finished, { ann: [2] });
    assert.equal(MarkStationFinished(finished, "ann", 1), true);
    assert.equal(MarkStationFinished(finished, "ann", 1), false);
    assert.deepEqual(finished.ann, [1, 2]);
    assert.deepEqual(GetFinishedStations({}), {});
});

test("a ghost runs along its path, waits at the end, starts over", () => {
    const path = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 100, z: 0 }];
    const length = GhostPathLength(path);
    assert.equal(length, 200);
    assert.deepEqual(GhostPositionAt(path, length, 0.5, 100, 1).position, { x: 50, y: 0, z: 0 });
    assert.deepEqual(GhostPositionAt(path, length, 1.5, 100, 1).position, { x: 100, y: 50, z: 0 });
    assert.deepEqual(GhostPositionAt(path, length, 2.5, 100, 1).position, { x: 100, y: 100, z: 0 }, "waiting at the end");
    assert.deepEqual(GhostPositionAt(path, length, 3.5, 100, 1).position, { x: 50, y: 0, z: 0 }, "round again");
});

test("a goal reached on an earlier step still counts when its step comes", () => {
    const state = NewTutorialState();
    EnterStation(state, 1);
    const goals = TUTORIAL_STATIONS[0].steps.find((s) => s.check.kind === "goals")?.check.goals ?? [];
    StepTutorial(state, Snap({ events: { goals } }), 0, 0.1, () => false); // driven through on step 1
    state.step = TUTORIAL_STATIONS[0].steps.findIndex((s) => s.check.kind === "goals");
    state.tally = {};
    StepTutorial(state, Snap(), 1, 0.1, () => false);
    assert.equal(state.progress, 1);
    EnterStation(state, 2);
    assert.deepEqual(state.goals, [], "a new station starts without goals");
});
