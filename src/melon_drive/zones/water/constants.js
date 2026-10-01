// Water zones: a trigger_multiple (filtered to prop_physics like the other
// triggers) around a func_water, with OnStartTouch -> RunScriptInput
// "water_enter" and OnEndTouch -> "water_leave". The script can't see
// func_water itself, so the trigger is what tells it the melon is in water.
// Landing in it, the melon loses its momentum at once (speed, spin, boosted
// speed cap, momentum steps); while inside, the water's drag and buoyancy
// aren't read as impacts — no wall bounces, no impact damage there.
// Rule: zones/water/logic.js, applied by zones/water/water.js.

// How much of its speed (and spin) the melon keeps on entering the water.
// 0: stops dead. 0.2: keeps a fifth of it.
export const WATER_ENTRY_SPEED_KEEP = 0;
