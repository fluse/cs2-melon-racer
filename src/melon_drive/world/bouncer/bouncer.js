// Starting the map's bouncers (see world/bouncer/constants.js): each one's
// swing is started once, after its own random delay. The map is searched for
// bouncers every BOUNCER_SCAN_SECONDS, so one that spawned after the
// script's first look (or was respawned by a round restart) still starts.
import { Instance } from "cs_script/point_script";
import { BOUNCER_CLASS, BOUNCER_SCAN_SECONDS } from "../../constants/index.js";
import { IsBouncerModel, BouncerStartDelay, BouncerStartInputs } from "./logic.js";

/** @typedef {import("cs_script/point_script").Entity} Entity */

/** bouncer entity -> the delay its swing was started with. @type {Map<Entity, number>} */
export const bouncers = new Map();
let nextScanTime = -Infinity;

/** Forgets the bouncers, so the next update starts them again (after a round restart). */
export function ResetBouncers() {
    bouncers.clear();
    nextScanTime = -Infinity;
}

/** After a hot reload: the bouncers already swinging are left alone. @param {Map<Entity, number> | undefined} previous */
export function RestoreBouncers(previous) {
    for (const [bouncer, delay] of [...(previous ?? [])]) {
        bouncers.set(bouncer, delay);
    }
}

/** Every tick: now and then, starts bouncers not started yet. @param {number} now */
export function UpdateBouncers(now) {
    if (now < nextScanTime) {
        return;
    }
    nextScanTime = now + BOUNCER_SCAN_SECONDS;
    for (const bouncer of [...bouncers.keys()]) {
        if (!bouncer.IsValid()) {
            bouncers.delete(bouncer);
        }
    }
    let added = 0;
    for (const entity of Instance.FindEntitiesByClass(BOUNCER_CLASS)) {
        if (bouncers.has(entity) || !("GetModelName" in entity) || !IsBouncerModel(/** @type {any} */ (entity).GetModelName())) {
            continue;
        }
        const delay = BouncerStartDelay(Math.random());
        for (const { input, value, delay: after } of BouncerStartInputs(delay)) {
            Instance.EntFireAtTarget({ target: entity, input, value, delay: after });
        }
        bouncers.set(entity, delay);
        added++;
    }
    if (added) {
        Instance.Msg(`[melon_drive] bouncers: ${bouncers.size} swinging, ${added} new`);
    }
}
