import { GetSpeedHud } from "./layout.js";
import { LevelUpText } from "../race/level/logic.js";
import { LEVEL_UP_HUD_SECONDS, HUD_RESEND_SECONDS } from "../constants/index.js";

/**
 * The level-up message (levelup_panel in speedometer.xml, top center): "LEVEL
 * UP", the new level and the skins it unlocked (levelup_skins, hidden
 * without), for LEVEL_UP_HUD_SECONDS after GrantXp left one in
 * kart.levelUp. Not in the middle of a heat — a racer gets it once
 * they've finished (or left it). Sent on change, and again every
 * HUD_RESEND_SECONDS.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {number} now
 */
export function UpdateLevelUpHud(slot, kart, now) {
    const levelUp = kart.levelUp;
    if (levelUp && levelUp.until === undefined && !(kart.racing && !kart.finished)) {
        levelUp.until = now + LEVEL_UP_HUD_SECONDS;
    }
    if (levelUp?.until !== undefined && now >= levelUp.until) {
        kart.levelUp = undefined;
    }
    const showing = kart.levelUp?.until !== undefined ? kart.levelUp : undefined;
    const text = showing ? LevelUpText(showing) : undefined;
    const key = text ? `${text.level}|${text.skins}` : "";
    if (key === kart.levelUpShown && now < (kart.levelUpResendAt ?? 0)) {
        return;
    }
    kart.levelUpShown = key;
    kart.levelUpResendAt = now + HUD_RESEND_SECONDS;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    if (text) {
        hud.SetDialogVariableStringForPlayer(slot, "levelup_panel", "levelup_level", text.level);
        hud.SetDialogVariableStringForPlayer(slot, "levelup_panel", "levelup_skins", text.skins);
    }
    hud.SetHasClassForPlayer(slot, "levelup_skins", "Hidden", !text?.skins);
    hud.SetHasClassForPlayer(slot, "levelup_panel", "Hidden", !text);
}
