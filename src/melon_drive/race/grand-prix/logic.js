// Pure Grand Prix rules — no cs_script import, so they're unit-testable in
// Node (see test/race/grand-prix.test.mjs). race/grand-prix/grand-prix.js
// holds the running Grand Prix and feeds it from the heat flow.
import { HEAT_POINTS, HEAT_POINTS_FINISHER } from "../../constants/index.js";

/**
 * One racer's tally. `key` tells players apart within a Grand Prix (player
 * slot + name, see PlayerKey in grand-prix.js); `places`/`times` are per
 * track id.
 * @typedef {{ key: string, name: string, points: number, places: Record<string, number>, times: Record<string, number> }} Standing
 */

/**
 * @typedef {{
 *   trackIds: number[], // tracks raced so far, in order — the last one is the current/last heat
 *   totalTracks: number, // how many heats this Grand Prix has
 *   finishers: Record<string, number>, // finishers so far per track id
 *   standings: Record<string, Standing>,
 *   over: boolean, // back in the hub
 *   cancelled: boolean, // ended early (moderator abort, everyone left)
 * }} GrandPrix
 */

/**
 * A fresh Grand Prix for `racers`, everyone on 0 points.
 * @param {{ key: string, name: string }[]} racers @param {number} totalTracks
 * @returns {GrandPrix}
 */
export function NewGrandPrix(racers, totalTracks) {
    /** @type {Record<string, Standing>} */
    const standings = {};
    for (const { key, name } of racers) {
        standings[key] = { key, name, points: 0, places: {}, times: {} };
    }
    return { trackIds: [], totalTracks, finishers: {}, standings, over: false, cancelled: false };
}

/** Points for finishing a heat in `place` (1 = first). @param {number} place */
export function HeatPoints(place) {
    return HEAT_POINTS[place - 1] ?? HEAT_POINTS_FINISHER;
}

/** A heat on `trackId` begins. @param {GrandPrix} gp @param {number} trackId */
export function BeginGrandPrixHeat(gp, trackId) {
    if (gp.trackIds[gp.trackIds.length - 1] !== trackId) {
        gp.trackIds.push(trackId);
    }
    gp.finishers[trackId] ??= 0;
}

/**
 * A racer crossed the finish of their last lap on `trackId`: the next free
 * place there, and its points. A racer who already has a place there keeps
 * it (nothing is counted twice).
 * @param {GrandPrix} gp @param {number} trackId @param {{ key: string, name: string }} racer @param {number | undefined} time
 * @returns {{ place: number, points: number }}
 */
export function RecordHeatFinish(gp, trackId, racer, time) {
    const standing = (gp.standings[racer.key] ??= { key: racer.key, name: racer.name, points: 0, places: {}, times: {} });
    const existing = standing.places[trackId];
    if (existing !== undefined) {
        return { place: existing, points: HeatPoints(existing) };
    }
    const place = (gp.finishers[trackId] ?? 0) + 1;
    gp.finishers[trackId] = place;
    const points = HeatPoints(place);
    standing.places[trackId] = place;
    standing.points += points;
    if (time !== undefined) {
        standing.times[trackId] = time;
    }
    return { place, points };
}

/** How many heats `standing` won. @param {Standing} standing */
export function Wins(standing) {
    return Object.values(standing.places).filter((place) => place === 1).length;
}

/**
 * The standings, leader first: most points, then most heat wins, then the
 * lowest total time over the heats run, then by name.
 * @param {GrandPrix} gp
 * @returns {Standing[]}
 */
export function SortedStandings(gp) {
    const total = (/** @type {Standing} */ s) => Object.values(s.times).reduce((sum, t) => sum + t, 0);
    return Object.values(gp.standings).sort(
        (a, b) => b.points - a.points || Wins(b) - Wins(a) || total(a) - total(b) || a.name.localeCompare(b.name)
    );
}

/** "1ST", "2ND", "3RD", "4TH", … "11TH", "21ST". @param {number} place */
export function OrdinalPlace(place) {
    const tens = place % 100;
    const suffix = tens >= 11 && tens <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][place % 10] ?? "TH";
    return `${place}${suffix}`;
}
