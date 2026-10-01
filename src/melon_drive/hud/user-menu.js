import { CSInputs } from "cs_script/point_script";
import { IsJumpDebugOn } from "../dev/jump-debug.js";
import { IsPredictionOn } from "../fx/prediction/prediction.js";
import { IsMelonGlowOn } from "../kart/look.js";
import { CanRestartTimeTrial } from "../race/time-trial/time-trial.js";
import { GetSpeedHud, SyncInputCapture } from "./layout.js";

// User menu: press USE anywhere (regardless of race phase) to open a small
// panel with actions/settings that aren't tied to any single map trigger —
// currently "respawn at last checkpoint" and a color picker, with room to
// add more rows later (see "usermenu_*" buttonId handling in hud/inputs.js's
// OnCustomHudClicked). Deliberately independent of kart.locked/breaking so
// it also works as an unstuck button while the melon is frozen.
/** @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {boolean} open */
export function SetUserMenuOpen(slot, kart, open) {
    kart.userMenuOpen = open;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "user_menu", "Hidden", !open);
    if (open) {
        // Refreshed on every open: a layout or script reload in tools mode
        // wipes what was set when the kart spawned.
        UpdateMelonGlowHud(slot, kart);
        UpdatePredictionHud(slot, kart);
        UpdateJumpDebugHud(slot, kart);
    }
    SyncInputCapture(hud, slot, kart);
}

/**
 * The user menu's glow toggle button: its ON/OFF text and highlight.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 */
export function UpdateMelonGlowHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const on = IsMelonGlowOn(kart);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_glow_button", "glow_state", on ? "ON" : "OFF");
    hud.SetHasClassForPlayer(slot, "usermenu_glow_button", "ToggleOn", on);
}

/**
 * The user menu's guide line (prediction line) toggle button: its ON/OFF
 * text and highlight.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 */
export function UpdatePredictionHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const on = IsPredictionOn(kart);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_prediction_button", "prediction_state", on ? "ON" : "OFF");
    hud.SetHasClassForPlayer(slot, "usermenu_prediction_button", "ToggleOn", on);
}

/**
 * The user menu's jump debug toggle button: its ON/OFF text and highlight.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 */
export function UpdateJumpDebugHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const on = IsJumpDebugOn(kart);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_jumpdebug_button", "jumpdebug_state", on ? "ON" : "OFF");
    hud.SetHasClassForPlayer(slot, "usermenu_jumpdebug_button", "ToggleOn", on);
}

/** @param {number} slot @param {import("../core/kart-registry.js").Kart} kart */
export function UpdateUserMenu(slot, kart) {
    if (kart.pawn.WasInputJustPressed(CSInputs.USE)) {
        SetUserMenuOpen(slot, kart, !kart.userMenuOpen);
    }
    if (kart.userMenuOpen) {
        // Every tick while open: the time trial can start or end (finish,
        // a heat, the hub) with the menu up.
        GetSpeedHud()?.SetHasClassForPlayer(slot, "usermenu_restart_row", "Hidden", !CanRestartTimeTrial(kart));
    }
}
