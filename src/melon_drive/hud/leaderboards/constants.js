// Leaderboards page of the user menu (ACTIONS → "Leaderboards", see
// hud/leaderboards/leaderboards.js): one leaderboard at a time, picked by a
// button in a column like ACTIONS.

// The tab with the best times on one track (◀ ▶ page through the tracks);
// every other tab is a STAT_SLIDES key. Buttons "lb_tab_<tab>" in
// melon_racer.xml, built from STAT_SLIDES (src/panorama/melon_racer/user-menu/page-leaderboards.xml)
// (test/hud/leaderboards.test.mjs checks every tab has its button).
export const LEADERBOARD_TIMES_TAB = "times";
// Player rows, "lb_row_0" .. "lb_row_{N-1}" in melon_racer.xml, one under
// the other; with more players the viewer's own row takes the last one.
export const LEADERBOARD_ROWS = 20;
// How often the open page is rebuilt (seconds): time on the server grows
// every tick, but nobody needs it to the tick.
export const LEADERBOARD_UPDATE_SECONDS = 0.5;
