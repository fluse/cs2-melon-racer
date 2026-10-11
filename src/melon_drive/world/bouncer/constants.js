// Bouncers: every prop_dynamic with the foam bouncer model swings on its own
// — the script starts its "swing" loop once, after a random delay of up to
// one swing, so the bouncers of a map don't all swing in step. Found by
// model, not by name: no name, logic_auto or outputs in Hammer needed.
// Rule: world/bouncer/logic.js, applied by world/bouncer/bouncer.js.
// The swing's length is shared with the model's generator,
// tools/models/make-bouncer-model.mjs (it imports it from here): change it,
// re-run it and recompile the model.

// The class the script looks for bouncers in, and the model that makes one.
export const BOUNCER_CLASS = "prop_dynamic";
export const BOUNCER_MODEL = "models/melon_racer/bouncer/bouncer.vmdl";
// The model's animations: the looping swing, and the rest pose (upright)
// it's held in until its swing starts.
export const BOUNCER_SWING_ANIMATION = "swing";
export const BOUNCER_IDLE_ANIMATION = "idle";
// One full swing there and back, seconds — also the longest start delay.
export const BOUNCER_SWING_SECONDS = 2.4;
// How often the map is searched for bouncers again, so one that spawned
// after the script's first look (or after a round restart) isn't missed.
export const BOUNCER_SCAN_SECONDS = 2;
