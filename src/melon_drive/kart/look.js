// How a kart's melon looks while it's whole: its skin (kart/skin.js), its
// paint color (paint triggers) and an outline glow — in the glow color the
// player picked in the user menu (its color swatches, saved per player
// name), else in the paint color, green (MELON_GLOW_UNPAINTED_COLOR) until
// it's first painted (kart.painted); rules in kart/look-logic.js. Each
// player can switch the glow off for their own melon ("Glow",
// kart.melonGlow). Every path that shows the melon (spawn, respawn
// after a break, repaint, a new skin) goes through ShowMelonPaint;
// a break turns the glow off with HideMelonGlow — the melon is hidden then,
// and an outline of it floating at the crash site would give that away.
import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { ParseSaveData } from "../race/time-trial/logic.js";
import { MELON_GLOW_ENABLED } from "../constants/index.js";
import { ApplyMelonSkin } from "./skin.js";
import { PlayerName } from "./join-spot.js";
import { IsGlowColor, MelonGlowColor, SavedGlowColor, WithGlowColor } from "./look-logic.js";

/** @param {import("../core/kart-registry.js").Kart} kart */
export function ShowMelonPaint(kart) {
    ApplyMelonSkin(kart); // first: a new model could drop the color and glow set before
    kart.melon.SetColor(kart.paintColor);
    if (IsMelonGlowOn(kart)) {
        kart.melon.Glow(MelonGlowColor(GetMelonGlowColor(kart), kart.painted, kart.paintColor));
    } else {
        kart.melon.Unglow();
    }
}

/**
 * Whether this kart's melon glows: on by default, unless its player switched
 * it off in the user menu (see USER_MENU_TOGGLES in hud/user-menu.js).
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
 * This kart's glow color (a COLOR_PRESETS key; undefined: none picked, the
 * glow follows the paint): picked this session, else saved for its player.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function GetMelonGlowColor(kart) {
    if (kart.glowColor === undefined) {
        kart.glowColor = SavedGlowColor(ParseSaveData(Instance.GetSaveData()), PlayerName(kart)) ?? null;
    }
    return kart.glowColor ?? undefined;
}

/**
 * The user menu's color swatches: this kart's melon glows in that color
 * from now on (the paint stays), the glow switched on if it was off — saved
 * for its player. Returns whether `key` is one of COLOR_PRESETS.
 * @param {import("../core/kart-registry.js").Kart} kart @param {string} key
 */
export function SetMelonGlowColor(kart, key) {
    if (!IsGlowColor(key)) {
        return false;
    }
    kart.glowColor = key;
    kart.melonGlow = true;
    // Re-read so the best times and everyone else's settings survive.
    Instance.SetSaveData(JSON.stringify(WithGlowColor(ParseSaveData(Instance.GetSaveData()), PlayerName(kart), key)));
    Debug(`SetMelonGlowColor: "${PlayerName(kart)}" glows ${key}`);
    if (!kart.breaking) {
        ShowMelonPaint(kart); // a broken melon gets it back on respawn
    }
    return true;
}

/**
 * Sets a kart's melon color and remembers it so it survives a break/respawn
 * (BreakMelon hides the melon entirely while broken, without losing track of
 * the color underneath — see ScheduleRespawnAfterBreak). Used by the
 * melon_paint map trigger; the user menu's swatches set the glow instead
 * (SetMelonGlowColor).
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
