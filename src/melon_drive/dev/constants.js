// Developer aids (dev/).

// Free look (dev/free-look.js): the player turns into a drone and flies it
// through the map — a fresh copy of this point_template (a prop_dynamic
// with models/melon_racer/drone/drone.vmdl, from
// tools/models/make-drone-model.mjs) at their melon, moved by the script,
// the chase camera on it. Required for free look: without it in the map
// the toggle stays off.
export const DRONE_TEMPLATE_NAME = "template_drone";
// Where it appears: this far above the melon.
export const DRONE_START_HEIGHT = 40;
// Flying speed (units/s) along the view: W/S, A/D, jump up, duck down —
// with attack held DRONE_FAST_SPEED.
export const DRONE_SPEED = 600;
export const DRONE_FAST_SPEED = 1400;
// Inertia: its rotors pull the velocity towards the one asked for only
// this fast (per second) — after 1/DRONE_RESPONSE seconds two thirds of
// the way, after three times that 95 %. So it carries its momentum into a
// turn, and coasts on a moment after letting go, like a real drone in the
// air (a stabilized one: it brakes by itself, it doesn't drift forever).
export const DRONE_RESPONSE = 3;
// Its size against the world: a sphere this big is traced along every
// move, the drone stopped and slid along what it hits — but never melons,
// players or other drones.
export const DRONE_RADIUS = 8; // the model is ~16 across, about a melon
// How far it tips (degrees): into the way it's speeding up — forward when
// pulling away, back when braking, into a turn — at most this much.
export const DRONE_MAX_TILT = 25;
// How much of that it keeps while cruising at DRONE_SPEED (0..1): a drone
// leans into the air it flies against.
export const DRONE_CRUISE_TILT = 0.35;
// How fast it gets to that tilt (degrees per second) — no snapping.
export const DRONE_TILT_RATE = 120;
// The chase camera on the drone: this far behind it, this high above. The
// ratio sets where the drone sits in the picture — atan(height / distance)
// below its middle, ~27 degrees here: close, at the bottom of the screen.
export const DRONE_CAMERA_DISTANCE = 50;
export const DRONE_CAMERA_HEIGHT = 25;

// Camera tuning (dev/camera-tuning.js, its scale CAMERA_TUNING_SCALE in
// dev/tuning-scale-logic.js): the user menu's "Camera Settings"
// page sets the chase camera's distance and height for the clicking player
// only, to try out values for CAMERA_DISTANCE/CAMERA_HEIGHT in-game. Both
// share one scale, in units (distance: behind the melon, negative = in
// front of it; height: above FOLLOW_OFFSET, negative = lower).
export const CAMERA_TUNING_MIN = -50;
export const CAMERA_TUNING_MAX = 350;
// What the − / + buttons change a value by: the outer pair a big step, the
// inner pair a fine one.
export const CAMERA_TUNING_STEP = 10;
export const CAMERA_TUNING_FINE_STEP = 1;
// The clickable scale between them: one segment every this many units,
// CAMERA_TUNING_MIN..CAMERA_TUNING_MAX — 41 segments (camtune_<axis>_seg_<i>
// in speedometer.xml).
export const CAMERA_TUNING_SCALE_STEP = 10;

// Physics tuning (dev/physics-tuning.js, its scale PHYSICS_TUNING_SCALE in
// dev/tuning-scale-logic.js): the user menu's "Physics Settings"
// page scales the clicking player's own melon physics — top speed,
// acceleration, jump, attack boost, gravity — each in percent of its
// default (MAX_SPEED, FORWARD_ACCEL…, JUMP_SPEED, ATTACK_BOOST_*, GRAVITY).
export const PHYSICS_TUNING_MIN = 0; // percent
export const PHYSICS_TUNING_MAX = 300; // percent
// What the − / + buttons change a value by (percent): big and fine step.
export const PHYSICS_TUNING_STEP = 10;
export const PHYSICS_TUNING_FINE_STEP = 1;
// The clickable scale: one segment every this many percent,
// PHYSICS_TUNING_MIN..PHYSICS_TUNING_MAX — 31 segments
// (phytune_<key>_seg_<i> in speedometer.xml).
export const PHYSICS_TUNING_SCALE_STEP = 10;
