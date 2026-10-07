// Grand Prix: the run of heats from the hub's "Start race" to the group's
// return to the hub. Every heat's finishers score points by the place they
// crossed the line in; the totals over all tracks decide the overall
// winner. See "Grand Prix — places & points" in GAMEPLAY.md.

// Points for 1st, 2nd, 3rd, … in a heat.
export const HEAT_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
// Every place past HEAT_POINTS still gets this much for finishing.
export const HEAT_POINTS_FINISHER = 1;
