// Developer aids (dev/).

// Free look (dev/free-look.js): the player's own pawn flies through the map
// (it's already NOCLIP, see FreezePawn) and the view switches to its eyes.
// Switching it on puts those eyes where the chase camera was: the pawn's
// origin goes FREE_LOOK_EYE_HEIGHT below that spot (CS2's standing eye height).
export const FREE_LOOK_EYE_HEIGHT = 64;

// The ghost avatar of a free-looking player: a fresh copy of this
// point_template's entities (e.g. a hat prop_dynamic, "Not solid") hangs on
// their flying pawn while free look is on — the pawn itself is invisible, so
// it shows the others who's flying around. Optional: without it, no avatar.
export const SPECTATOR_HAT_TEMPLATE_NAME = "template_spectator_hat";
// Where it hangs: this far above the pawn's origin (its feet) — at its eyes.
export const SPECTATOR_HAT_HEIGHT = FREE_LOOK_EYE_HEIGHT;
// …and this far behind the eyes, against the view's yaw — so the player's
// own camera (at the eyes) doesn't look out through it.
export const SPECTATOR_HAT_BACK = 48;

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
