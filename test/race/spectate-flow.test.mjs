// The finish window and spectating against the fake engine
// (race/heat/race-flow.js, race/spectate/spectate.js, camera/follow/):
// FINISH_GRACE_SECONDS after the first finish, TIME UP for whoever is still
// out, finished racers watching the others, and "Watch Grand Prix" for a
// player outside it. See GAMEPLAY.md, "Finish window & spectating".
import "../helpers/register-cs-script.mjs";
import { StartGrandPrixNow } from "../helpers/grand-prix.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const flow = await import("../../src/melon_drive/race/heat/race-flow.js");
const { FinishKart, UpdateRaceFlow, RestoreRaceFlowSnapshot, TryAbortRace } = flow;
const { UpdateSpectating, SetWatching, ToggleWatching } = await import("../../src/melon_drive/race/spectate/index.js");
const { UpdateFollowCamera } = await import("../../src/melon_drive/camera/index.js");
const gp = await import("../../src/melon_drive/race/grand-prix/grand-prix.js");
const {
    MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, SPEED_HUD_ENTITY_NAME,
    RacePhase, COUNTDOWN_SECONDS, FINISH_GRACE_SECONDS, SPECTATE_AFTER_FINISH_SECONDS,
} = await import("../../src/melon_drive/constants/index.js");

const GO = COUNTDOWN_SECONDS;

/** @type {FakeHud} */
let hud;
/** @type {any[]} */
let kartList;

/** @param {number} slot */
function AddKart(slot) {
    const pawn = world.add(new CSPlayerPawn({ slot }));
    world.playerPawns.push(pawn);
    return SetUpPlayerKart(pawn, GetHubSpawnPoint());
}

/** One think tick: race flow, spectating, every camera. @param {number} time */
function Tick(time) {
    world.time = time;
    UpdateRaceFlow(time);
    UpdateSpectating(time, flow.phase);
    for (const kart of karts.values()) {
        UpdateFollowCamera(kart, 0.1);
    }
}

/** @param {any} kart */
function Followed(kart) {
    return kart.pawn.GetCustomCamera().config?.followEntity;
}

/** @param {any} kart @param {string} button CSInputs name */
function Press(kart, button, time) {
    kart.pawn.justPressed.add(button);
    Tick(time);
    kart.pawn.justPressed.clear();
}

beforeEach(() => {
    hud?.Remove();
    world.reset();
    karts.clear();
    RestoreRaceFlowSnapshot({ phase: RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });
    hud = world.add(new FakeHud(SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    for (const name of ["start_1", "checkpoint_1_1", "checkpoint_1_2"]) {
        world.add(new Entity({ name, className: "trigger_multiple", origin: { x: 3000, y: 0, z: 0 } }));
    }
    kartList = [AddKart(0), AddKart(1), AddKart(2), AddKart(3)];
    // a, b, c race; d stays outside
    for (const kart of kartList.slice(0, 3)) {
        kart.inHub = true;
    }
    StartGrandPrixNow(flow, 0);
    Tick(GO);
    assert.equal(flow.phase, RacePhase.RACING, "setup: GO");
});

test("the first finish opens the finish window; whoever is still out when it closes gets TIME UP, no points, and stays in", () => {
    const [a, b, c, d] = kartList;
    Tick(GO + 5);
    assert.notEqual(hud.Has(0, "finish_grace", "Hidden"), false, "nothing before the first finish");

    world.time = GO + 10;
    FinishKart(a);
    Tick(GO + 10);
    for (const slot of [0, 1, 2]) {
        assert.equal(hud.Has(slot, "finish_grace", "Hidden"), false, `racer ${slot} sees it`);
        assert.equal(hud.Variable(slot, "finish_grace", "seconds"), String(FINISH_GRACE_SECONDS));
    }
    assert.notEqual(hud.Has(3, "finish_grace", "Hidden"), false, "not d, outside it");

    world.time = GO + 20;
    FinishKart(b);
    Tick(GO + 10 + FINISH_GRACE_SECONDS - 0.1);
    assert.equal(flow.phase, RacePhase.RACING, "c still has a moment");
    Tick(GO + 10 + FINISH_GRACE_SECONDS);
    assert.equal(c.finished, true);
    assert.equal(c.timedOut, true);
    assert.equal(c.racing, true, "still in the Grand Prix");
    assert.equal(hud.Variable(2, "finish_place", "place"), "TIME UP  ·  NO POINTS");
    assert.equal(hud.Has(2, "finish_image", "Hidden"), true, "no FINISH image");
    assert.equal(gp.grandPrix.standings[gp.PlayerKey(c)].points, 0);
    assert.equal(flow.phase, RacePhase.BREAK, "everyone done");
    assert.equal(hud.Has(0, "finish_grace", "Hidden"), true, "the window is gone");
    assert.equal(d.racing, false);
});

test("a finished racer watches the one furthest ahead, steps with Mouse1/Mouse2, and is back on their own melon after the heat", () => {
    const [a, b, c] = kartList;
    b.checkpointIndex = 1;
    c.checkpointIndex = 2;
    world.time = GO + 10;
    FinishKart(a);
    Tick(GO + 10 + SPECTATE_AFTER_FINISH_SECONDS - 0.1);
    assert.equal(a.spectateSlot, undefined, "FINISH first");
    assert.equal(Followed(a), a.melon);

    Tick(GO + 10 + SPECTATE_AFTER_FINISH_SECONDS);
    assert.equal(a.spectateSlot, 2, "c is furthest ahead");
    assert.equal(Followed(a), c.melon, "the camera chases c's melon");
    assert.equal(hud.Has(0, "spectate_panel", "Hidden"), false);
    assert.equal(hud.Has(0, "spectate_panel", "Watching"), false);
    assert.equal(hud.Has(0, "finish_image", "Hidden"), true, "FINISH out of the way");

    Press(a, "ATTACK", GO + 15);
    assert.equal(a.spectateSlot, 1, "next: b");
    assert.equal(Followed(a), b.melon);
    Press(a, "ATTACK2", GO + 16);
    assert.equal(a.spectateSlot, 2, "previous: c");

    world.time = GO + 17;
    FinishKart(c);
    Tick(GO + 17);
    assert.equal(a.spectateSlot, 1, "c finished — on to b");

    world.time = GO + 18;
    FinishKart(b);
    Tick(GO + 18);
    assert.equal(flow.phase, RacePhase.BREAK);
    assert.equal(a.spectateSlot, undefined);
    assert.equal(Followed(a), a.melon, "back on the own melon");
    assert.equal(hud.Has(0, "spectate_panel", "Hidden"), true);
    assert.equal(hud.Has(0, "finish_image", "Hidden"), false, "FINISH again");
});

test("Watch Grand Prix: a player outside it follows the racers, own melon frozen, until it's over", () => {
    const [a, b, c, d] = kartList;
    assert.equal(SetWatching(a, true, flow.phase), false, "not a racer");
    Tick(GO + 1);
    assert.equal(hud.Has(3, "usermenu_watch_row", "Hidden"), false, "d's menu offers it");
    assert.equal(hud.Variable(3, "usermenu_watch_button", "watch_label"), "Watch Grand Prix");

    assert.equal(ToggleWatching(d, flow.phase), true);
    assert.ok(world.fired.some((f) => f.target === d.melon && f.input === "DisableMotion"), "melon frozen");
    Tick(GO + 2);
    assert.equal(d.spectateSlot, 0, "the first racer");
    assert.equal(Followed(d), a.melon);
    assert.equal(hud.Has(3, "spectate_panel", "Watching"), true);
    assert.equal(hud.Variable(3, "usermenu_watch_button", "watch_label"), "Stop Watching");

    TryAbortRace();
    Tick(GO + 3);
    assert.equal(d.watching, false, "the Grand Prix is over");
    assert.equal(d.spectateSlot, undefined);
    assert.equal(Followed(d), d.melon);
    assert.ok(world.fired.some((f) => f.target === d.melon && f.input === "EnableMotion"), "melon let go");
    assert.equal(hud.Has(3, "usermenu_watch_row", "Hidden"), true);
});

test("Stop Watching from the menu puts the camera back on the own melon at once", () => {
    const d = kartList[3];
    ToggleWatching(d, flow.phase);
    Tick(GO + 1);
    assert.equal(Followed(d), kartList[0].melon);
    ToggleWatching(d, flow.phase);
    assert.equal(d.watching, false);
    assert.equal(Followed(d), d.melon);
});

test("R leaves spectating: a watcher stops watching, a finished racer is back on their melon for the rest of the heat", () => {
    const [a, b, c, d] = kartList;
    ToggleWatching(d, flow.phase);
    Tick(GO + 1);
    assert.equal(Followed(d), a.melon);
    Press(d, "RELOAD", GO + 2);
    assert.equal(d.watching, false);
    assert.equal(Followed(d), d.melon);
    assert.ok(world.fired.some((f) => f.target === d.melon && f.input === "EnableMotion"), "melon let go");

    world.time = GO + 10;
    FinishKart(a);
    Tick(GO + 10 + SPECTATE_AFTER_FINISH_SECONDS);
    assert.notEqual(a.spectateSlot, undefined, "setup: a spectates");
    Press(a, "RELOAD", GO + 15);
    assert.equal(a.spectateSlot, undefined);
    assert.equal(Followed(a), a.melon);
    assert.equal(hud.Has(0, "finish_image", "Hidden"), false, "FINISH again");
    Tick(GO + 16);
    assert.equal(a.spectateSlot, undefined, "stays on the own melon");
});
