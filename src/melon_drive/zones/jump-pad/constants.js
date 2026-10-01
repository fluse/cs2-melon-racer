// Jump pads: a trigger_multiple (filtered to prop_physics) with
// OnStartTouch -> RunScriptInput "jump_pad_enter" and OnEndTouch ->
// "jump_pad_leave". Pressing jump while the melon is on it (or just before it
// gets there, JUMP_PAD_BUFFER) launches it much higher and further than a
// normal jump — no press, no launch: the timing is the skill. From the pad
// until shortly after landing the melon takes no damage (landing, crashes,
// wall hits). Rule: ../logic/jump-pad.js, applied by ../physics/jump-pad.js.

// Per pad, the name can set both values: "jump_pad_<up>_<forward>" (e.g.
// "jump_pad_1000_400"), "jump_pad_<up>" (forward boost default); any other
// name uses the defaults below.
export const JUMP_PAD_NAME_PATTERN = /^jump_pad_(\d+(?:\.\d+)?)(?:_(\d+(?:\.\d+)?))?$/;
// Upward speed of the launch (units/sec). Height ≈ speed² / 1600 (gravity
// 800): 850 -> ~450 units, 1000 -> ~625; a normal jump (JUMP_SPEED 370) is ~85.
export const JUMP_PAD_UP_SPEED = 850;
// Horizontal speed added along the direction the melon is going (units/sec).
// Lifts the speed cap like a wall-bounce boost, then decays at BOOST_DECAY.
// Higher: much further. 0: only higher, not further.
export const JUMP_PAD_FORWARD_BOOST = 250;
// Slower than this, the melon has no clear direction of its own — the boost
// then goes along the look direction.
export const JUMP_PAD_MIN_DIRECTION_SPEED = 50; // units/sec
// A jump pressed up to this long before touching the pad still launches on
// the touch (e.g. jumping onto it).
// Higher: more forgiving timing. 0: only a press while on the pad counts.
export const JUMP_PAD_BUFFER = 0.2; // seconds
// No second launch from the same press/pad within this long.
export const JUMP_PAD_COOLDOWN = 0.5; // seconds
// No damage from the launch until this long after touching ground again
// (the landing often spreads over a few ticks and rolls)...
export const JUMP_PAD_LANDING_GRACE = 0.3; // seconds
// ...and at most this long after the launch, even without landing.
export const JUMP_PAD_MAX_PROTECTED_SECONDS = 6;
