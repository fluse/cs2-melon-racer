// Draws a tuning page's scale on the HUD (the rules are in
// tuning-scale-logic.js): every segment `<idPrefix>seg_<i>` gets "On" up to
// the value.
import { ScaleSegmentCount, IsScaleSegmentLit } from "./tuning-scale-logic.js";

/**
 * @param {any} hud the custom_hud_layout @param {number} slot
 * @param {string} idPrefix e.g. "camtune_height_" @param {import("./tuning-scale-logic.js").TuningScale} scale @param {number} value
 */
export function UpdateTuningScaleHud(hud, slot, idPrefix, scale, value) {
    for (let i = 0; i < ScaleSegmentCount(scale); i++) {
        hud.SetHasClassForPlayer(slot, `${idPrefix}seg_${i}`, "On", IsScaleSegmentLit(scale, i, value));
    }
}
