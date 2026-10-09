import { CSInputs } from "cs_script/point_script";
import { IsCollisionDebugOn } from "../dev/collision-debug.js";
import { IsFreeLookOn } from "../dev/free-look.js";
import { UpdateCameraTuningHud } from "../dev/camera-tuning.js";
import { UpdatePhysicsTuningHud } from "../dev/physics-tuning.js";
import { IsPredictionOn } from "../fx/prediction/prediction.js";
import { IsMelonGlowOn } from "../kart/look.js";
import { IsStartInTutorialOn } from "../kart/join-spot.js";
import { RestartTimeTrial } from "../race/checkpoints/checkpoints.js";
import { CanRestartTimeTrial } from "../race/time-trial/time-trial.js";
import { GetSpeedHud, SyncInputCapture } from "./layout.js";

// User menu: press USE anywhere (regardless of race phase) to open a small
// panel with actions/settings that aren't tied to any single map trigger
// (see the button tables in hud/inputs.js's OnCustomHudClicked).
// Deliberately independent of kart.locked/breaking so it also works as an
// unstuck button while the melon is frozen.

/**
 * The ON/OFF settings: per button, the dialog variable its pill shows and
 * whether it's on for a kart. One row each in speedometer.xml; clicking one
 * is in hud/inputs.js (USER_MENU_TOGGLE_CLICKS).
 * @type {Record<string, { variable: string, isOn: (kart: import("../core/kart-registry.js").Kart) => boolean }>}
 */
export const USER_MENU_TOGGLES = {
    // Outline glow around the player's own melon (kart/look.js).
    usermenu_glow_button: { variable: "glow_state", isOn: IsMelonGlowOn },
    // Where the melon appears on joining: tutorial or hub (kart/join-spot.js).
    usermenu_jointutorial_button: { variable: "jointutorial_state", isOn: IsStartInTutorialOn },
    // The wall-bounce guide line (fx/prediction/).
    usermenu_prediction_button: { variable: "prediction_state", isOn: IsPredictionOn },
    // The collision debug view (dev/collision-debug.js).
    usermenu_collisiondebug_button: { variable: "collisiondebug_state", isOn: IsCollisionDebugOn },
    // Free look (dev/free-look.js).
    usermenu_freelook_button: { variable: "freelook_state", isOn: IsFreeLookOn },
};

/**
 * The developer pages the menu can show in place of its columns: per page,
 * its panel in speedometer.xml and what to refresh when it opens.
 * @typedef {"camera" | "physics" | "triggers"} UserMenuPage
 * @type {Record<UserMenuPage, { panel: string, refresh?: (slot: number, kart: import("../core/kart-registry.js").Kart) => void }>}
 */
export const USER_MENU_PAGES = {
    camera: { panel: "usermenu_camera_page", refresh: UpdateCameraTuningHud }, // dev/camera-tuning.js
    physics: { panel: "usermenu_physics_page", refresh: UpdatePhysicsTuningHud }, // dev/physics-tuning.js
    triggers: { panel: "usermenu_triggers_page" }, // Test Podium/Countdown/…, clicks in hud/inputs.js
};

/** @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {boolean} open */
export function SetUserMenuOpen(slot, kart, open) {
    kart.userMenuOpen = open;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "user_menu", "Hidden", !open);
    // Always (re)opens on its columns, not on one of its developer pages.
    SetUserMenuPage(slot, kart, undefined);
    if (open) {
        // Refreshed on every open: a layout or script reload in tools mode
        // wipes what was set when the kart spawned.
        for (const buttonId of Object.keys(USER_MENU_TOGGLES)) {
            UpdateToggleHud(slot, kart, buttonId);
        }
        UpdateHubButtonHud(slot, kart);
    }
    SyncInputCapture(hud, slot, kart);
}

/**
 * Shows one developer page in place of the menu's columns, or (undefined)
 * the columns again. Every page panel is set, so whichever was open closes.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {UserMenuPage | undefined} page
 */
export function SetUserMenuPage(slot, kart, page) {
    kart.userMenuPage = page;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "usermenu_main_page", "Hidden", page !== undefined);
    for (const [name, { panel }] of Object.entries(USER_MENU_PAGES)) {
        hud.SetHasClassForPlayer(slot, panel, "Hidden", name !== page);
    }
    if (page) {
        USER_MENU_PAGES[page].refresh?.(slot, kart);
    }
}

/**
 * The hub button's label: "Exit Race" while the player is signed up for a
 * heat (kart.racing — the button takes just them out of it, see
 * usermenu_hub_button in hud/inputs.js), else "Return to Hub".
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 */
export function UpdateHubButtonHud(slot, kart) {
    GetSpeedHud()?.SetDialogVariableStringForPlayer(slot, "usermenu_hub_button", "hub_label", kart.racing ? "Exit Race" : "Return to Hub");
}

/**
 * One ON/OFF setting's button (USER_MENU_TOGGLES): its pill text and the
 * ToggleOn highlight.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {string} buttonId
 */
export function UpdateToggleHud(slot, kart, buttonId) {
    const hud = GetSpeedHud();
    const toggle = USER_MENU_TOGGLES[buttonId];
    if (!hud || !toggle) {
        return;
    }
    const on = toggle.isOn(kart);
    hud.SetDialogVariableStringForPlayer(slot, buttonId, toggle.variable, on ? "ON" : "OFF");
    hud.SetHasClassForPlayer(slot, buttonId, "ToggleOn", on);
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
        // a heat, the hub) with the menu up, and so can the player's heat.
        GetSpeedHud()?.SetHasClassForPlayer(slot, "usermenu_restart_row", "Hidden", !CanRestartTimeTrial(kart));
        UpdateHubButtonHud(slot, kart);
    }
}
