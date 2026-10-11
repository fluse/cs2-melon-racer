// Pure rules of the scoreboard (hud/scoreboard/scoreboard.js): what it shows for one
// viewer — the Grand Prix standings, the best times on a track, or one of the
// players' all-time stats — as ready-to-send strings, and the pages A/D step
// through. No cs_script import (test/hud/scoreboard.test.mjs).
import { SortedStandings, Wins, OrdinalPlace } from "../../race/grand-prix/logic.js";
import { FormatRaceTime } from "../../race/time-trial/logic.js";
import { FormatStat } from "../../race/stats/logic.js";
import { STAT_SLIDES } from "../../constants/index.js";

/**
 * @typedef {{ rank: string, name: string, points: string, heat: string, best: string, self: boolean }} ScoreRow
 * @typedef {{ grandPrixMode: boolean, title: string, subtitle: string, bestHeader: string, switcher: string, rows: ScoreRow[] }} Scoreboard
 */

const NONE = "–";
const NO_TIME = "-:--.--";

/**
 * Which board a viewer sees. The Grand Prix standings while one is running,
 * and its final standings afterwards — unless the viewer is on a track in a
 * time trial, then that track's best times. The best-time column is for
 * the heat's track in a Grand Prix, else the viewer's own track, else the
 * last Grand Prix's last track, else the first track. In a time trial the
 * viewer can page to another track (`pickedTrackId`, see StepPage).
 * @param {{ grandPrix: import("../../race/grand-prix/logic.js").GrandPrix | undefined, activeTrackId: number | undefined, kartTrackId: number | undefined, trackOrder: number[], pickedTrackId?: number }} input
 */
export function ScoreboardView({ grandPrix, activeTrackId, kartTrackId, trackOrder, pickedTrackId }) {
    const running = grandPrix !== undefined && !grandPrix.over;
    const grandPrixMode = running || (grandPrix !== undefined && kartTrackId === undefined);
    const lastGrandPrixTrack = grandPrix?.trackIds[grandPrix.trackIds.length - 1];
    const picked = !grandPrixMode && pickedTrackId !== undefined && trackOrder.includes(pickedTrackId) ? pickedTrackId : undefined;
    const boardTrackId = picked ?? (running ? activeTrackId : undefined) ?? kartTrackId ?? lastGrandPrixTrack ?? trackOrder[0];
    return { grandPrixMode, boardTrackId };
}

/**
 * The pages A/D step through with Tab held, in order: the Grand Prix
 * standings (one page) or every track's best times (one per track, race
 * order), then every stat (STAT_SLIDES). Page ids: "standings",
 * "track:<id>" ("track:" without any track), "stat:<key>".
 * @param {boolean} grandPrixMode @param {number[]} trackOrder
 */
export function ScoreboardPages(grandPrixMode, trackOrder) {
    const main = grandPrixMode ? ["standings"] : trackOrder.length > 0 ? trackOrder.map((id) => `track:${id}`) : ["track:"];
    return [...main, ...STAT_SLIDES.map((slide) => `stat:${slide.key}`)];
}

/**
 * The page a viewer is on: a stat they paged to, else the standings or
 * the board's track (ScoreboardView).
 * @param {boolean} grandPrixMode @param {number | undefined} boardTrackId @param {string | undefined} pickedStat
 */
export function CurrentPage(grandPrixMode, boardTrackId, pickedStat) {
    if (pickedStat !== undefined && STAT_SLIDES.some((slide) => slide.key === pickedStat)) {
        return `stat:${pickedStat}`;
    }
    return grandPrixMode ? "standings" : `track:${boardTrackId ?? ""}`;
}

/** The STAT_SLIDES entry a page shows, if it's a stat page. @param {string} page */
export function StatSlideOf(page) {
    return STAT_SLIDES.find((slide) => `stat:${slide.key}` === page);
}

/**
 * The page `direction` (-1 / +1) steps from `current`, wrapping around;
 * the first page if `current` isn't one.
 * @param {string[]} pages @param {string} current @param {number} direction
 */
export function StepPage(pages, current, direction) {
    const index = pages.indexOf(current);
    if (index === -1) {
        return pages[0];
    }
    return pages[(index + direction + pages.length) % pages.length];
}

/**
 * The paging hint under the subtitle: which page of its kind this is
 * ("ROUTE 2 / 3", "STATS 1 / 5", "STANDINGS") between the A and D arrows;
 * empty with nothing to page to.
 * @param {string[]} pages @param {string} current
 */
export function PageSwitcher(pages, current) {
    if (pages.length <= 1) {
        return "";
    }
    const kind = current.split(":")[0];
    const same = pages.filter((page) => page.split(":")[0] === kind);
    const label = kind === "standings" ? "STANDINGS" : `${kind === "stat" ? "STATS" : "ROUTE"} ${same.indexOf(current) + 1} / ${same.length}`;
    return `◀  A      ${label}      D  ▶`;
}

/**
 * Ranks shared by equal entries: `same(a, b)` says whether b ties with the
 * entry before it. [10, 8, 8, 5] -> 1, 2, 2, 4.
 * @template T @param {T[]} sorted @param {(a: T, b: T) => boolean} same
 */
function SharedRanks(sorted, same) {
    /** @type {number[]} */
    const ranks = [];
    sorted.forEach((entry, i) => {
        ranks.push(i > 0 && same(sorted[i - 1], entry) ? ranks[i - 1] : i + 1);
    });
    return ranks;
}

/** @param {number | undefined} time */
function TimeText(time) {
    return time !== undefined ? FormatRaceTime(time) : NO_TIME;
}

/**
 * Best time first, players without one after them, then by name.
 * @param {{ name: string, best: number | undefined }} a @param {{ name: string, best: number | undefined }} b
 */
function ByBestTime(a, b) {
    return (a.best ?? Infinity) - (b.best ?? Infinity) || a.name.localeCompare(b.name);
}

/**
 * At most `maxRows` rows — if the viewer's own row would be cut off, it
 * takes the last row's place.
 * @param {ScoreRow[]} rows @param {number} maxRows
 */
function KeepSelf(rows, maxRows) {
    if (rows.length <= maxRows) {
        return rows;
    }
    const selfIndex = rows.findIndex((row) => row.self);
    return selfIndex >= maxRows ? [...rows.slice(0, maxRows - 1), rows[selfIndex]] : rows.slice(0, maxRows);
}

/**
 * The scoreboard one viewer sees.
 * @param {{
 *   grandPrix: import("../../race/grand-prix/logic.js").GrandPrix | undefined,
 *   grandPrixMode: boolean, // from ScoreboardView
 *   boardTrackId: number | undefined, // from ScoreboardView
 *   players: { key: string, name: string }[], // everyone on the map now (Grand Prix key, see PlayerKey)
 *   self: { key: string, name: string },
 *   bestTimes: Record<string, number>, // best time on boardTrackId by player name, saved ones included
 *   maxRows: number,
 *   routeNames?: Record<number, string>, // route names by track id (hud/hub-modal/routes.js)
 * }} input
 * @returns {Scoreboard}
 */
export function BuildScoreboard({ grandPrix, grandPrixMode, boardTrackId, players, self, bestTimes, maxRows, routeNames = {} }) {
    const bestHeader = boardTrackId !== undefined ? `BEST T${boardTrackId}` : "BEST";
    if (grandPrixMode && grandPrix) {
        const heatTrack = grandPrix.trackIds[grandPrix.trackIds.length - 1];
        const standings = SortedStandings(grandPrix);
        const ranks = SharedRanks(standings, (a, b) => a.points === b.points && Wins(a) === Wins(b));
        /** @type {ScoreRow[]} */
        const rows = standings.map((standing, i) => {
            const place = heatTrack !== undefined ? standing.places[heatTrack] : undefined;
            return {
                rank: String(ranks[i]),
                name: standing.name,
                points: String(standing.points),
                heat: place !== undefined ? OrdinalPlace(place) : NONE,
                best: TimeText(bestTimes[standing.name]),
                self: standing.key === self.key,
            };
        });
        // Players who didn't start in this Grand Prix, after its racers.
        const watching = players
            .filter((player) => !grandPrix.standings[player.key])
            .map((player) => ({ ...player, best: bestTimes[player.name] }))
            .sort(ByBestTime);
        for (const player of watching) {
            rows.push({ rank: NONE, name: player.name, points: NONE, heat: NONE, best: TimeText(player.best), self: player.key === self.key });
        }
        const heats = `${grandPrix.trackIds.length}/${grandPrix.totalTracks}`;
        return {
            grandPrixMode: true,
            title: grandPrix.over ? (grandPrix.cancelled ? "GRAND PRIX — CANCELLED" : "GRAND PRIX — FINAL") : "GRAND PRIX",
            subtitle: grandPrix.over ? `${heats} TRACKS RACED` : `TRACK ${heatTrack ?? NONE}  ·  HEAT ${heats}`,
            bestHeader,
            switcher: "",
            rows: KeepSelf(rows, maxRows),
        };
    }

    // Time trial: everyone with a saved time on the track, and everyone on
    // the map without one.
    const names = new Set([...Object.keys(bestTimes), ...players.map((player) => player.name)]);
    const entries = [...names].map((name) => ({ name, best: bestTimes[name] })).sort(ByBestTime);
    const ranks = SharedRanks(entries, (a, b) => a.best === b.best);
    const route = boardTrackId !== undefined ? (routeNames[boardTrackId] ?? `Track ${boardTrackId}`).toUpperCase() : undefined;
    return {
        grandPrixMode: false,
        title: "TIME TRIAL",
        subtitle: route !== undefined ? `${route}  ·  BEST TIMES` : "NO TRACKS",
        bestHeader,
        switcher: "", // the paging hint: PageSwitcher
        rows: KeepSelf(
            entries.map((entry, i) => ({
                rank: entry.best !== undefined ? String(ranks[i]) : NONE,
                name: entry.name,
                points: NONE,
                heat: NONE,
                best: TimeText(entry.best),
                self: entry.name === self.name,
            })),
            maxRows
        ),
    };
}

/**
 * A stat page: every player with a total — saved ones of players who
 * aren't on the map included — and everyone on the map without one, the
 * highest first; nobody gets a rank for nothing yet.
 * @param {{
 *   slide: { key: string, title: string, column: string, format: string }, // from STAT_SLIDES
 *   totals: Record<string, number>, // the stat's totals by player name
 *   players: { name: string }[], // everyone on the map now
 *   self: { name: string },
 *   maxRows: number,
 * }} input
 * @returns {Scoreboard}
 */
export function BuildStatBoard({ slide, totals, players, self, maxRows }) {
    const names = new Set([...Object.keys(totals), ...players.map((player) => player.name)]);
    const entries = [...names]
        .map((name) => ({ name, value: totals[name] ?? 0 }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const ranks = SharedRanks(entries, (a, b) => a.value === b.value);
    return {
        grandPrixMode: false,
        title: slide.title,
        subtitle: "ALL TIME",
        bestHeader: slide.column,
        switcher: "", // the paging hint: PageSwitcher
        rows: KeepSelf(
            entries.map((entry, i) => ({
                rank: entry.value > 0 ? String(ranks[i]) : NONE,
                name: entry.name,
                points: NONE,
                heat: NONE,
                best: FormatStat(slide, entry.value),
                self: entry.name === self.name,
            })),
            maxRows
        ),
    };
}
