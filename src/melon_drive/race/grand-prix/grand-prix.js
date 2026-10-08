import { Debug } from "../../core/debug.js";
import { NewGrandPrix, BeginGrandPrixHeat, RecordHeatFinish, OrdinalPlace } from "./logic.js";

// The running Grand Prix (or the last one, until the next starts — the
// scoreboard shows its final standings in the hub). race/heat/race-flow.js
// starts it with the hub's "Start Grand Prix", opens a heat per track and records
// every finish; the rules are in logic.js.

/** @type {import("./logic.js").GrandPrix | undefined} */
export let grandPrix = undefined;

/**
 * Tells players apart within a Grand Prix: slot plus name, so a player who
 * leaves keeps their row, and someone joining into the same slot later
 * doesn't take it over.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function PlayerKey(kart) {
    const controller = kart.pawn.GetPlayerController();
    return `${controller?.GetPlayerSlot() ?? "?"}:${controller?.GetPlayerName() ?? ""}`;
}

/** @param {import("../../core/kart-registry.js").Kart} kart */
function Racer(kart) {
    return { key: PlayerKey(kart), name: kart.pawn.GetPlayerController()?.GetPlayerName() ?? "" };
}

/**
 * A new Grand Prix over `totalTracks` tracks for `racers` — replaces the
 * previous one's standings.
 * @param {import("../../core/kart-registry.js").Kart[]} racers @param {number} totalTracks
 */
export function StartGrandPrix(racers, totalTracks) {
    grandPrix = NewGrandPrix(racers.map(Racer), totalTracks);
    Debug(`StartGrandPrix: ${racers.length} racer(s), ${totalTracks} track(s)`);
}

/** @param {number} trackId */
export function StartGrandPrixHeat(trackId) {
    if (grandPrix && !grandPrix.over) {
        BeginGrandPrixHeat(grandPrix, trackId);
    }
}

/**
 * A racer finished the heat on `trackId`: their place and points, or
 * undefined without a running Grand Prix.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} trackId
 */
export function RecordGrandPrixFinish(kart, trackId) {
    if (!grandPrix || grandPrix.over) {
        return undefined;
    }
    const time = kart.lastRun?.trackId === trackId ? kart.lastRun.time : undefined;
    const result = RecordHeatFinish(grandPrix, trackId, Racer(kart), time);
    Debug(`RecordGrandPrixFinish: "${Racer(kart).name}" ${OrdinalPlace(result.place)} on track ${trackId}, +${result.points}`);
    return result;
}

/** The group is back in the hub — the standings stay for the scoreboard. @param {boolean} cancelled */
export function EndGrandPrix(cancelled) {
    if (grandPrix && !grandPrix.over) {
        grandPrix.over = true;
        grandPrix.cancelled = cancelled;
    }
}

/** Restores the Grand Prix from an OnScriptReload snapshot (see index.js). @param {import("./logic.js").GrandPrix | undefined} snapshot */
export function RestoreGrandPrix(snapshot) {
    grandPrix = snapshot ?? grandPrix;
}
