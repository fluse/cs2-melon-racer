// Starting the map's bouncers (see world/bouncer/constants.js): each one is
// held upright when it's found and its swing started at its own random time,
// counted on the script's clock. The map is searched for bouncers every
// BOUNCER_SCAN_SECONDS, so one that spawned after the script's first look
// (or was respawned by a round restart) still starts.
import { Instance, Console } from "cs_script/point_script";
import { BOUNCER_CLASS, BOUNCER_SCAN_SECONDS } from "../../constants/index.js";
import { IsBouncerModel, BouncerStartDelay, BouncerHoldInputs, BouncerSwingInputs } from "./logic.js";

/** @typedef {import("cs_script/point_script").Entity} Entity */

/**
 * bouncer entity -> when its swing starts (game time), and whether it has.
 * @type {Map<Entity, { startAt: number, started: boolean }>}
 */
export const bouncers = new Map();
let nextScanTime = -Infinity;

/** Forgets the bouncers, so the next update starts them again (after a round restart). */
export function ResetBouncers() {
    bouncers.clear();
    nextScanTime = -Infinity;
}

/** After a hot reload: the bouncers already swinging (or waiting) are kept. @param {Map<Entity, { startAt: number, started: boolean }> | undefined} previous */
export function RestoreBouncers(previous) {
    for (const [bouncer, state] of [...(previous ?? [])]) {
        if (typeof state === "object") {
            bouncers.set(bouncer, state);
        }
    }
}

/** @param {Entity} target @param {[string, string][]} inputs */
function Fire(target, inputs) {
    for (const [input, value] of inputs) {
        Instance.EntFireAtTarget({ target, input, value });
    }
}

/** Holds bouncers not known yet upright, each with its own random start. @param {number} now */
function ScanBouncers(now) {
    let added = 0;
    for (const entity of Instance.FindEntitiesByClass(BOUNCER_CLASS)) {
        const model = /** @type {any} */ (entity).GetModelName?.() ?? "";
        if (bouncers.has(entity) || !IsBouncerModel(model)) {
            continue;
        }
        Fire(entity, BouncerHoldInputs());
        bouncers.set(entity, { startAt: now + BouncerStartDelay(Math.random()), started: false });
        added++;
    }
    if (added) {
        const waits = [...bouncers.values()].filter((b) => !b.started).map((b) => `${(b.startAt - now).toFixed(2)}s`);
        Console.Log(`[melon_drive] bouncers: ${bouncers.size} found, ${added} new, swinging in ${waits.join(", ")}`);
    }
}

/** Every tick: now and then a look for new bouncers; every bouncer whose time has come starts swinging. @param {number} now */
export function UpdateBouncers(now) {
    if (now >= nextScanTime) {
        nextScanTime = now + BOUNCER_SCAN_SECONDS;
        for (const bouncer of [...bouncers.keys()]) {
            if (!bouncer.IsValid()) {
                bouncers.delete(bouncer);
            }
        }
        ScanBouncers(now);
    }
    for (const [bouncer, state] of bouncers) {
        if (!state.started && now >= state.startAt) {
            state.started = true;
            Fire(bouncer, BouncerSwingInputs());
        }
    }
}
