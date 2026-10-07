// Scoreboard (shown while Tab is held, in place of CS2's own — see
// hud/scoreboard/scoreboard.js).

// This many player rows, "score_row_0" .. "score_row_{N-1}" in
// speedometer.xml (add/remove them there when changing the count). With
// more players the viewer's own row takes the last one.
export const SCOREBOARD_ROWS = 12;
// How often each player's scoreboard is rebuilt (seconds) — it's filled in
// whether it's open or not, so not every tick.
export const SCOREBOARD_UPDATE_SECONDS = 0.25;
