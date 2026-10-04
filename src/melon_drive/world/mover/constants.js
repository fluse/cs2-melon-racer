// Movers: a func_movelinear whose name starts with "mover" goes back and
// forth on its own — the script starts it (Open) when the map loads and
// after every round restart, and turns it round at each end (OnFullyOpen ->
// Close, OnFullyClosed -> Open). No logic_auto or outputs in Hammer needed:
// direction, distance and speed are the func_movelinear's own keyvalues.
// Rule: world/mover/logic.js, applied by world/mover/mover.js.

// The class the script looks for movers in.
export const MOVER_CLASS = "func_movelinear";
// "mover", "mover_<anything>" or "mover_wait<seconds>[_<anything>]"
// (e.g. "mover_wait1.5_left"): the wait is how long it stands still at each
// end before turning round; without one, MOVER_DEFAULT_WAIT.
export const MOVER_NAME_PATTERN = /^mover(?:_wait(\d+(?:\.\d+)?))?(?:_.*)?$/;
// Seconds a mover without "_wait<seconds>" in its name stands at each end.
export const MOVER_DEFAULT_WAIT = 0;

