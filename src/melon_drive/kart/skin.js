import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { ParseSaveData } from "../race/time-trial/logic.js";
import { MELON_SKINS } from "../constants/index.js";
import { PlayerName } from "./join-spot.js";
import { IsSkin, SavedSkin, WithSkin } from "./skin-logic.js";

// The melon's skin: each player picks one in the user menu (the MELON
// group's skin row), kept per player name in the addon's save data like
// "Start in Tutorial" (kart/join-spot.js). A skin is a whole model
// (MELON_SKINS), put on the melon by ApplyMelonSkin — called from
// ShowMelonPaint (kart/look.js), so every spawn and respawn gets it. Paint
// still sets the melon's color, but the skins don't take it (their material
// ignores the tint); the outline glow shows it either way.

/** @typedef {import("../core/kart-registry.js").Kart} Kart */

/** This kart's skin: picked this session, else saved for its player. @param {Kart} kart */
export function GetMelonSkin(kart) {
    if (kart.skin === undefined) {
        kart.skin = SavedSkin(ParseSaveData(Instance.GetSaveData()), PlayerName(kart));
    }
    return kart.skin;
}

/** Puts this kart's skin model on its melon, if it doesn't have it already. @param {Kart} kart */
export function ApplyMelonSkin(kart) {
    const model = MELON_SKINS[GetMelonSkin(kart)];
    if (kart.melon.IsValid() && kart.melon.GetModelName() !== model) {
        kart.melon.SetModel(model);
    }
}

/**
 * Picks this kart's skin and saves it for its player. Returns whether it's
 * a skin (MELON_SKINS) — the caller shows the melon again (ShowMelonPaint).
 * @param {Kart} kart @param {string} skin
 */
export function SetMelonSkin(kart, skin) {
    if (!IsSkin(skin)) {
        return false;
    }
    kart.skin = skin;
    // Re-read so the best times and everyone else's settings survive.
    Instance.SetSaveData(JSON.stringify(WithSkin(ParseSaveData(Instance.GetSaveData()), PlayerName(kart), skin)));
    Debug(`SetMelonSkin: "${PlayerName(kart)}" drives the ${skin} skin`);
    return true;
}
