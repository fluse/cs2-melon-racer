// The scoreboard's rules (hud/scoreboard/logic.js): which board a viewer
// sees, its rows and ranks — and that speedometer.xml has every panel
// hud/scoreboard/scoreboard.js fills in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ScoreboardView, BuildScoreboard, BuildStatBoard, ScoreboardPages, CurrentPage, StatSlideOf, StepPage, PageSwitcher } from "../../src/melon_drive/hud/scoreboard/logic.js";
import { NewGrandPrix, BeginGrandPrixHeat, RecordHeatFinish, HeatPoints } from "../../src/melon_drive/race/grand-prix/logic.js";
import { FormatRaceTime } from "../../src/melon_drive/race/time-trial/logic.js";
import { FormatStat } from "../../src/melon_drive/race/stats/logic.js";
import { SCOREBOARD_ROWS, STAT_SLIDES } from "../../src/melon_drive/constants/index.js";

const A = { key: "0:Anna", name: "Anna" };
const B = { key: "1:Ben", name: "Ben" };
const C = { key: "2:Cleo", name: "Cleo" };

function RunningGrandPrix() {
    const gp = NewGrandPrix([A, B], 2);
    BeginGrandPrixHeat(gp, 1);
    RecordHeatFinish(gp, 1, B, 30);
    RecordHeatFinish(gp, 1, A, 32);
    BeginGrandPrixHeat(gp, 2);
    return gp;
}

test("view: the Grand Prix while one runs, its heat's track for the best times", () => {
    const gp = RunningGrandPrix();
    assert.deepEqual(ScoreboardView({ grandPrix: gp, activeTrackId: 2, kartTrackId: 2, trackOrder: [1, 2] }), { grandPrixMode: true, boardTrackId: 2 });
});

test("view: after a Grand Prix its standings stay in the hub, a time trial shows its track's best times", () => {
    const gp = RunningGrandPrix();
    gp.over = true;
    assert.deepEqual(ScoreboardView({ grandPrix: gp, activeTrackId: undefined, kartTrackId: undefined, trackOrder: [1, 2] }), { grandPrixMode: true, boardTrackId: 2 });
    assert.deepEqual(ScoreboardView({ grandPrix: gp, activeTrackId: undefined, kartTrackId: 1, trackOrder: [1, 2] }), { grandPrixMode: false, boardTrackId: 1 });
});

test("view: never a Grand Prix — the viewer's track, else the first one", () => {
    assert.deepEqual(ScoreboardView({ grandPrix: undefined, activeTrackId: undefined, kartTrackId: 2, trackOrder: [1, 2] }), { grandPrixMode: false, boardTrackId: 2 });
    assert.deepEqual(ScoreboardView({ grandPrix: undefined, activeTrackId: undefined, kartTrackId: undefined, trackOrder: [1, 2] }), { grandPrixMode: false, boardTrackId: 1 });
    assert.equal(ScoreboardView({ grandPrix: undefined, activeTrackId: undefined, kartTrackId: undefined, trackOrder: [] }).boardTrackId, undefined);
});

test("Grand Prix board: leader first, points, place in the current heat, best time; onlookers after the racers", () => {
    const gp = RunningGrandPrix();
    RecordHeatFinish(gp, 2, A, 20);
    const board = BuildScoreboard({
        grandPrix: gp, grandPrixMode: true, boardTrackId: 2,
        players: [A, B, C], self: A, bestTimes: { Anna: 20, Cleo: 18.5 }, maxRows: SCOREBOARD_ROWS,
    });
    assert.equal(board.grandPrixMode, true);
    assert.equal(board.title, "GRAND PRIX");
    assert.match(board.subtitle, /TRACK 2/);
    assert.match(board.subtitle, /HEAT 2\/2/);
    assert.equal(board.bestHeader, "BEST T2");
    assert.deepEqual(board.rows.map((r) => [r.rank, r.name, r.points, r.heat, r.self]), [
        ["1", "Anna", String(HeatPoints(2) + HeatPoints(1)), "1ST", true],
        ["2", "Ben", String(HeatPoints(1)), "–", false],
        ["–", "Cleo", "–", "–", false],
    ]);
    assert.equal(board.rows[0].best, FormatRaceTime(20));
    assert.equal(board.rows[1].best, "-:--.--");
});

test("Grand Prix board: equal points and wins share a rank", () => {
    const gp = NewGrandPrix([A, B, C], 1);
    gp.standings[C.key].points = 5;
    const board = BuildScoreboard({ grandPrix: gp, grandPrixMode: true, boardTrackId: 1, players: [], self: A, bestTimes: {}, maxRows: SCOREBOARD_ROWS });
    assert.deepEqual(board.rows.map((r) => r.rank), ["1", "2", "2"]);
});

test("Grand Prix board after the last track says FINAL — or CANCELLED after an abort", () => {
    const gp = RunningGrandPrix();
    gp.over = true;
    const args = { grandPrix: gp, grandPrixMode: true, boardTrackId: 2, players: [], self: A, bestTimes: {}, maxRows: SCOREBOARD_ROWS };
    assert.match(BuildScoreboard(args).title, /FINAL/);
    gp.cancelled = true;
    assert.match(BuildScoreboard(args).title, /CANCELLED/);
});

test("time trial board: saved best times (players who left too), fastest first, players without a time last", () => {
    const board = BuildScoreboard({
        grandPrix: undefined, grandPrixMode: false, boardTrackId: 1,
        players: [A, C], self: C, bestTimes: { Anna: 31, Gone: 29, Ben: 31 }, maxRows: SCOREBOARD_ROWS,
    });
    assert.equal(board.grandPrixMode, false);
    assert.equal(board.title, "TIME TRIAL");
    assert.deepEqual(board.rows.map((r) => [r.rank, r.name, r.best, r.self]), [
        ["1", "Gone", FormatRaceTime(29), false],
        ["2", "Anna", FormatRaceTime(31), false],
        ["2", "Ben", FormatRaceTime(31), false],
        ["–", "Cleo", "-:--.--", true],
    ]);
});

test("more players than rows: the viewer's own row takes the last one", () => {
    /** @type {Record<string, number>} */
    const bestTimes = {};
    for (let i = 0; i < SCOREBOARD_ROWS + 5; i++) {
        bestTimes[`P${String(i).padStart(2, "0")}`] = 10 + i;
    }
    const self = { key: "9:Slow", name: "Slow" };
    const board = BuildScoreboard({ grandPrix: undefined, grandPrixMode: false, boardTrackId: 1, players: [self], self, bestTimes, maxRows: SCOREBOARD_ROWS });
    assert.equal(board.rows.length, SCOREBOARD_ROWS);
    assert.equal(board.rows[SCOREBOARD_ROWS - 1].name, "Slow");
    assert.equal(board.rows[SCOREBOARD_ROWS - 1].self, true);
    assert.equal(board.rows[0].name, "P00");
});

const layout = readFileSync(new URL("../../panorama/layout/custom_game/speedometer.xml", import.meta.url), "utf8");
const css = readFileSync(new URL("../../panorama/styles/custom_game/speedometer.css", import.meta.url), "utf8");

test("speedometer.xml has the scoreboard and SCOREBOARD_ROWS rows, each with every column", () => {
    assert.match(layout, /<Panel id="scoreboard"/);
    for (const variable of ["title", "subtitle", "best_header"]) {
        assert.ok(layout.includes(`{s:${variable}}`), variable);
    }
    for (let i = 0; i < SCOREBOARD_ROWS; i++) {
        const row = layout.match(new RegExp(`<Panel id="score_row_${i}"[^>]*>([\\s\\S]*?)</Panel>`));
        assert.ok(row, `score_row_${i}`);
        for (const variable of ["rank", "name", "points", "heat", "best"]) {
            assert.ok(row[1].includes(`{s:${variable}}`), `score_row_${i} shows ${variable}`);
        }
    }
    assert.ok(!layout.includes(`id="score_row_${SCOREBOARD_ROWS}"`), "no row the script never fills");
});

test("the scoreboard shows only while the engine's HUD_SCOREBOARD_VISIBLE class is set", () => {
    assert.match(css, /\.HUD_SCOREBOARD_VISIBLE \.Scoreboard\s*\{\s*visibility: visible;/);
    assert.match(css, /\.Scoreboard \{[^}]*visibility: collapse;/);
});

test("time trial paging: a picked track wins over the own one, never in a Grand Prix", () => {
    const base = { grandPrix: undefined, activeTrackId: undefined, kartTrackId: 1, trackOrder: [1, 2, 3] };
    assert.equal(ScoreboardView({ ...base, pickedTrackId: 3 }).boardTrackId, 3);
    assert.equal(ScoreboardView({ ...base, pickedTrackId: 9 }).boardTrackId, 1, "a track that doesn't exist is ignored");
    const gp = RunningGrandPrix();
    assert.equal(ScoreboardView({ ...base, grandPrix: gp, activeTrackId: 2, pickedTrackId: 3 }).boardTrackId, 2);
});

const STAT_PAGES = STAT_SLIDES.map((slide) => `stat:${slide.key}`);

test("pages: every track's best times (or the standings), then every stat", () => {
    assert.deepEqual(ScoreboardPages(false, [1, 2, 3]), ["track:1", "track:2", "track:3", ...STAT_PAGES]);
    assert.deepEqual(ScoreboardPages(true, [1, 2, 3]), ["standings", ...STAT_PAGES], "a Grand Prix: one standings page");
    assert.deepEqual(ScoreboardPages(false, []), ["track:", ...STAT_PAGES]);
});

test("current page: a picked stat, else the standings or the board's track", () => {
    const stat = STAT_SLIDES[1].key;
    assert.equal(CurrentPage(false, 2, undefined), "track:2");
    assert.equal(CurrentPage(true, 2, undefined), "standings");
    assert.equal(CurrentPage(false, 2, stat), `stat:${stat}`);
    assert.equal(CurrentPage(true, 2, stat), `stat:${stat}`, "stats in a Grand Prix too");
    assert.equal(CurrentPage(false, 2, "nonsense"), "track:2", "an unknown stat is ignored");
    assert.equal(StatSlideOf(`stat:${stat}`), STAT_SLIDES[1]);
    assert.equal(StatSlideOf("track:2"), undefined);
});

test("StepPage: next/previous, wrapping around — from the last route into the stats and back", () => {
    const pages = ScoreboardPages(false, [1, 2]);
    assert.equal(StepPage(pages, "track:1", 1), "track:2");
    assert.equal(StepPage(pages, "track:2", 1), STAT_PAGES[0]);
    assert.equal(StepPage(pages, STAT_PAGES[STAT_PAGES.length - 1], 1), "track:1");
    assert.equal(StepPage(pages, "track:1", -1), STAT_PAGES[STAT_PAGES.length - 1]);
    assert.equal(StepPage(pages, "track:9", 1), "track:1", "unknown: the first page");
});

test("paging hint: which route, which stat, or the standings", () => {
    const pages = ScoreboardPages(false, [1, 2, 3]);
    assert.match(PageSwitcher(pages, "track:2"), /A .*ROUTE 2 \/ 3.* D/);
    assert.match(PageSwitcher(pages, STAT_PAGES[1]), new RegExp(`STATS 2 / ${STAT_PAGES.length}`));
    assert.match(PageSwitcher(ScoreboardPages(true, [1]), "standings"), /STANDINGS/);
    assert.equal(PageSwitcher(["track:1"], "track:1"), "", "one page: nothing to page");
});

test("time trial board: route name in the subtitle", () => {
    const args = { grandPrix: undefined, grandPrixMode: false, players: [A], self: A, bestTimes: {}, maxRows: SCOREBOARD_ROWS, routeNames: { 2: "Bridge" } };
    assert.match(BuildScoreboard({ ...args, boardTrackId: 2 }).subtitle, /^BRIDGE/);
    assert.match(BuildScoreboard({ ...args, boardTrackId: 1 }).subtitle, /^TRACK 1/, "no name: the track number");
});

test("stat board: highest first, saved totals of absent players too, no rank for nothing yet", () => {
    const slide = STAT_SLIDES.find((s) => s.format === "count");
    const board = BuildStatBoard({ slide, totals: { Ben: 7, Dora: 12, Anna: 7 }, players: [A, B, C], self: B, maxRows: SCOREBOARD_ROWS });
    assert.equal(board.title, slide.title);
    assert.equal(board.bestHeader, slide.column);
    assert.equal(board.grandPrixMode, false, "TimeTrial layout: no PTS/HEAT columns");
    assert.deepEqual(board.rows.map((r) => [r.rank, r.name, r.best]), [
        ["1", "Dora", FormatStat(slide, 12)],
        ["2", "Anna", FormatStat(slide, 7)],
        ["2", "Ben", FormatStat(slide, 7)],
        ["–", "Cleo", FormatStat(slide, 0)],
    ]);
    assert.deepEqual(board.rows.map((r) => r.self), [false, false, true, false]);
});

test("stat board: more players than rows — the viewer's own row takes the last one", () => {
    const slide = STAT_SLIDES[0];
    const totals = Object.fromEntries(Array.from({ length: SCOREBOARD_ROWS + 3 }, (_, i) => [`P${i}`, 100 - i]));
    const board = BuildStatBoard({ slide, totals, players: [A], self: A, maxRows: SCOREBOARD_ROWS });
    assert.equal(board.rows.length, SCOREBOARD_ROWS);
    assert.equal(board.rows[SCOREBOARD_ROWS - 1].name, "Anna");
});
