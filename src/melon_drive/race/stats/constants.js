// Player stats: all-time totals per player, saved to disk, shown as tabs of
// the user menu's leaderboards page and in its profile. See "Player stats"
// in GAMEPLAY.md.

// Key of the stats inside the addon's save data (next to the best times,
// SAVE_DATA_BEST_TIMES_KEY).
export const SAVE_DATA_STATS_KEY = "stats";

// The totals are counted in memory and written to the save data at most
// this often (seconds) — SetSaveData writes the file to disk, and time on
// the server and boost time grow every tick. Also written when a player
// disconnects.
export const STATS_SAVE_SECONDS = 30;

// The stats, in the order the leaderboards and the profile show them: `key`
// in the save data, `title` of the leaderboard, `column` the value column's header, `format` how the
// value reads ("duration": seconds as 1h 05m / 4m 12s / 37s, "count"); `tab` its button on the
// leaderboards page and `label` its tile in the profile — both built into the HUD layout
// (src/panorama/melon_racer/), so a new stat needs nothing more there.
export const STAT_SLIDES = [
    { key: "playTime", title: "LONGEST ON THE SERVER", column: "TIME", format: "duration", tab: "Time on Server", label: "PLAY TIME" },
    { key: "crashes", title: "MOST CRASHES", column: "CRASHES", format: "count", tab: "Most Crashes", label: "CRASHES" },
    { key: "finishes", title: "MOST FINISHES", column: "FINISHES", format: "count", tab: "Most Finishes", label: "FINISHES" },
    { key: "boostTime", title: "LONGEST BOOST TIME", column: "BOOST", format: "duration", tab: "Boost Time", label: "BOOST TIME" },
    { key: "perfectHits", title: "MOST PERFECT WALL HITS", column: "PERFECT", format: "count", tab: "Most Perfect Hits", label: "PERFECT HITS" },
    { key: "trialRestarts", title: "MOST TRIAL RESTARTS", column: "RESTARTS", format: "count", tab: "Most Trial Restarts", label: "RESTARTS" },
];
