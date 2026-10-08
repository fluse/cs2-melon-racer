// Pure rules of the scoreboard (hud/scoreboard/scoreboard.js): what it shows for one
// viewer — the Grand Prix standings, or the best times on a track — as
// ready-to-send strings. No cs_script import (test/hud/scoreboard.test.mjs).
import { SortedStandings, Wins, OrdinalPlace } from "../../race/grand-prix/logic.js";
import { FormatRaceTime } from "../../race/time-trial/logic.js";

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
 * viewer can page to another track (`pickedTrackId`, see StepTrack).
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
 * The track `direction` (-1 / +1) steps from `current` in race order,
 * wrapping around; the first track if `current` isn't one.
 * @param {number[]} trackOrder @param {number | undefined} current @param {number} direction
 */
export function StepTrack(trackOrder, current, direction) {
    if (trackOrder.length === 0) {
        return undefined;
    }
    const index = current !== undefined ? trackOrder.indexOf(current) : -1;
    if (index === -1) {
        return trackOrder[0];
    }
    return trackOrder[(index + direction + trackOrder.length) % trackOrder.length];
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
 *   trackOrder?: number[], // every track — a time trial with more than one shows how to page through them
 *   routeNames?: Record<number, string>, // route names by track id (hud/hub-modal/routes.js)
 * }} input
 * @returns {Scoreboard}
 */
export function BuildScoreboard({ grandPrix, grandPrixMode, boardTrackId, players, self, bestTimes, maxRows, trackOrder = [], routeNames = {} }) {
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
    const position = boardTrackId !== undefined ? trackOrder.indexOf(boardTrackId) + 1 : 0;
    return {
        grandPrixMode: false,
        title: "TIME TRIAL",
        subtitle: route !== undefined ? `${route}  ·  BEST TIMES` : "NO TRACKS",
        bestHeader,
        // Paging hint (hold Tab, A/D — see UpdateScoreboardInput).
        switcher: trackOrder.length > 1 && position > 0 ? `◀  A      ROUTE ${position} / ${trackOrder.length}      D  ▶` : "",
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
