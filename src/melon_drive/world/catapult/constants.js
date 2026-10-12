// Catapults: a wooden catapult on wheels (tools/models/make-catapult-model.mjs)
// a melon jumps into: it's held in the bucket, jump fires — the arm swings
// up and throws it the way the catapult faces. Bumping the catapult rolls
// and turns it (world/catapult/roll.js), so other melons aim it. Two
// props: the base (a prop_physics) and the throwing arm (a prop_dynamic,
// animated), found by their models; the script keeps the arm on its base.
// The animation only shows the throw — the melon is carried along the arm's
// arc and launched by the script. Rules: world/catapult/logic.js, applied
// by world/catapult/catapult.js.
// The arm's geometry and timing are shared with the model's generator (it
// imports them from here): change them, re-run it and recompile the models.

// The models that make a prop a catapult's base and arm (compared without "_c", any case).
export const CATAPULT_BASE_MODEL = "models/melon_racer/catapult/catapult_base.vmdl";
export const CATAPULT_ARM_MODEL = "models/melon_racer/catapult/catapult_arm.vmdl";
// The classes searched for them.
export const CATAPULT_BASE_CLASSES = ["prop_physics", "prop_physics_multiplayer", "prop_physics_override"];
export const CATAPULT_ARM_CLASS = "prop_dynamic";
// An arm belongs to the base whose origin is at most this far from its own
// (place both at one spot in Hammer, same angles).
export const CATAPULT_PAIR_DISTANCE = 24;
// How often the map is searched for (new) catapults.
export const CATAPULT_SCAN_SECONDS = 1;
// The base's name may set the throw: catapult_<forward>_<up> (units/s along
// the way it faces, and up); else CATAPULT_LAUNCH_FORWARD/_UP.
export const CATAPULT_NAME_PATTERN = /^catapult_(\d+(?:\.\d+)?)_(\d+(?:\.\d+)?)$/;
// The throw (units/s): forward along the catapult's facing, and up — with
// GRAVITY 800 about 1.75 s in the air, some 1900 units far.
export const CATAPULT_LAUNCH_FORWARD = 1100;
export const CATAPULT_LAUNCH_UP = 700;

// --- The arm (model space: +X the way it throws, the handle-less back at -X) ---
// Its pivot (x, z), and from there to the middle of the bucket's floor.
export const CATAPULT_PIVOT = { x: 4, z: 22 };
export const CATAPULT_ARM_LENGTH = 36;
// The melon's center sits this far above the bucket's floor.
export const CATAPULT_SEAT_LIFT = 8; // a little over its radius: not pressed into the bucket floor's collision
// Arm angles (degrees up from pointing back, -X): at rest (cocked), where
// the throw lets go of the melon, where the arm stops against the crossbar.
export const CATAPULT_REST_ANGLE = 12;
export const CATAPULT_RELEASE_ANGLE = 55;
export const CATAPULT_FIRE_ANGLE = 100;
// The throw's swing (speeding up all the way), how long the arm stays up,
// and the slow wind back down (the model's "fire", "fired" and "reload").
export const CATAPULT_FIRE_SECONDS = 0.3;
export const CATAPULT_FIRED_SECONDS = 0.6;
export const CATAPULT_RELOAD_SECONDS = 1.6;

// --- Getting in ---
// A melon sits in it once its center is inside the bucket: measured in the
// catapult's own frame from the seat (the melon's place in the bucket at
// rest), at most CATAPULT_SEAT_HALF_WIDTH to either side and forward or back
// (the bucket is 18 across inside), and from CATAPULT_SEAT_BELOW under the
// seat to CATAPULT_SEAT_ABOVE over it — not just near it: coming at it from
// behind, over the winch, used to pull a melon in.
export const CATAPULT_SEAT_HALF_WIDTH = 8;
export const CATAPULT_SEAT_BELOW = 3;
export const CATAPULT_SEAT_ABOVE = 9;
// For this long after getting in, jump doesn't fire (the press that jumped
// it in mustn't throw it out again).
export const CATAPULT_SEAT_SETTLE_SECONDS = 0.25;

// --- Rolling (world/catapult/roll.js): physics alone would slide the base to
// a stop on its wheels at once, so the script gives back what friction took
// and keeps it upright ---
// Rolling resistance (units/s²): what a rolling catapult still loses — low, so
// a bump sends it a long way (from 300 units/s it rolls about 6 s).
export const CATAPULT_ROLL_DECEL = 50;
// A loss of speed faster than this (units/s²) isn't friction but a hit — a
// wall, a melon, another catapult — and stays as physics made it.
export const CATAPULT_ROLL_MAX_DECEL = 1500;
// Below this speed (units/s) the script leaves it alone: friction stops it.
export const CATAPULT_ROLL_STOP_SPEED = 8;
// Moved less than this share of the way it was sent last tick, it's stuck
// (pressed against a wall, a melon, another catapult): nothing is given back, or
// it would grind against what holds it, shaking.
export const CATAPULT_ROLL_BLOCKED_SHARE = 0.5;
// Tipping slower than this (degrees/s, pitch and roll) and rolling as physics
// made it, the script doesn't touch the base at all that tick.
export const CATAPULT_ROLL_STEADY_TILT_SPEED = 1;
// It tips at most this far (degrees) — on a ramp it follows the slope, it
// never falls over.
export const CATAPULT_ROLL_MAX_TILT = 25;
// How fast a wobble (its pitch and roll turning) dies away (per second).
export const CATAPULT_ROLL_TILT_DAMPING = 8;
