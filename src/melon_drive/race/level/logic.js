// Pure rules of the leveling (race/level/level.js): the XP in the save data,
// the level and progress they make, what a heat or a Grand Prix earns, and
// the level-up message. No cs_script import (test/race/level.test.mjs).
import {
    SAVE_DATA_XP_KEY,
    LEVEL_XP_BASE,
    LEVEL_XP_STEP,
    XP_HEAT_FINISH,
    XP_HEAT_PLACE_BONUS,
    XP_GRAND_PRIX_FINISH,
    XP_GRAND_PRIX_PLACE_BONUS,
    MELON_SKIN_NAMES,
} from "../../constants/index.js";

/** @typedef {Record<string, number>} XpTotals every player's XP by name */

/**
 * The XP in parsed save data — anything that isn't a non-negative number is
 * dropped.
 * @param {Record<string, unknown>} saveData @returns {XpTotals}
 */
export function GetXpTotals(saveData) {
    const raw = saveData[SAVE_DATA_XP_KEY];
    /** @type {XpTotals} */
    const totals = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return totals;
    }
    for (const [name, xp] of Object.entries(raw)) {
        if (typeof xp === "number" && Number.isFinite(xp) && xp >= 0) {
            totals[name] = xp;
        }
    }
    return totals;
}

/**
 * Adds `amount` XP to a player, in place. Ignores an empty name and anything
 * that isn't a positive amount.
 * @param {XpTotals} totals @param {string} name @param {number} amount
 * @returns {boolean} whether anything changed
 */
export function AddXp(totals, name, amount) {
    if (name === "" || !(amount > 0)) {
        return false;
    }
    totals[name] = (totals[name] ?? 0) + amount;
    return true;
}

/** XP it takes from `level` to the next one. @param {number} level */
export function XpToNextLevel(level) {
    return LEVEL_XP_BASE + LEVEL_XP_STEP * (level - 1);
}

/**
 * Where `xp` XP stand: the level (from 1), the XP into it and the XP the
 * next level needs.
 * @param {number} xp
 */
export function LevelProgress(xp) {
    let level = 1;
    let rest = Math.max(xp, 0);
    while (rest >= XpToNextLevel(level)) {
        rest -= XpToNextLevel(level);
        level++;
    }
    return { level, into: rest, needed: XpToNextLevel(level) };
}

/** The level `xp` XP make. @param {number} xp */
export function LevelOf(xp) {
    return LevelProgress(xp).level;
}

/** XP for finishing a heat in `place` (1 = first). @param {number} place */
export function HeatFinishXp(place) {
    return XP_HEAT_FINISH + (XP_HEAT_PLACE_BONUS[place - 1] ?? 0);
}

/** XP for a Grand Prix run to its end, at `place` in its standings (1 = winner). @param {number} place */
export function GrandPrixXp(place) {
    return XP_GRAND_PRIX_FINISH + (XP_GRAND_PRIX_PLACE_BONUS[place - 1] ?? 0);
}

/**
 * How many of `segments` of an XP bar are filled.
 * @param {{ into: number, needed: number }} progress @param {number} segments
 */
export function XpBarFill(progress, segments) {
    return Math.min(segments, Math.floor((progress.into / progress.needed) * segments));
}

/**
 * The XP notifier: what was gained ("+40 XP"), the level now ("LV 7"), the XP
 * into it ("340 / 525 XP"), and the bar — the segments filled before the
 * gain (oldFill; none if the gain reached a new level) and after it
 * (newFill), so the part just gained can be lit apart.
 * @param {number} fromXp the player's XP before @param {number} toXp …and now
 * @param {number} amount XP gained @param {number} segments
 */
export function XpGainView(fromXp, toXp, amount, segments) {
    const from = LevelProgress(fromXp);
    const to = LevelProgress(toXp);
    return {
        amount: `+${Math.max(1, Math.round(amount))} XP`,
        level: `LV ${to.level}`,
        xp: `${Math.floor(to.into)} / ${to.needed} XP`,
        oldFill: from.level === to.level ? XpBarFill(from, segments) : 0,
        newFill: XpBarFill(to, segments),
    };
}

/**
 * The level-up message: "LEVEL 8", and the skins it unlocked, "NEW SKIN:
 * CAMO" / "NEW SKINS: CAMO, FOOTBALL" (empty without).
 * @param {{ level: number, skins: string[] }} levelUp
 */
export function LevelUpText({ level, skins }) {
    const names = skins.map((skin) => (MELON_SKIN_NAMES[skin] ?? skin).toUpperCase());
    return {
        level: `LEVEL ${level}`,
        skins: names.length === 0 ? "" : `${names.length === 1 ? "NEW SKIN" : "NEW SKINS"}: ${names.join(", ")}`,
    };
}
