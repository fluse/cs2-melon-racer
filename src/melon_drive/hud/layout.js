// The one custom_hud_layout entity every HUD panel lives in (speedometer.xml),
// plus the per-player input capture the modals share.
import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { SPEED_HUD_ENTITY_NAME } from "../constants/index.js";

/** @type {any} */
let speedHud = null;
export function GetSpeedHud() {
    if (!speedHud || !speedHud.IsValid()) {
        speedHud = Instance.FindEntityByName(SPEED_HUD_ENTITY_NAME);
        if (!speedHud) {
            Debug(`GetSpeedHud: no entity named "${SPEED_HUD_ENTITY_NAME}" found — add a custom_hud_layout in Hammer`);
        }
    }
    return speedHud;
}

/**
 * The layout has a single input-capture flag per player, but two independent
 * modals want it (hub_modal while standing in the hub, user_menu via USE
 * anywhere) and can be open at the same time. Derived from both instead of
 * each modal blindly setting it — otherwise closing either one (e.g. the
 * user menu while standing in the hub, or leaving the hub with the user menu
 * open) left the other one on screen without a mouse to click it with.
 * @param {any} hud @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 */
export function SyncInputCapture(hud, slot, kart) {
    hud.SetInputCaptureEnabled(slot, Boolean(kart.hubModalOpen || kart.userMenuOpen));
}

/**
 * Clears everything the HUD holds for a player slot — every per-player class
 * and dialog variable, and input capture — when its player leaves. The layout
 * keeps them per slot, not per player, so whoever joins next in that slot
 * would otherwise start with the old player's open menu, finish image or
 * moderator button, and in cursor mode until their own kart's HUD caught up.
 * @param {number} slot
 */
export function ResetHudForPlayer(slot) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetInputCaptureEnabled(slot, false);
    hud.ResetForPlayer(slot);
}
