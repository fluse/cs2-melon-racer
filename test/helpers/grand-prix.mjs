// "Start Grand Prix" as one step for tests about what comes after it: the
// button first calls everyone for GRAND_PRIX_GATHER_SECONDS (race/heat/race-flow.js, GATHERING) — this runs
// that wait out so the Grand Prix starts at `time`, as if clicked then with
// everyone already there. Only after `import "./register-cs-script.mjs"`.
import { world } from "./cs-script-mock.mjs";
import { GRAND_PRIX_GATHER_SECONDS, RacePhase } from "../../src/melon_drive/constants/index.js";

/** @param {any} flow race/heat/race-flow.js @param {number} [time] */
export function StartGrandPrixNow(flow, time = world.time) {
    world.time = time - GRAND_PRIX_GATHER_SECONDS;
    flow.TryStartRace();
    world.time = time;
    if (flow.phase === RacePhase.GATHERING) {
        flow.UpdateRaceFlow(time);
    }
}
