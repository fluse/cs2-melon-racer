// Time trial: every run over a track is timed (start line -> finish of the
// last lap), and each player's best time per track is saved to disk. See
// "Time trial" in GAMEPLAY.md.

// How long the finish time ("NEW BEST!" or not) stays on the HUD after a run.
export const RUN_RESULT_SECONDS = 5;

// Key of the best times inside the addon's save data (Instance.SetSaveData
// holds one string for the whole addon — a JSON object, so other systems can
// keep their own keys next to this one).
export const SAVE_DATA_BEST_TIMES_KEY = "bestTimes";
