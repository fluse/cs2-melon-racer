// The user menu's leaderboards page: its rules (hud/leaderboards/logic.js —
// which tabs, which track, the board a tab shows), that melon_racer.xml has
// every tab and row hud/leaderboards/leaderboards.js fills in, and the page
// against the fake engine (opened from ACTIONS, tabs, ◀ ▶ through the tracks).
import "../helpers/register-cs-script.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";
import { ROUTE_NAMES } from "../../src/melon_drive/hud/hub-modal/routes.js";
import { BuildLeaderboard, LeaderboardTab, LeaderboardTabs, LeaderboardTrack, StepLeaderboardTrack } from "../../src/melon_drive/hud/leaderboards/logic.js";
import { FormatRaceTime } from "../../src/melon_drive/race/time-trial/logic.js";
import { FormatStat } from "../../src/melon_drive/race/stats/logic.js";
import { LEADERBOARD_ROWS, LEADERBOARD_TIMES_TAB, STAT_SLIDES, MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, SPEED_HUD_ENTITY_NAME } from "../../src/melon_drive/constants/index.js";

const A = { key: "0:Anna", name: "Anna" };
const B = { key: "1:Ben", name: "Ben" };

/** @param {Partial<Parameters<typeof BuildLeaderboard>[0]>} input */
const Board = (input) => BuildLeaderboard({ tab: LEADERBOARD_TIMES_TAB, trackOrder: [1, 2], trackId: 1, bestTimes: {}, statTotals: {}, players: [A, B], self: A, maxRows: LEADERBOARD_ROWS, ...input });

test("tabs: the best times first, then one per stat in STAT_SLIDES order; an unknown pick shows the best times", () => {
    assert.deepEqual(LeaderboardTabs(), [LEADERBOARD_TIMES_TAB, ...STAT_SLIDES.map((slide) => slide.key)]);
    assert.equal(LeaderboardTab(STAT_SLIDES[1].key), STAT_SLIDES[1].key);
    assert.equal(LeaderboardTab(undefined), LEADERBOARD_TIMES_TAB);
    assert.equal(LeaderboardTab("gone"), LEADERBOARD_TIMES_TAB);
});

test("track: the one paged to, else the player's own, else the first", () => {
    assert.equal(LeaderboardTrack([1, 2, 3], 3, 2), 3);
    assert.equal(LeaderboardTrack([1, 2, 3], undefined, 2), 2);
    assert.equal(LeaderboardTrack([1, 2, 3], 9, undefined), 1, "a track that's gone");
    assert.equal(LeaderboardTrack([], undefined, undefined), undefined);
});

test("paging the tracks wraps around both ways", () => {
    assert.equal(StepLeaderboardTrack([1, 2, 3], 3, 1), 1);
    assert.equal(StepLeaderboardTrack([1, 2, 3], 1, -1), 3);
    assert.equal(StepLeaderboardTrack([], undefined, 1), undefined);
});

test("best times: the route as the title, which of the routes under it, fastest first, saved times included, the viewer marked", () => {
    const board = Board({ bestTimes: { Ben: 31.5, Cleo: 29.25 }, routeNames: { 1: "Aqueduct" } });
    assert.deepEqual([board.title, board.subtitle, board.column], ["AQUEDUCT", "BEST TIMES  ·  ROUTE 1 / 2", "TIME"]);
    assert.deepEqual(board.rows.map((row) => [row.rank, row.name, row.value, row.self]), [
        ["1", "Cleo", FormatRaceTime(29.25), false],
        ["2", "Ben", FormatRaceTime(31.5), false],
        ["–", "Anna", "-:--.--", true],
    ]);
    assert.deepEqual([Board({ trackOrder: [1] }).title, Board({ trackOrder: [1] }).subtitle], ["TRACK 1", "BEST TIMES"], "no paging hint with one track");
    const none = Board({ trackOrder: [], trackId: undefined });
    assert.deepEqual([none.title, none.subtitle], ["BEST TIMES", "NO TRACKS"]);
});

test("a stat tab: its title and column, the highest total first, formatted like the scoreboard's", () => {
    const slide = STAT_SLIDES[0];
    const board = Board({ tab: slide.key, statTotals: { Ben: 600, Anna: 4000 } });
    assert.deepEqual([board.title, board.column], [slide.title, slide.column]);
    assert.deepEqual(board.rows.map((row) => [row.rank, row.name, row.value]), [
        ["1", "Anna", FormatStat(slide, 4000)],
        ["2", "Ben", FormatStat(slide, 600)],
    ]);
});

test("more players than LEADERBOARD_ROWS: the viewer's own row takes the last one", () => {
    const names = Array.from({ length: LEADERBOARD_ROWS + 3 }, (_, i) => `P${i}`);
    const totals = Object.fromEntries(names.map((name, i) => [name, 1000 - i]));
    const self = { key: "9:last", name: names.at(-1) ?? "" };
    const board = Board({ tab: STAT_SLIDES[0].key, statTotals: totals, self });
    assert.equal(board.rows.length, LEADERBOARD_ROWS);
    assert.deepEqual(board.rows.at(-1), { rank: String(names.length), name: self.name, value: FormatStat(STAT_SLIDES[0], totals[self.name]), self: true });
});

test("melon_racer.xml has a button for every tab and every row", () => {
    const layout = readFileSync(new URL("../../panorama/layout/custom_game/melon_racer.xml", import.meta.url), "utf8");
    const ids = new Set([...layout.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const wanted = [...LeaderboardTabs().map((tab) => `lb_tab_${tab}`), ...Array.from({ length: LEADERBOARD_ROWS }, (_, i) => `lb_row_${i}`)];
    assert.deepEqual(wanted.filter((id) => !ids.has(id)), []);
    assert.ok(!ids.has(`lb_row_${LEADERBOARD_ROWS}`), "no row the script never fills in");
    const tabButtons = [...ids].filter((id) => id.startsWith("lb_tab_"));
    assert.deepEqual(tabButtons.sort(), LeaderboardTabs().map((tab) => `lb_tab_${tab}`).sort(), "no tab without a board");
});

test("the page: opened from ACTIONS, tabs switch the board, ◀ ▶ page the best times through the tracks", async () => {
    const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
    const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
    const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
    const { SetUserMenuOpen } = await import("../../src/melon_drive/hud/user-menu.js");
    const { HandleHudClick } = await import("../../src/melon_drive/hud/inputs.js");
    world.reset();
    karts.clear();
    const hud = world.add(new FakeHud(SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 16 } }));
    world.add(new Entity({ name: "start_1", className: "trigger_multiple" }));
    world.add(new Entity({ name: "start_2", className: "trigger_multiple" }));
    const kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0, playerName: "Anna" })), GetHubSpawnPoint());
    const PAGE = "usermenu_leaderboards_page";

    SetUserMenuOpen(0, kart, true);
    HandleHudClick(0, "usermenu_leaderboards_button");
    assert.equal(kart.userMenuPage, "leaderboards");
    assert.ok(hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(!hud.Has(0, PAGE, "Hidden"));
    assert.equal(hud.Variable(0, PAGE, "lb_title"), (ROUTE_NAMES[1] ?? "Track 1").toUpperCase(), "the route's name");
    assert.ok(hud.Has(0, `lb_tab_${LEADERBOARD_TIMES_TAB}`, "Selected"));
    assert.ok(hud.Has(0, PAGE, "Paging"), "two tracks: ◀ ▶ shown");
    assert.equal(hud.Variable(0, "lb_row_0", "name"), "Anna");
    assert.ok(hud.Has(0, "lb_row_0", "Self"));
    assert.ok(hud.Has(0, "lb_row_1", "Unused"));

    const subtitle = () => hud.Variable(0, PAGE, "lb_subtitle") ?? "";
    assert.match(subtitle(), /1 \/ 2$/);
    HandleHudClick(0, "lb_track_next");
    assert.match(subtitle(), /2 \/ 2$/);
    HandleHudClick(0, "lb_track_next");
    assert.match(subtitle(), /1 \/ 2$/, "wraps around");
    HandleHudClick(0, "lb_track_prev");
    assert.match(subtitle(), /2 \/ 2$/);

    const slide = STAT_SLIDES.at(-1);
    HandleHudClick(0, `lb_tab_${slide?.key}`);
    assert.equal(kart.leaderboardTab, slide?.key);
    assert.equal(hud.Variable(0, PAGE, "lb_title"), slide?.title);
    assert.equal(hud.Variable(0, PAGE, "lb_column"), slide?.column);
    assert.ok(hud.Has(0, `lb_tab_${slide?.key}`, "Selected"));
    assert.ok(!hud.Has(0, `lb_tab_${LEADERBOARD_TIMES_TAB}`, "Selected"));
    assert.ok(!hud.Has(0, PAGE, "Paging"), "no track paging on a stat");

    HandleHudClick(0, "leaderboards_back_button");
    assert.ok(!hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(hud.Has(0, PAGE, "Hidden"));
    HandleHudClick(0, "usermenu_leaderboards_button");
    assert.equal(hud.Variable(0, PAGE, "lb_title"), slide?.title, "reopens on the tab picked last");
});
