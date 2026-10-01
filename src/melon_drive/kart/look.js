// How a kart's melon looks while it's whole: its paint color plus an outline
// glow in that same color — green (MELON_GLOW_UNPAINTED_COLOR) until it's
// first painted (kart.painted) — which each player can switch
// off for their own melon in the user menu ("GLOW", kart.melonGlow). Every path that shows the
// melon (spawn, respawn after a break, repaint) goes through ShowMelonPaint;
// a break turns the glow off with HideMelonGlow — the melon is hidden then,
// and an outline of it floating at the crash site would give that away.
import { MELON_GLOW_ENABLED, MELON_GLOW_UNPAINTED_COLOR } from "../constants/index.js";

/** @param {import("../core/kart-registry.js").Kart} kart */
export function ShowMelonPaint(kart) {
    kart.melon.SetColor(kart.paintColor);
    if (IsMelonGlowOn(kart)) {
        kart.melon.Glow(kart.painted ? kart.paintColor : MELON_GLOW_UNPAINTED_COLOR);
    } else {
        kart.melon.Unglow();
    }
}

/**
 * Whether this kart's melon glows: on by default, unless its player switched
 * it off in the user menu (see UpdateMelonGlowHud in hud/).
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function IsMelonGlowOn(kart) {
    return MELON_GLOW_ENABLED && kart.melonGlow !== false;
}

/** Switches the glow on/off for this kart's melon. @param {import("../core/kart-registry.js").Kart} kart @param {boolean} on */
export function SetMelonGlow(kart, on) {
    kart.melonGlow = on;
    if (!kart.breaking) {
        ShowMelonPaint(kart); // a broken melon gets it back on respawn
    }
}

/**
 * Sets a kart's melon color and remembers it so it survives a break/respawn
 * (BreakMelon hides the melon entirely while broken, without losing track of
 * the color underneath — see ScheduleRespawnAfterBreak). Used by both the
 * melon_paint map trigger and the user menu's color swatches.
 * @param {import("../core/kart-registry.js").Kart} kart @param {{ r: number, g: number, b: number, a: number }} color
 */
export function SetKartPaintColor(kart, color) {
    kart.paintColor = color;
    kart.painted = true; // its glow takes this color from now on, see ShowMelonPaint
    if (!kart.breaking) {
        ShowMelonPaint(kart);
    }
}

/** @param {import("../core/kart-registry.js").Kart} kart */
export function HideMelonGlow(kart) {
    if (kart.melon.IsValid()) {
        kart.melon.Unglow();
    }
}
