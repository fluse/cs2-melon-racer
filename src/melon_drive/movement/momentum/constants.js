// Momentum: reaching the top speed again and again in quick succession
// raises that melon's own top speed, step by step — as long as it never
// drops below MOMENTUM_MIN_SPEED in between (that ends the "run" and resets
// it to MAX_SPEED). The attack boost (and any other speed-cap boost, e.g. a
// wall bounce's) neither counts as reaching the top speed nor breaks a run.
// Rule: ../logic/momentum.js, applied in ../physics/drive.js.
import { UNITS_TO_KMH } from "../../hud/speedometer/constants.js";

// Top speed gained per step, as a fraction of MAX_SPEED (0.02 = +2 %).
// Higher: a few quick hits make the melon much faster.
// Lower: momentum is barely noticeable.
export const MOMENTUM_STEP = 0.02;
// Most steps a run can stack (10 × 2 % = up to MAX_SPEED × 1.2).
// Higher / Infinity: long clean runs keep getting faster without limit.
export const MOMENTUM_MAX_STEPS = 10;
// Reaching the top speed counts as a step only if the previous time it was
// reached is at most this many seconds ago — the first time (or after a
// longer gap) only starts the chain.
// Higher: easier, even slow re-accelerations count.
// Lower: only quick dip-and-recover driving builds momentum.
export const MOMENTUM_HIT_WINDOW = 2.5; // seconds
// Having reached the top speed, the melon has to fall this fraction below it
// before reaching it again counts as a new time (just holding top speed
// doesn't stack).
// Higher: a real slowdown (curve, bump) is needed between two hits.
// Lower: tiny wobbles already count — easy to farm by tapping W.
export const MOMENTUM_REARM_DIP = 0.05;
// Below this horizontal speed the run is over: back to plain MAX_SPEED.
export const MOMENTUM_MIN_SPEED_KMH = 30;
export const MOMENTUM_MIN_SPEED = MOMENTUM_MIN_SPEED_KMH / UNITS_TO_KMH; // units/sec (~328)
