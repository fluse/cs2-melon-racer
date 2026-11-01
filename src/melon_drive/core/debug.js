import { Console } from "cs_script/point_script";

// Toggle to false once driving works to quiet the console back down.
export const DEBUG = false;
// (The jump/contact debug view is separate — toggled per player from the
// user menu, see dev/collision-debug.js.)

/** @param {string} text */
export function Debug(text) {
    if (DEBUG) {
        Console.Log(`[melon_drive] ${text}`);
    }
}

/**
 * An error the tick loop caught and carried on after — logged whatever DEBUG
 * says: on a server it's the only trace of what went wrong.
 * @param {string} text @param {unknown} err
 */
export function LogError(text, err) {
    Console.Log(`[melon_drive] ERROR ${text}: ${err instanceof Error ? err.stack ?? err.message : err}`);
}
