import { Instance } from "cs_script/point_script";
import { GetSpeedHud } from "../layout.js";
import { BoardPlayers } from "../scoreboard/scoreboard.js";
import { GetMelonSkin } from "../../kart/skin.js";
import { GetStatTotals } from "../../race/stats/stats.js";
import { GetKartXp } from "../../race/level/level.js";
import { BuildProfile } from "./logic.js";
import { MELON_SKINS, PROFILE_UPDATE_SECONDS, STAT_SLIDES, XP_BAR_SEGMENTS, HUD_RESEND_SECONDS } from "../../constants/index.js";

const PANEL = "usermenu_profile";

/**
 * The user menu's profile (usermenu_profile in speedometer.xml, top of the
 * right column): the player's own melon big — one image per skin,
 * "usermenu_profile_skin_<key>", all but theirs Hidden —, their name and
 * skin name, their level and XP with a bar ("usermenu_profile_xp_<i>", the
 * filled ones On), and one tile per stat ("usermenu_profile_stat_<key>": value and
 * rank). Rebuilt every PROFILE_UPDATE_SECONDS while the menu shows its
 * columns (UpdateUserMenu), each value sent only when it changes, plus
 * everything again every HUD_RESEND_SECONDS. Rules: hud/profile/logic.js.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart
 */
export function UpdateProfileHud(slot, kart) {
    const now = Instance.GetGameTime();
    if (kart.profileNextUpdate !== undefined && now < kart.profileNextUpdate) {
        return;
    }
    kart.profileNextUpdate = now + PROFILE_UPDATE_SECONDS;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    if (kart.profileResendAt === undefined || now >= kart.profileResendAt) {
        kart.profileResendAt = now + HUD_RESEND_SECONDS;
        kart.profileShown = {};
    }
    const shown = (kart.profileShown ??= {});
    /** @param {string} panel @param {string} name @param {string} value */
    const SetText = (panel, name, value) => {
        const key = `${panel}/${name}`;
        if (shown[key] !== value) {
            shown[key] = value;
            hud.SetDialogVariableStringForPlayer(slot, panel, name, value);
        }
    };
    /** @param {string} panel @param {string} cls @param {boolean} on */
    const SetClass = (panel, cls, on) => {
        const key = `${panel}.${cls}`;
        const value = on ? "1" : "";
        if (shown[key] !== value) {
            shown[key] = value;
            hud.SetHasClassForPlayer(slot, panel, cls, on);
        }
    };

    const skin = GetMelonSkin(kart);
    const { players, self } = BoardPlayers(kart);
    /** @type {Record<string, Record<string, number>>} */
    const statTotals = {};
    for (const slide of STAT_SLIDES) {
        statTotals[slide.key] = GetStatTotals(slide.key);
    }
    const profile = BuildProfile({ self, players, skin, xp: GetKartXp(kart), statTotals });
    for (const key of Object.keys(MELON_SKINS)) {
        SetClass(`usermenu_profile_skin_${key}`, "Hidden", key !== skin);
    }
    SetText(PANEL, "profile_name", profile.name);
    SetText(PANEL, "profile_skin", profile.skin);
    SetText(PANEL, "profile_level", profile.level);
    SetText(PANEL, "profile_xp", profile.xp);
    for (let i = 0; i < XP_BAR_SEGMENTS; i++) {
        SetClass(`usermenu_profile_xp_${i}`, "On", i < profile.xpFill);
    }
    for (const stat of profile.stats) {
        const id = `usermenu_profile_stat_${stat.key}`;
        SetText(id, "value", stat.value);
        SetText(id, "rank", stat.rank);
    }
}

/**
 * Fills the profile in right away, everything sent again — on opening the
 * menu and after picking a skin.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart
 */
export function RefreshProfileHud(slot, kart) {
    kart.profileNextUpdate = undefined;
    kart.profileResendAt = undefined;
    UpdateProfileHud(slot, kart);
}
