import { Instance } from "cs_script/point_script";

// Toggle to false once driving works to quiet the console back down.
export const DEBUG = true;

/** @param {string} text */
export function Debug(text) {
    if (DEBUG) {
        Instance.Msg(`[melon_drive] ${text}`);
    }
}
