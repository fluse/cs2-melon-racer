import { CSInputs } from "cs_script/point_script";
import { IsCollisionDebugOn } from "../dev/collision-debug.js";
import { IsFreeLookOn } from "../dev/free-look.js";
import { IsPredictionOn } from "../fx/prediction/prediction.js";
import { IsMelonGlowOn } from "../kart/look.js";
import { RestartTimeTrial } from "../race/checkpoints/checkpoints.js";
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
        UpdateCollisionDebugHud(slot, kart);
        UpdateFreeLookHud(slot, kart);
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
 * The user menu's collision debug toggle button: its ON/OFF text and highlight.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 */
export function UpdateCollisionDebugHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const on = IsCollisionDebugOn(kart);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_collisiondebug_button", "collisiondebug_state", on ? "ON" : "OFF");
    hud.SetHasClassForPlayer(slot, "usermenu_collisiondebug_button", "ToggleOn", on);
}

/**
 * The user menu's free look toggle button: its ON/OFF text and highlight.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 */
export function UpdateFreeLookHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const on = IsFreeLookOn(kart);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_freelook_button", "freelook_state", on ? "ON" : "OFF");
    hud.SetHasClassForPlayer(slot, "usermenu_freelook_button", "ToggleOn", on);
}

/** @param {number} slot @param {import("../core/kart-registry.js").Kart} kart */
export function UpdateUserMenu(slot, kart) {
    if (kart.pawn.WasInputJustPressed(CSInputs.USE)) {
        SetUserMenuOpen(slot, kart, !kart.userMenuOpen);
    }
    // Shortcut for the menu's "Restart Time Trial" button: reload (R), menu
    // open or not, so a bad start costs one key instead of USE + a click.
    // Pressed outside a time trial it does nothing.
    if (kart.pawn.WasInputJustPressed(CSInputs.RELOAD) && CanRestartTimeTrial(kart) && RestartTimeTrial(kart)) {
        if (kart.userMenuOpen) {
            SetUserMenuOpen(slot, kart, false);
        }
    }
    if (kart.userMenuOpen) {
        // Every tick while open: the time trial can start or end (finish,
        // a heat, the hub) with the menu up.
        GetSpeedHud()?.SetHasClassForPlayer(slot, "usermenu_restart_row", "Hidden", !CanRestartTimeTrial(kart));
    }
}
