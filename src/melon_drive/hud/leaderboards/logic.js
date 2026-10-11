// Pure rules of the user menu's leaderboards page (hud/leaderboards/leaderboards.js):
// its tabs — one track's best times, then every player stat —, which track
// the best times are on, and the board a tab shows as ready-to-send
// strings. Rows and ranks come from the scoreboard's rules. No cs_script
// import (test/hud/leaderboards.test.mjs).
import { BuildScoreboard, BuildStatBoard, StepPage } from "../scoreboard/logic.js";
import { LEADERBOARD_TIMES_TAB, STAT_SLIDES } from "../../constants/index.js";

/**
 * @typedef {{ rank: string, name: string, value: string, self: boolean }} LeaderboardRow
 * @typedef {{ title: string, subtitle: string, column: string, rows: LeaderboardRow[] }} Leaderboard
 */

/** Every tab, in order: the best times, then STAT_SLIDES. */
export function LeaderboardTabs() {
    return [LEADERBOARD_TIMES_TAB, ...STAT_SLIDES.map((slide) => slide.key)];
}

/** The tab shown: the one picked, else (none, or one that's gone) the best times. @param {string | undefined} picked */
export function LeaderboardTab(picked) {
    return picked !== undefined && LeaderboardTabs().includes(picked) ? picked : LEADERBOARD_TIMES_TAB;
}

/**
 * The track the best times are on: the one the viewer paged to, else their
 * own track, else the first one (undefined: no tracks).
 * @param {number[]} trackOrder @param {number | undefined} picked @param {number | undefined} kartTrackId
 */
export function LeaderboardTrack(trackOrder, picked, kartTrackId) {
    for (const id of [picked, kartTrackId]) {
        if (id !== undefined && trackOrder.includes(id)) {
            return id;
        }
    }
    return trackOrder[0];
}

/**
 * The track `direction` (-1 / +1) pages to from `current`, wrapping around.
 * @param {number[]} trackOrder @param {number | undefined} current @param {number} direction
 */
export function StepLeaderboardTrack(trackOrder, current, direction) {
    return current === undefined ? trackOrder[0] : StepPage(trackOrder, current, direction);
}

/**
 * The board one tab shows: the best times on `trackId`, or one stat's
 * all-time totals — saved ones of players who aren't on the map included.
 * @param {{
 *   tab: string, // from LeaderboardTab
 *   trackOrder: number[],
 *   trackId: number | undefined, // from LeaderboardTrack
 *   bestTimes: Record<string, number>, // best times on trackId by player name (the times tab)
 *   statTotals: Record<string, number>, // the tab's stat by player name (a stat tab)
 *   players: { key: string, name: string }[], // everyone on the map now
 *   self: { key: string, name: string },
 *   maxRows: number,
 *   routeNames?: Record<number, string>, // route names by track id (hud/hub-modal/routes.js)
 * }} input
 * @returns {Leaderboard}
 */
export function BuildLeaderboard({ tab, trackOrder, trackId, bestTimes, statTotals, players, self, maxRows, routeNames = {} }) {
    /** @param {{ rank: string, name: string, best: string, self: boolean }[]} rows */
    const Rows = (rows) => rows.map((row) => ({ rank: row.rank, name: row.name, value: row.best, self: row.self }));
    const slide = STAT_SLIDES.find((s) => s.key === tab);
    if (slide) {
        const board = BuildStatBoard({ slide, totals: statTotals, players, self, maxRows });
        return { title: slide.title, subtitle: "ALL TIME", column: slide.column, rows: Rows(board.rows) };
    }
    const board = BuildScoreboard({ grandPrix: undefined, grandPrixMode: false, boardTrackId: trackId, players, self, bestTimes, maxRows, routeNames });
    const route = trackId !== undefined ? (routeNames[trackId] ?? `Track ${trackId}`).toUpperCase() : undefined;
    const paging = trackOrder.length > 1 && trackId !== undefined ? `  ·  ROUTE ${trackOrder.indexOf(trackId) + 1} / ${trackOrder.length}` : "";
    // The route is the title: the button on the left already says it's the best times.
    if (route === undefined) {
        return { title: "BEST TIMES", subtitle: "NO TRACKS", column: "TIME", rows: Rows(board.rows) };
    }
    return { title: route, subtitle: `BEST TIMES${paging}`, column: "TIME", rows: Rows(board.rows) };
}
