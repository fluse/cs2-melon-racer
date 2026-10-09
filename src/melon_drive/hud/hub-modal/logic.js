// Pure rules of the hub's "Start Grand Prix" window
// (hud/hub-modal/hub-modal.js): the heats it starts and who's listed as
// riding along. No cs_script import (test/hud/hub-modal.test.mjs).

/**
 * @typedef {{ name: string, self: boolean }} HubRacerRow
 * @typedef {{ title: string, rows: HubRacerRow[], more: string }} HubRacerList
 */

/**
 * The racer list for one viewer: everyone standing in the hub's start area
 * — exactly who "Start Grand Prix" takes along — in join order, at most
 * `maxRows`. A viewer who'd fall off the end takes the last row, so they
 * always see themselves; "+N MORE" counts whoever isn't listed.
 * @param {{ key: string, name: string }[]} inHub the players in the start area, in join order
 * @param {string} selfKey the viewer's key @param {number} maxRows
 * @returns {HubRacerList}
 */
export function BuildHubRacerList(inHub, selfKey, maxRows) {
    let shown = inHub.slice(0, maxRows);
    const self = inHub.find((p) => p.key === selfKey);
    if (self && !shown.includes(self)) {
        shown = [...shown.slice(0, maxRows - 1), self];
    }
    const hidden = inHub.length - shown.length;
    return {
        title: `RACERS · ${inHub.length}`,
        rows: shown.map((p) => ({ name: p.name, self: p.key === selfKey })),
        more: hidden > 0 ? `+${hidden} MORE` : "",
    };
}

/**
 * @typedef {{ trackId: number, heat: string, name: string, info: string }} HeatCard
 */

/**
 * One card per heat of the Grand Prix "Start" begins — a heat per track, in
 * race order: "HEAT 1", the route's name (else "ROUTE <id>"), laps and
 * checkpoints.
 * @param {number[]} trackOrder track ids in race order
 * @param {Record<number, { checkpoints: number, lapsToWin: number }>} config
 * @param {Record<number, string>} names route names by track id
 * @returns {HeatCard[]}
 */
export function BuildHeatCards(trackOrder, config, names) {
    return trackOrder.map((trackId, i) => {
        const { checkpoints, lapsToWin } = config[trackId] ?? { checkpoints: 0, lapsToWin: 1 };
        const laps = `${lapsToWin} ${lapsToWin === 1 ? "LAP" : "LAPS"}`;
        const cps = checkpoints === 0 ? "NO CHECKPOINTS" : `${checkpoints} ${checkpoints === 1 ? "CHECKPOINT" : "CHECKPOINTS"}`;
        return { trackId, heat: `HEAT ${i + 1}`, name: (names[trackId] ?? `Route ${trackId}`).toUpperCase(), info: `${laps}  ·  ${cps}` };
    });
}

/** "3 HEATS", "1 HEAT". @param {number} count */
export function HeatsTitle(count) {
    return `HEATS · ${count}`;
}
