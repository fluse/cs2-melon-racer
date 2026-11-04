import { GetSpeedHud } from "./layout.js";
import { XpGainView } from "../race/level/logic.js";
import { GetKartXp } from "../race/level/level.js";
import { XP_BAR_SEGMENTS, HUD_RESEND_SECONDS } from "../constants/index.js";

/**
 * The XP notifier (xpgain_panel in melon_racer.xml, top right): for
 * XP_GAIN_HUD_SECONDS after XP were earned (kart.xpGain, see ShowXpGain) the
 * XP gained ("+40 XP") and why ("TIME TRIAL FINISH · NEW BEST TIME"), the
 * level and the XP into it, and the bar — the fill from before green
 * (xpgain_old_<i>), the part just gained gold (xpgain_new_<i>). Also mid-heat. Sent on change, and again every
 * HUD_RESEND_SECONDS.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {number} now
 */
export function UpdateXpGainHud(slot, kart, now) {
    if (kart.xpGain && now >= kart.xpGain.until) {
        kart.xpGain = undefined;
    }
    const gain = kart.xpGain;
    const view = gain ? XpGainView(gain.fromXp, gain.toXp ?? GetKartXp(kart), gain.amount, XP_BAR_SEGMENTS, gain.reasons) : undefined;
    const key = view ? `${view.amount}|${view.reason}|${view.level}|${view.xp}|${view.oldFill}|${view.newFill}` : "";
    if (key === kart.xpGainShown && now < (kart.xpGainResendAt ?? 0)) {
        return;
    }
    kart.xpGainShown = key;
    kart.xpGainResendAt = now + HUD_RESEND_SECONDS;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    if (view) {
        hud.SetDialogVariableStringForPlayer(slot, "xpgain_panel", "xpgain_amount", view.amount);
        hud.SetDialogVariableStringForPlayer(slot, "xpgain_panel", "xpgain_reason", view.reason);
        hud.SetDialogVariableStringForPlayer(slot, "xpgain_panel", "xpgain_level", view.level);
        hud.SetDialogVariableStringForPlayer(slot, "xpgain_panel", "xpgain_xp", view.xp);
        for (let i = 0; i < XP_BAR_SEGMENTS; i++) {
            hud.SetHasClassForPlayer(slot, `xpgain_old_${i}`, "On", i < view.oldFill);
            hud.SetHasClassForPlayer(slot, `xpgain_new_${i}`, "On", i >= view.oldFill && i < view.newFill);
        }
    }
    hud.SetHasClassForPlayer(slot, "xpgain_panel", "Hidden", !view);
}
