// Starting the map's movers and keeping them going back and forth (see
// world/mover/constants.js). Each mover's output connections are kept here,
// by entity, so one is never set up twice and a hot reload can swap them
// for its new callbacks.
import { Instance } from "cs_script/point_script";
import { MOVER_CLASS } from "../../constants/index.js";
import { Debug } from "../../core/debug.js";
import { ParseMoverName } from "./logic.js";

/** @typedef {import("cs_script/point_script").Entity} Entity */

/** mover entity -> its OnFullyOpen/OnFullyClosed connection ids. @type {Map<Entity, (number | undefined)[]>} */
export const movers = new Map();

/** @param {Entity} mover @param {number} wait */
function Connect(mover, wait) {
    const turn = (/** @type {string} */ input) => () => {
        Instance.EntFireAtTarget({ target: mover, input, delay: wait });
    };
    movers.set(mover, [
        Instance.ConnectOutput(mover, "OnFullyOpen", turn("Close")),
        Instance.ConnectOutput(mover, "OnFullyClosed", turn("Open")),
    ]);
}

/** Drops a mover's connections (and the entry). @param {Entity} mover */
function Disconnect(mover) {
    for (const id of movers.get(mover) ?? []) {
        if (id !== undefined) {
            Instance.DisconnectOutput(id);
        }
    }
    movers.delete(mover);
}

/**
 * Sets up and starts every mover that isn't going yet: on activation, and
 * after a round restart (which may have respawned them). One already
 * running is left alone — an Open would turn it round mid-way.
 */
export function StartMovers() {
    for (const mover of [...movers.keys()]) {
        if (!mover.IsValid()) {
            Disconnect(mover);
        }
    }
    for (const mover of Instance.FindEntitiesByClass(MOVER_CLASS)) {
        const config = ParseMoverName(mover.GetEntityName());
        if (!config || movers.has(mover)) {
            continue;
        }
        Connect(mover, config.wait);
        Instance.EntFireAtTarget({ target: mover, input: "Open" });
        Debug(`StartMovers: ${mover.GetEntityName()} started, wait ${config.wait}s`);
    }
}

/**
 * After a hot reload: the movers carried over from before keep moving, but
 * their connections point at the old script's callbacks — swap them for
 * new ones (no Open, they're already on their way).
 * @param {Map<Entity, (number | undefined)[]> | undefined} previous
 */
export function RestoreMovers(previous) {
    // A copy: `previous` may be `movers` itself, which this loop changes.
    for (const [mover, ids] of [...(previous ?? [])]) {
        movers.set(mover, ids);
        Disconnect(mover);
        const config = mover.IsValid() ? ParseMoverName(mover.GetEntityName()) : undefined;
        if (config) {
            Connect(mover, config.wait);
        }
    }
}
