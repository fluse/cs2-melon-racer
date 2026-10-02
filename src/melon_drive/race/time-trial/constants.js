// Time trial: every run over a track is timed (start line -> finish of the
// last lap), and each player's best time per track is saved to disk. See
// "Time trial" in GAMEPLAY.md.

// How long the finish time ("NEW BEST!" or not) stays on the HUD after a run.
export const RUN_RESULT_SECONDS = 5;

// A free-roaming finish sends the melon straight back to the track's start
// spawn. On a loop the finish line is the start trigger, whose start_ input
// may fire right after finish_ for the same touch — by then the melon is
// already at the start spawn, and that stale touch must not start the next
// attempt's clock there. Start-line touches this soon after such a finish
// are ignored.
export const FINISH_RESTART_START_GUARD = 0.25;

// Key of the best times inside the addon's save data (Instance.SetSaveData
// holds one string for the whole addon — a JSON object, so other systems can
// keep their own keys next to this one).
export const SAVE_DATA_BEST_TIMES_KEY = "bestTimes";
