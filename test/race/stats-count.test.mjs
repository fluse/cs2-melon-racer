// The players' stats counted where they happen (race/stats/stats.js), against
// the fake engine in helpers/cs-script-mock.mjs: a break is a crash (the user
// menu's "Test Break" isn't), a finished run a finish, every tick with a
// melon time on the server — and the totals land in the save data.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { BreakKartNow } = await import("../../src/melon_drive/health/breaking/breaking.js");
const { TestBreak } = await import("../../src/melon_drive/dev/test-effects.js");
const { FinishRun } = await import("../../src/melon_drive/race/time-trial/time-trial.js");
const { UpdateStats, SaveStats, GetStatTotals } = await import("../../src/melon_drive/race/stats/stats.js");
const { ParseSaveData } = await import("../../src/melon_drive/race/time-trial/logic.js");
const { GetStats } = await import("../../src/melon_drive/race/stats/logic.js");
const { MELON_TEMPLATE_NAME, INTRO_SPAWN_NAME, HUB_SPAWN_NAME } = await import("../../src/melon_drive/constants/index.js");

const NAME = "anna";
/** @type {any} */
let kart;

/** The player's current total of one stat (0 without one). @param {string} key */
const Total = (key) => GetStatTotals(key)[NAME] ?? 0;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0, playerName: NAME })), GetIntroSpawnPoint());
    assert.ok(kart, "setup: kart created");
});

test("a break counts as a crash — once, and the user menu's Test Break doesn't", () => {
    const before = Total("crashes");
    assert.equal(BreakKartNow(kart, "test"), true);
    assert.equal(Total("crashes"), before + 1);
    BreakKartNow(kart, "test again");
    assert.equal(Total("crashes"), before + 1, "already broken: no second crash");
    kart.breaking = false;
    TestBreak(0, kart);
    assert.equal(kart.breaking, true, "setup: Test Break broke it");
    assert.equal(Total("crashes"), before + 1);
});

test("a finished run counts as a finish, a finish without a running clock doesn't", () => {
    const before = Total("finishes");
    kart.runStartTime = 5;
    world.time = 25;
    FinishRun(kart, 1);
    assert.equal(Total("finishes"), before + 1);
    FinishRun(kart, 1);
    assert.equal(Total("finishes"), before + 1);
});

test("every tick adds time on the server, and the totals are saved", () => {
    const before = Total("playTime");
    UpdateStats(1e6, 0.5); // far enough on for the periodic save
    assert.equal(Total("playTime"), before + 0.5);
    const saved = GetStats(ParseSaveData(world.saveData));
    assert.equal(saved[NAME]?.playTime, before + 0.5);
    UpdateStats(1e6 + 0.1, 0.25); // too soon for the next save
    assert.equal(GetStats(ParseSaveData(world.saveData))[NAME]?.playTime, before + 0.5);
    SaveStats(); // as on a disconnect
    assert.equal(GetStats(ParseSaveData(world.saveData))[NAME]?.playTime, before + 0.75);
});
