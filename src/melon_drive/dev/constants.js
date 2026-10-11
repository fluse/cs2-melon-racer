// Developer aids (dev/).

// Free look (dev/free-look.js): the player turns into a drone and flies it
// through the map — a fresh copy of this point_template (a prop_dynamic
// with models/melon_racer/drone/drone.vmdl, from
// tools/models/make-drone-model.mjs) at their melon, moved by the script,
// the chase camera on it. Required for free look: without it in the map
// the toggle stays off.
export const DRONE_TEMPLATE_NAME = "template_drone";
// The drone's laser pointer, from the camera's recording light along the
// pilot's view to the first thing in the way, at most DRONE_LASER_LENGTH.
// CS2 has no env_beam: the beam is laid from copies of this point_template
// (a prop_dynamic with models/melon_racer/laser/laser.vmdl from
// tools/models/make-laser-model.mjs — a glowing rod DRONE_LASER_SEGMENT
// long), end to end. Optional: without it, no laser.
export const DRONE_LASER_TEMPLATE_NAME = "template_drone_laser";
export const DRONE_LASER_LENGTH = 32;
export const DRONE_LASER_SEGMENT = 4; // the model's length — re-run the generator after changing it
// The recording light on the drone's camera (REC_LED in
// tools/models/make-drone-model.mjs, scaled to the model's size): this far
// ahead of the drone's origin and this far below it, in the drone's frame.
export const DRONE_LASER_FORWARD = 2.9;
export const DRONE_LASER_UP = -1.1;

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
// Its size against the world: a box this big is traced along every move,
// the drone stopped and slid along what it hits — but never melons,
// players or other drones. DRONE_RADIUS to each side (the model is ~16
// across, about a melon), DRONE_BOTTOM down to its skids and DRONE_TOP up
// from its origin — the model generator prints both, so it lands on its
// skids instead of hovering a sphere's radius above the floor.
export const DRONE_RADIUS = 8;
export const DRONE_BOTTOM = 2.5;
export const DRONE_TOP = 2.7;
// Touching down: with floor (a surface whose normal points up at least
// DRONE_GROUND_NORMAL_Z) within DRONE_GROUND_DISTANCE under that box, the
// drone has landed — its rotors run down to a stop ("spindown", then
// "landed"), and it's parked: every other input does nothing, only jump
// takes off again — a hop up at DRONE_TAKEOFF_SPEED, not counted as
// landed for DRONE_TAKEOFF_SECONDS so it gets clear of the floor, the rotors
// running up ("spinup", then "spin"). The rotor timing is the model's
// (tools/models/make-drone-model.mjs).
export const DRONE_GROUND_DISTANCE = 2;
export const DRONE_GROUND_NORMAL_Z = 0.7;
export const DRONE_TAKEOFF_SPEED = 180; // units/s up — with DRONE_RESPONSE ~60 units high
export const DRONE_TAKEOFF_SECONDS = 0.3;
// Which way it faces: in the air the pilot's view (yaw), turned towards it
// at most this fast (degrees per second) — landed it stays as it touched
// down, looking around doesn't turn it, and taking off it swings round to
// the view instead of snapping.
export const DRONE_YAW_RATE = 540;
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
// The point the camera turns around and is pulled in towards at a wall:
// this far above the drone (DRONE_CAMERA_HEIGHT counts from the drone, as
// before). Not its own center — landed that's just above the floor, and
// looking up the floor pulled the camera into the drone.
export const DRONE_CAMERA_PIVOT = 12;

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
