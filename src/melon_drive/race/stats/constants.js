// Player stats: all-time totals per player, saved to disk, shown as pages of
// the scoreboard (A/D with Tab held). See "Player stats" in GAMEPLAY.md.

// Key of the stats inside the addon's save data (next to the best times,
// SAVE_DATA_BEST_TIMES_KEY).
export const SAVE_DATA_STATS_KEY = "stats";

// The totals are counted in memory and written to the save data at most
// this often (seconds) — SetSaveData writes the file to disk, and time on
// the server and boost time grow every tick. Also written when a player
// disconnects.
export const STATS_SAVE_SECONDS = 30;

// The scoreboard's stat pages, in paging order: `key` in the save data,
// `title` of the page, `column` the value column's header, `format` how the
// value reads ("duration": seconds as 1h 05m / 4m 12s / 37s, "count").
export const STAT_SLIDES = [
    { key: "playTime", title: "LONGEST ON THE SERVER", column: "TIME", format: "duration" },
    { key: "crashes", title: "MOST CRASHES", column: "CRASHES", format: "count" },
    { key: "finishes", title: "MOST FINISHES", column: "FINISHES", format: "count" },
    { key: "boostTime", title: "LONGEST BOOST TIME", column: "BOOST", format: "duration" },
    { key: "perfectHits", title: "MOST PERFECT WALL HITS", column: "PERFECT", format: "count" },
];
