// The Grand Prix through the real heat flow (race/heat/race-flow.js) and
// the scoreboard it fills (hud/scoreboard/scoreboard.js), against the fake engine:
// places and points per heat, the place under FINISH, standings kept after
// the last track, a cancelled one, and the rows each player sees.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const flow = await import("../../src/melon_drive/race/heat/race-flow.js");
const { TryStartRace, TryAbortRace, FinishKart, UpdateRaceFlow, RestoreRaceFlowSnapshot } = flow;
const gpModule = await import("../../src/melon_drive/race/grand-prix/grand-prix.js");
const { PlayerKey } = gpModule;
const { HeatPoints } = await import("../../src/melon_drive/race/grand-prix/logic.js");
const { UpdateScoreboardHud } = await import("../../src/melon_drive/hud/scoreboard/scoreboard.js");
const {
    MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, SPEED_HUD_ENTITY_NAME,
    RacePhase, COUNTDOWN_SECONDS, BREAK_SECONDS, SCOREBOARD_ROWS,
} = await import("../../src/melon_drive/constants/index.js");

const FIRST_TRACK = 1;
const LAST_TRACK = 3;

/** @type {FakeHud} */
let hud;
/** @type {any[]} */
let kartList;

/** @param {number} slot @param {string} playerName */
function AddKart(slot, playerName) {
    const pawn = world.add(new CSPlayerPawn({ slot, playerName }));
    world.playerPawns.push(pawn);
    const kart = SetUpPlayerKart(pawn, GetHubSpawnPoint());
    assert.ok(kart, `setup: kart for slot ${slot}`);
    return kart;
}

/** @param {number} time */
function Tick(time) {
    world.time = time;
    UpdateRaceFlow(time);
}

/** Starts a Grand Prix with `racers` in the hub trigger and runs the countdown out. */
function StartGrandPrixWith(racers, time = 0) {
    for (const kart of racers) {
        kart.inHub = true;
    }
    world.time = time;
    TryStartRace();
    Tick(time + COUNTDOWN_SECONDS);
    assert.equal(flow.phase, RacePhase.RACING, "setup: GO");
}

/** Finishes the heat in `order`, then runs the break out — onto the next track or back to the hub. */
function RunHeat(order, time) {
    for (const kart of order) {
        FinishKart(kart);
    }
    Tick(time);
    assert.equal(flow.phase, RacePhase.BREAK, "setup: heat over");
    Tick(time + BREAK_SECONDS);
}

beforeEach(() => {
    hud?.Remove();
    world.reset();
    karts.clear();
    RestoreRaceFlowSnapshot({ phase: RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });
    hud = world.add(new FakeHud(SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    for (const name of [`start_${LAST_TRACK}`, `checkpoint_${LAST_TRACK}_1`, `start_${FIRST_TRACK}`, `checkpoint_${FIRST_TRACK}_1`]) {
        world.add(new Entity({ name, className: "trigger_multiple", origin: { x: 3000, y: 0, z: 0 } }));
    }
    kartList = [AddKart(0, "Anna"), AddKart(1, "Ben"), AddKart(2, "Cleo")];
});

test("finishers get places and points per heat, totals over every track", () => {
    const [a, b] = kartList;
    StartGrandPrixWith([a, b]);
    const gp = gpModule.grandPrix;
    assert.ok(gp && !gp.over);
    assert.equal(gp.totalTracks, 2);

    RunHeat([b, a], 10); // track 1: Ben first
    assert.equal(flow.activeTrackId, LAST_TRACK, "on to the next track");
    Tick(10 + BREAK_SECONDS + COUNTDOWN_SECONDS); // its countdown
    RunHeat([b, a], 40); // track 3: Ben again
    assert.equal(flow.phase, RacePhase.HUB);

    assert.equal(gp.standings[PlayerKey(b)].points, 2 * HeatPoints(1));
    assert.equal(gp.standings[PlayerKey(a)].points, 2 * HeatPoints(2));
    assert.deepEqual(gp.trackIds, [FIRST_TRACK, LAST_TRACK]);
    assert.equal(gp.over, true, "the standings stay for the scoreboard");
    assert.equal(gp.cancelled, false);
});

test("the place and its points show under FINISH, and go with it", () => {
    const [a, b] = kartList;
    StartGrandPrixWith([a, b]);
    FinishKart(b);
    FinishKart(a);
    assert.equal(hud.Variable(1, "finish_place", "place"), `1ST  ·  +${HeatPoints(1)} PTS`);
    assert.equal(hud.Variable(0, "finish_place", "place"), `2ND  ·  +${HeatPoints(2)} PTS`);
    assert.equal(hud.Has(0, "finish_place", "Hidden"), false);

    Tick(10);
    Tick(10 + BREAK_SECONDS); // next heat
    assert.equal(hud.Has(0, "finish_place", "Hidden"), true);
});

test("a moderator abort ends the Grand Prix as cancelled; the next one starts from zero", () => {
    const [a, b] = kartList;
    StartGrandPrixWith([a, b]);
    FinishKart(a);
    TryAbortRace();
    const cancelled = gpModule.grandPrix;
    assert.equal(cancelled?.over, true);
    assert.equal(cancelled?.cancelled, true);

    StartGrandPrixWith([a, b], 100);
    assert.notEqual(gpModule.grandPrix, cancelled);
    assert.equal(gpModule.grandPrix?.standings[PlayerKey(a)].points, 0);
});

test("scoreboard: every player sees the standings, their own row marked, unused rows collapsed", () => {
    const [a, b, c] = kartList;
    StartGrandPrixWith([a, b]);
    FinishKart(b);
    for (const [slot, kart] of karts) {
        UpdateScoreboardHud(slot, kart);
    }
    assert.equal(hud.Variable(2, "scoreboard", "title"), "GRAND PRIX");
    assert.equal(hud.Has(2, "scoreboard", "TimeTrial"), false);
    assert.equal(hud.Variable(2, "score_row_0", "name"), "Ben");
    assert.equal(hud.Variable(2, "score_row_0", "points"), String(HeatPoints(1)));
    assert.equal(hud.Variable(2, "score_row_0", "heat"), "1ST");
    assert.equal(hud.Variable(2, "score_row_2", "name"), "Cleo", "the onlooker after the racers");
    assert.equal(hud.Has(2, "score_row_2", "Self"), true);
    assert.equal(hud.Has(1, "score_row_0", "Self"), true, "Ben sees his own row marked");
    assert.equal(hud.Has(2, "score_row_0", "Self"), false);
    assert.equal(hud.Has(2, "score_row_3", "Unused"), true);
    assert.equal(hud.Has(2, `score_row_${SCOREBOARD_ROWS - 1}`, "Unused"), true);
    assert.ok(c);
});

test("scoreboard: on a track outside a Grand Prix it's that track's time trial board", () => {
    const [a] = kartList;
    gpModule.EndGrandPrix(true); // earlier tests here may have left one running
    a.trackId = FIRST_TRACK;
    UpdateScoreboardHud(0, a);
    assert.equal(hud.Variable(0, "scoreboard", "title"), "TIME TRIAL");
    assert.equal(hud.Has(0, "scoreboard", "TimeTrial"), true);
    assert.equal(hud.Variable(0, "scoreboard", "best_header"), `BEST T${FIRST_TRACK}`);
});
