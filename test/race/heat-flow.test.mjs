// The heat flow end to end (race/heat/race-flow.js), against the fake engine
// in helpers/cs-script-mock.mjs: who gets pulled into a heat, the countdown,
// RACING -> BREAK once everyone's finished, the next track in trackId order,
// back to the hub after the last one, the moderator's abort, and a heat
// nobody is left in. See GAMEPLAY.md, "Hub → race → next-track flow".
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const flow = await import("../../src/melon_drive/race/heat/race-flow.js");
const { TryStartRace, TryAbortRace, BeginHeat, FinishKart, UpdateRaceFlow, NextTrackId, CurrentRacers, RestoreRaceFlowSnapshot } = flow;
const { CountdownDigits } = await import("../../src/melon_drive/race/heat/logic.js");
const {
    MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, SPEED_HUD_ENTITY_NAME, StartSpawnName,
    RacePhase, COUNTDOWN_SECONDS, GO_DISPLAY_SECONDS, BREAK_SECONDS, RACE_SPAWN_LATERAL_SPACING, MELON_MAX_HEALTH,
} = await import("../../src/melon_drive/constants/index.js");

// Two tracks with a gap in their ids — the order is by id, not 1, 2, 3, …
// Same layout in every test: GetTrackConfig caches its first scan.
const FIRST_TRACK = 1;
const LAST_TRACK = 3;
const HUB = { x: 250, y: -520, z: 16 };

/** @type {FakeHud} */
let hud;
/** @type {any[]} */
let kartList;

/** @param {number} slot */
function AddKart(slot) {
    const pawn = world.add(new CSPlayerPawn({ slot }));
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

/** Starts a heat with every kart in `inHub` standing in the hub trigger, at game time `time`. */
function StartHeatWith(inHub, time = 0) {
    for (const kart of inHub) {
        kart.inHub = true;
    }
    world.time = time;
    TryStartRace();
}

/** Runs the countdown out: GO at `goTime`. */
function RunCountdown(goTime) {
    Tick(goTime);
    assert.equal(flow.phase, RacePhase.RACING, "setup: GO");
}

/** @param {any} kart */
function DistanceToHub(kart) {
    const p = kart.melon.GetAbsOrigin();
    return Math.hypot(p.x - HUB.x, p.y - HUB.y);
}

beforeEach(() => {
    hud?.Remove(); // GetSpeedHud caches the layout while it's valid
    world.reset();
    karts.clear();
    RestoreRaceFlowSnapshot({ phase: RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });
    hud = world.add(new FakeHud(SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: HUB }));
    for (const name of [`start_${LAST_TRACK}_laps2`, `checkpoint_${LAST_TRACK}_1`, `start_${FIRST_TRACK}`, `checkpoint_${FIRST_TRACK}_1`]) {
        world.add(new Entity({ name, className: "trigger_multiple", origin: { x: 3000, y: 0, z: 0 } }));
    }
    kartList = [AddKart(0), AddKart(1), AddKart(2)];
});

test("starting a race pulls in only the karts standing in the hub trigger, onto the lowest trackId", () => {
    const [a, b, outside] = kartList;
    a.hubModalOpen = true;
    StartHeatWith([a, b]);

    assert.equal(flow.phase, RacePhase.COUNTDOWN);
    assert.equal(flow.activeTrackId, FIRST_TRACK);
    for (const kart of [a, b]) {
        assert.equal(kart.racing, true);
        assert.equal(kart.locked, true, "can't drive during the countdown");
        assert.equal(kart.trackId, FIRST_TRACK, "on the track right away, for the checkpoint strip");
        assert.equal(kart.hubModalOpen, false, "the start modal closes");
    }
    assert.equal(outside.racing, false, "a kart outside the hub trigger stays out");
    assert.equal(outside.locked, false);
    assert.deepEqual(CurrentRacers(), [a, b]);
});

test("starting a race is ignored with nobody in the hub trigger, or while a heat is running", () => {
    TryStartRace();
    assert.equal(flow.phase, RacePhase.HUB, "nobody in the hub");

    const [a, b] = kartList;
    StartHeatWith([a]);
    b.inHub = true;
    TryStartRace();
    assert.equal(b.racing, false, "no late joining a running heat");
    assert.deepEqual(CurrentRacers(), [a]);
});

test("a heat starts every racer whole, with no boost and no progress carried over", () => {
    const [a] = kartList;
    a.health = 5;
    a.speedCap = 9999;
    a.checkpointIndex = 1;
    a.lapsCompleted = 1;
    a.finished = true;
    StartHeatWith([a]);

    assert.equal(a.health, MELON_MAX_HEALTH);
    assert.equal(a.speedCap, undefined);
    assert.equal(a.checkpointIndex, 0);
    assert.equal(a.lapsCompleted, 0);
    assert.equal(a.finished, false);
});

test("racers line up side by side, RACE_SPAWN_LATERAL_SPACING apart across the start's facing", () => {
    const spawn = world.add(new Entity({ name: StartSpawnName(FIRST_TRACK), origin: { x: 1000, y: 2000, z: 0 }, angles: { pitch: 0, yaw: 90, roll: 0 } }));
    StartHeatWith(kartList);

    const center = spawn.GetAbsOrigin();
    const spots = kartList.map((kart) => kart.melon.GetAbsOrigin());
    for (let i = 1; i < spots.length; i++) {
        assert.ok(Math.abs(Math.hypot(spots[i].x - spots[i - 1].x, spots[i].y - spots[i - 1].y) - RACE_SPAWN_LATERAL_SPACING) < 1e-6, "spacing between neighbours");
        assert.ok(Math.abs(spots[i].y - spots[i - 1].y) < 1e-6, "side by side: across a facing of yaw 90 (+y) is along x");
    }
    const meanX = spots.reduce((sum, p) => sum + p.x, 0) / spots.length;
    assert.ok(Math.abs(meanX - center.x) < 1e-6, "centered on start_spawn");
    for (const kart of kartList) {
        assert.deepEqual(kart.checkpointPosition, kart.melon.GetAbsOrigin(), "a respawn before checkpoint 1 lands on its own spot, not the middle");
        assert.equal(kart.pawn.GetEyeAngles().yaw, 90);
    }
});

test("the countdown shows 3, 2, 1, then GO unlocks the racers; GO stays up GO_DISPLAY_SECONDS", () => {
    const [a] = kartList;
    StartHeatWith([a], 100);
    const shown = () => ["Show3", "Show2", "Show1", "ShowGo"].filter((cls) => hud.Has(0, "countdown_panel", cls));

    for (let n = COUNTDOWN_SECONDS; n >= 1; n--) {
        Tick(100 + COUNTDOWN_SECONDS - n + 0.5);
        assert.equal(hud.Has(0, "countdown_panel", "Hidden"), false);
        assert.deepEqual(shown(), n <= 3 ? [`Show${n}`] : [], `${n} seconds left`);
        assert.equal(a.locked, true);
    }
    Tick(100 + COUNTDOWN_SECONDS);
    assert.deepEqual(shown(), ["ShowGo"]);
    assert.equal(flow.phase, RacePhase.RACING);
    assert.equal(a.locked, false, "GO");

    Tick(100 + COUNTDOWN_SECONDS + GO_DISPLAY_SECONDS / 2);
    assert.equal(hud.Has(0, "countdown_panel", "Hidden"), false, "GO still showing");
    Tick(100 + COUNTDOWN_SECONDS + GO_DISPLAY_SECONDS);
    assert.equal(hud.Has(0, "countdown_panel", "Hidden"), true);
});

test("the heat waits for every racer to finish, then breaks for BREAK_SECONDS", () => {
    const [a, b] = kartList;
    StartHeatWith([a, b]);
    RunCountdown(COUNTDOWN_SECONDS);

    FinishKart(a);
    assert.equal(a.locked, true, "a finished kart is parked");
    assert.equal(hud.Has(0, "finish_image", "Hidden"), false, "its FINISH shows at once");
    Tick(50);
    assert.equal(flow.phase, RacePhase.RACING, "b is still racing");

    FinishKart(b);
    Tick(60);
    assert.equal(flow.phase, RacePhase.BREAK);
    assert.equal(flow.phaseEndTime, 60 + BREAK_SECONDS);
});

test("the break counts BREAK_SECONDS down in digit images under the finish image", () => {
    const [a] = kartList;
    StartHeatWith([a]);
    RunCountdown(COUNTDOWN_SECONDS);
    FinishKart(a);
    Tick(20); // -> BREAK
    const onDigits = (place) => [...Array(10).keys()].filter((d) => hud.Has(0, `break_${place}_${d}`, "On"));

    Tick(20.01);
    const first = CountdownDigits(BREAK_SECONDS);
    assert.equal(hud.Has(0, "break_countdown", "Hidden"), false);
    assert.deepEqual(onDigits("ones"), [first.ones]);
    assert.deepEqual(onDigits("tens"), first.tens === undefined ? [] : [first.tens]);
    assert.equal(hud.Has(0, "break_tens", "On"), first.tens !== undefined);

    Tick(20 + BREAK_SECONDS - 1.2);
    assert.deepEqual(onDigits("ones"), [1]);
    assert.deepEqual(onDigits("tens"), [], "no leading zero");
    assert.equal(hud.Has(0, "break_tens", "On"), false);
});

test("after the break the next track (by trackId) starts with a fresh countdown", () => {
    const [a, b] = kartList;
    StartHeatWith([a, b]);
    assert.equal(NextTrackId(), LAST_TRACK);
    RunCountdown(COUNTDOWN_SECONDS);
    FinishKart(a);
    FinishKart(b);
    Tick(10); // -> BREAK
    Tick(10 + BREAK_SECONDS);

    assert.equal(flow.phase, RacePhase.COUNTDOWN);
    assert.equal(flow.activeTrackId, LAST_TRACK);
    for (const [slot, kart] of [[0, a], [1, b]]) {
        assert.equal(kart.racing, true);
        assert.equal(kart.finished, false);
        assert.equal(kart.locked, true);
        assert.equal(kart.trackId, LAST_TRACK);
        assert.equal(hud.Has(slot, "finish_image", "Hidden"), true, "FINISH goes away for the new heat");
        assert.equal(hud.Has(slot, "break_countdown", "Hidden"), true);
    }
    assert.equal(NextTrackId(), undefined, "it's the last one");
});

test("after the last track's break everyone goes back to the hub and the flow is back at HUB", () => {
    const [a, b] = kartList;
    StartHeatWith([a, b]);
    RestoreRaceFlowSnapshot({ phase: RacePhase.RACING, activeTrackId: LAST_TRACK, phaseEndTime: Infinity });
    FinishKart(a);
    FinishKart(b);
    Tick(10); // -> BREAK
    Tick(10 + BREAK_SECONDS);

    assert.equal(flow.phase, RacePhase.HUB);
    assert.equal(flow.activeTrackId, undefined);
    for (const [slot, kart] of [[0, a], [1, b]]) {
        assert.equal(kart.racing, false);
        assert.equal(kart.locked, false);
        assert.equal(kart.finished, false);
        assert.equal(kart.trackId, undefined, "no checkpoint strip in the hub");
        assert.ok(DistanceToHub(kart) <= RACE_SPAWN_LATERAL_SPACING, "lined up at hub_spawn");
        assert.equal(hud.Has(slot, "finish_image", "Hidden"), true);
    }
});

test("the moderator's abort sends the racers to the hub from any phase", () => {
    for (const reach of [() => {}, () => RunCountdown(COUNTDOWN_SECONDS), () => { RunCountdown(COUNTDOWN_SECONDS); FinishKart(kartList[0]); Tick(10); }]) {
        const [a] = kartList;
        StartHeatWith([a]);
        reach();
        TryAbortRace();
        assert.equal(flow.phase, RacePhase.HUB);
        assert.equal(flow.activeTrackId, undefined);
        assert.equal(a.racing, false);
        assert.equal(a.locked, false);
        assert.ok(DistanceToHub(a) <= RACE_SPAWN_LATERAL_SPACING);
        assert.equal(hud.Has(0, "countdown_panel", "Hidden"), true);
    }
});

test("aborting with no heat running changes nothing", () => {
    const [a] = kartList;
    a.melon.Teleport({ position: { x: 9000, y: 9000, z: 0 } });
    TryAbortRace();
    assert.equal(flow.phase, RacePhase.HUB);
    assert.deepEqual(a.melon.GetAbsOrigin(), { x: 9000, y: 9000, z: 0 }, "nobody is teleported");
});

test("a heat everyone left goes back to HUB — during the countdown or mid-race", () => {
    for (const leaveAt of [RacePhase.COUNTDOWN, RacePhase.RACING]) {
        const [a] = kartList;
        StartHeatWith([a]);
        if (leaveAt === RacePhase.RACING) {
            RunCountdown(COUNTDOWN_SECONDS);
        }
        a.racing = false; // what dropping a disconnected player's kart amounts to
        Tick(COUNTDOWN_SECONDS + 1);
        assert.equal(flow.phase, RacePhase.HUB, `left during ${leaveAt}`);
        assert.equal(flow.activeTrackId, undefined);

        a.inHub = true;
        TryStartRace();
        assert.equal(flow.phase, RacePhase.COUNTDOWN, "a new heat can start again");
        TryAbortRace();
    }
});

test("a heat on a track without its start trigger returns the racers to the hub instead of stranding them", () => {
    const [a] = kartList;
    a.racing = true;
    BeginHeat(99);
    assert.equal(flow.phase, RacePhase.HUB);
    assert.equal(a.racing, false);
    assert.equal(a.locked, false);
});

test("a racer whose melon is gone mid-break still gets its spot on the grid for the respawn", () => {
    const [a, b] = kartList;
    a.racing = b.racing = true;
    a.melon.Remove();
    BeginHeat(FIRST_TRACK);
    assert.equal(flow.phase, RacePhase.COUNTDOWN, "doesn't throw on the dead melon");
    assert.notDeepEqual(a.checkpointPosition, b.checkpointPosition, "its own lined-up spot to respawn at");
    TryAbortRace();
});
