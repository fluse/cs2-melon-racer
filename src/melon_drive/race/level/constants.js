// Leveling: XP for racing, a level from the XP, skins unlocked by level
// (MELON_SKIN_LEVELS in kart/constants.js). See "Leveling" in GAMEPLAY.md.

// Key of every player's XP inside the addon's save data (next to the best
// times and the stats): { [playerName]: xp }.
export const SAVE_DATA_XP_KEY = "xp";

// The XP are kept in memory and written to the save data at most this often
// (seconds) while something changed — time on the server earns XP every
// tick. Also written when a player disconnects.
export const XP_SAVE_SECONDS = 30;

// --- What earns XP. A Grand Prix earns clearly more than time trials. ---

// Every minute with a melon on the map (spread over the ticks).
export const XP_PER_MINUTE_PLAYED = 1;
// A time trial's finish of the last lap (outside a heat).
export const XP_TIME_TRIAL_FINISH = 15;
// A new best time on a track (time trial or heat), on top of the finish.
export const XP_NEW_BEST = 25;
// A wall bounce or wall jump rated PERFECT.
export const XP_PERFECT_HIT = 3;
// Finishing a heat of a Grand Prix, plus a bonus for 1st, 2nd, 3rd.
export const XP_HEAT_FINISH = 40;
export const XP_HEAT_PLACE_BONUS = [40, 25, 15];
// A Grand Prix run to its end (not cancelled), for everyone still in it —
// plus a bonus for 1st, 2nd, 3rd overall.
export const XP_GRAND_PRIX_FINISH = 50;
export const XP_GRAND_PRIX_PLACE_BONUS = [150, 100, 75];

// --- Levels: from level L to L+1 takes LEVEL_XP_BASE + LEVEL_XP_STEP * (L - 1)
// XP — 150, 225, 300, … : level 3 in about half an hour, level 25 (the last
// skin) after some 20–30 hours of racing. ---
export const LEVEL_XP_BASE = 150;
export const LEVEL_XP_STEP = 75;

// The level-up message (LEVEL UP · new skins) shows this long (seconds) —
// not in the middle of a heat: a racer sees it once they've finished.
export const LEVEL_UP_HUD_SECONDS = 5;
// The XP notifier (top right: "+40 XP", the level, the bar with the part just
// gained) shows this long (seconds) after XP were earned — more XP within it
// add up and show it this long again. Not for the XP every minute on the
// server (that would never go away). Also mid-heat.
export const XP_GAIN_HUD_SECONDS = 3.5;
// XP the user menu's "Test XP Gain" pretends to give (a new best's) — only
// shown, not given.
export const XP_GAIN_TEST_AMOUNT = 25;
// Segments of the profile's XP bar (usermenu_profile_xp_<i> in speedometer.xml)
// and of the XP notifier's (xpgain_old_<i>/xpgain_new_<i>).
export const XP_BAR_SEGMENTS = 20;

// Console command (sv_cheats 1 only) giving every player on the map XP for
// testing: `melon_give_xp 500`.
export const XP_CHEAT_COMMAND = "melon_give_xp";
