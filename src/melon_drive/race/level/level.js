import { Instance } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { karts } from "../../core/kart-registry.js";
import { ParseSaveData } from "../time-trial/logic.js";
import { SortedStandings } from "../grand-prix/logic.js";
import { PlayerKey } from "../grand-prix/grand-prix.js";
import { SkinsUnlockedBetween } from "../../kart/skin-logic.js";
import { AddXp, GetXpTotals, GrandPrixXp, LevelOf } from "./logic.js";
import { SAVE_DATA_XP_KEY, XP_SAVE_SECONDS, XP_PER_MINUTE_PLAYED, XP_GAIN_HUD_SECONDS } from "../../constants/index.js";

// Leveling: every player's XP, kept per player name in the addon's save data
// like the stats (renaming starts from scratch). Earned where it happens —
// time on the server (UpdateLevel, every tick), time trial finishes and new
// bests (race/time-trial/), heat places (race/heat/race-flow.js), a Grand
// Prix run to its end (GrantGrandPrixXp), PERFECT wall hits
// (movement/wall-bounce/, movement/jump/). A level-up is left on the kart
// (kart.levelUp) for the HUD (hud/level-up-panel.js), every XP gain with a
// reason (all but the time on the server) in kart.xpGain for the XP notifier
// (hud/xp-gain-panel.js). The level unlocks
// skins (kart/skin.js). Rules: race/level/logic.js.

// Read from the save data once, then kept in memory and written back every
// XP_SAVE_SECONDS while something changed (SetSaveData writes the file).
/** @type {import("./logic.js").XpTotals | undefined} */
let totals = undefined;
let dirty = false;
let nextSaveTime = 0;

function Totals() {
    totals ??= GetXpTotals(ParseSaveData(Instance.GetSaveData()));
    return totals;
}

/** @param {import("../../core/kart-registry.js").Kart} kart */
function PlayerName(kart) {
    return kart.pawn?.GetPlayerController()?.GetPlayerName() ?? "";
}

/** This kart's player's XP. @param {import("../../core/kart-registry.js").Kart} kart */
export function GetKartXp(kart) {
    return Totals()[PlayerName(kart)] ?? 0;
}

/** This kart's player's level. @param {import("../../core/kart-registry.js").Kart} kart */
export function GetKartLevel(kart) {
    return LevelOf(GetKartXp(kart));
}

/**
 * Gives a player XP. A level-up (with the skins it unlocks) is left in
 * kart.levelUp for the HUD — added to one that's still waiting. With a
 * reason the XP notifier shows it, added to a gain still showing.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} amount
 * @param {string} [reason] for the console; without one (the time on the server) no notifier
 */
export function GrantXp(kart, amount, reason) {
    const name = PlayerName(kart);
    const xpBefore = Totals()[name] ?? 0;
    const before = LevelOf(xpBefore);
    if (!AddXp(Totals(), name, amount)) {
        return;
    }
    dirty = true;
    const after = LevelOf(Totals()[name]);
    if (reason !== undefined) {
        Debug(`GrantXp: "${name}" +${Math.round(amount)} XP (${reason})`);
        ShowXpGain(kart, xpBefore, amount);
    }
    if (after > before) {
        const skins = SkinsUnlockedBetween(before, after);
        kart.levelUp = { level: after, skins: [...(kart.levelUp?.skins ?? []), ...skins], until: undefined };
        Debug(`GrantXp: "${name}" reached level ${after}${skins.length ? `, unlocked ${skins.join(", ")}` : ""}`);
    }
}

/**
 * Puts an XP gain on the XP notifier (hud/xp-gain-panel.js): added to the one
 * still showing (its bar keeps the fill from before the first), shown
 * XP_GAIN_HUD_SECONDS from now. `toXp` only for a preview (nothing given):
 * otherwise the notifier shows the player's XP as they are.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} fromXp @param {number} amount @param {number} [toXp]
 */
export function ShowXpGain(kart, fromXp, amount, toXp) {
    const now = Instance.GetGameTime();
    const showing = kart.xpGain && now < kart.xpGain.until && kart.xpGain.toXp === undefined && toXp === undefined ? kart.xpGain : undefined;
    kart.xpGain = {
        fromXp: showing?.fromXp ?? fromXp,
        toXp,
        amount: (showing?.amount ?? 0) + amount,
        until: now + XP_GAIN_HUD_SECONDS,
    };
}

/**
 * A Grand Prix ran to its end: XP for everyone still in it (`racers`), by
 * their place in its standings.
 * @param {import("../grand-prix/logic.js").GrandPrix | undefined} gp
 * @param {import("../../core/kart-registry.js").Kart[]} racers
 */
export function GrantGrandPrixXp(gp, racers) {
    if (!gp || gp.cancelled) {
        return;
    }
    const order = SortedStandings(gp).map((standing) => standing.key);
    for (const kart of racers) {
        const place = order.indexOf(PlayerKey(kart)) + 1;
        if (place > 0) {
            GrantXp(kart, GrandPrixXp(place), `Grand Prix, place ${place}`);
        }
    }
}

/** Writes the XP to the save data if anything changed since the last time. */
export function SaveXp() {
    if (!dirty || !totals) {
        return;
    }
    // Re-read so keys other systems keep in the save data survive.
    const data = ParseSaveData(Instance.GetSaveData());
    data[SAVE_DATA_XP_KEY] = totals;
    Instance.SetSaveData(JSON.stringify(data));
    dirty = false;
}

/**
 * Per tick, from core/think.js: XP for time on the server for every player
 * with a melon, and the periodic save.
 * @param {number} now @param {number} dt
 */
export function UpdateLevel(now, dt) {
    for (const kart of karts.values()) {
        GrantXp(kart, (dt / 60) * XP_PER_MINUTE_PLAYED);
    }
    if (now >= nextSaveTime) {
        nextSaveTime = now + XP_SAVE_SECONDS;
        SaveXp();
    }
}
