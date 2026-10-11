// Pure rules of the user menu's profile (hud/profile/profile.js): the
// player's name, skin, level and XP, and every stat (STAT_SLIDES) with their rank, as
// ready-to-send strings. Values and ranks come from the scoreboard's rules,
// so they read the same as on the leaderboards. No cs_script import
// (test/hud/profile.test.mjs).
import { BuildStatBoard } from "../scoreboard/logic.js";
import { FormatStat } from "../../race/stats/logic.js";
import { LevelProgress, XpBarFill } from "../../race/level/logic.js";
import { MELON_SKIN_DEFAULT, MELON_SKIN_NAMES, STAT_SLIDES, XP_BAR_SEGMENTS } from "../../constants/index.js";

/**
 * @typedef {{ key: string, value: string, rank: string }} ProfileStat
 * @typedef {{ name: string, skin: string, level: string, xp: string, xpFill: number, stats: ProfileStat[] }} Profile
 */

/**
 * The profile one player sees of themselves. A stat's rank ("#3") is among
 * everyone with a total — saved ones of players who aren't on the map
 * included —, ties sharing one; empty while their total is still 0. The
 * level with the XP into it ("340 / 525 XP") and how many of the XP bar's
 * XP_BAR_SEGMENTS are filled.
 * @param {{
 *   self: { key: string, name: string },
 *   players: { key: string, name: string }[], // everyone on the map now
 *   skin: string, // a MELON_SKINS key
 *   xp: number, // the player's XP (race/level/)
 *   statTotals: Record<string, Record<string, number>>, // per STAT_SLIDES key, every player's total by name
 * }} input
 * @returns {Profile}
 */
export function BuildProfile({ self, players, skin, xp, statTotals }) {
    const progress = LevelProgress(xp);
    return {
        name: self.name,
        skin: (MELON_SKIN_NAMES[skin] ?? MELON_SKIN_NAMES[MELON_SKIN_DEFAULT]).toUpperCase(),
        level: `LV ${progress.level}`,
        xp: `${Math.floor(progress.into)} / ${progress.needed} XP`,
        xpFill: XpBarFill(progress, XP_BAR_SEGMENTS),
        stats: STAT_SLIDES.map((slide) => {
            const totals = statTotals[slide.key] ?? {};
            const board = BuildStatBoard({ slide, totals, players, self, maxRows: Infinity });
            const row = board.rows.find((r) => r.self);
            return {
                key: slide.key,
                value: FormatStat(slide, totals[self.name] ?? 0),
                rank: row && (totals[self.name] ?? 0) > 0 ? `#${row.rank}` : "",
            };
        }),
    };
}
