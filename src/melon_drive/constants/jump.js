// Jumping: ground jump, wall jump, and the ground contact they rely on (see logic/contact.js).

export const JUMP_SPEED = 370; // units/sec upward impulse
// The ground jump needs real ground contact (see logic/contact.js), and a
// new one since the last jump — no cooldown: touching down is what resets
// it. (The "new contact" part stops a second press within
// GROUND_COYOTE_TIME of taking off from jumping again.)
//
// Ground contact is measured, not guessed from distance: each tick the
// vertical velocity we commanded is compared with what physics made of it.
// In the air gravity pulls it down by the full GRAVITY; anything holding
// the melon up (the floor, a slope) cancels part of that. So "supported" =
// the vertical acceleration was clearly less than free fall — independent
// of the melon's (non-round) shape, and a melon hovering just above the
// floor is correctly "in the air". A short line trace down then confirms
// what's holding it up is floor-like (GROUND_NORMAL_MIN_Z), not a wall or
// an edge. GROUND_COYOTE_TIME only bridges the tiny hops a rolling,
// egg-shaped melon makes — keep it short.
export const GRAVITY = 800; // units/sec^2 — CS2's sv_gravity, what vphysics pulls the melon down with
export const FREE_FALL_FRACTION = 0.8; // vertical accel at or below -FREE_FALL_FRACTION * GRAVITY counts as falling freely (not supported); lower = stricter
// Units down from the melon's center the floor-confirming trace reaches.
// A resting melon's center sits only ~7 units above the floor (see the
// floor distance in the DEBUG overlay / jump log), so this is its half
// height, rolled onto its long side or on a slope, plus a small margin. It
// used to be 48, which found the floor while the melon was still ~40 units
// up in a jump — together with a moment of measured "support" that allowed
// a jump in mid-air.
export const GROUND_CHECK_DISTANCE = 20;
export const GROUND_NORMAL_MIN_Z = 0.5; // surface must be at least this floor-like (not a wall) to count as ground
export const GROUND_COYOTE_TIME = 0.08; // seconds a ground contact stays valid after losing it — only bridges rolling hops
// Right after a jump (ground or wall) the floor can still be pushing the
// melon up for a tick, which reads exactly like support — so ground contact
// doesn't count for this long after any jump. Otherwise a second press just
// after taking off jumped again in mid-air.
export const GROUND_LIFTOFF_TIME = 0.15; // seconds

// Wall jump: in the air, touching a wall (a line trace in any of
// WALL_PROBE_DIRECTIONS horizontal directions finds a steep surface within
// WALL_CONTACT_DISTANCE and physics just stopped the melon's motion into
// it — see WALL_TOUCH_MIN_STOP_SPEED — or a wall impact just happened) and pressing jump
// pushes the melon off that wall and up. Its strength comes from a charge
// (the HUD jump bar): a wall jump is as strong as the charge is full
// (WALL_JUMP_UP_SPEED / WALL_JUMP_PUSH_SPEED at 100%) and uses up
// WALL_JUMP_CHARGE_COST of it, so chained wall jumps get weaker and weaker;
// the charge refills over WALL_JUMP_RECHARGE_SECONDS. A wall jump never
// raises the melon's speed cap, so chaining them can't build up speed.
// Can't climb one wall forever: after a wall jump, the next one
// needs ground contact first or a different wall (normal differing by more
// than WALL_JUMP_SAME_WALL_DOT) — bouncing between two facing walls chains.
export const WALL_PROBE_DIRECTIONS = 8;
export const WALL_JUMP_WINDOW = 0.2; // seconds a wall contact stays jumpable — the melon usually bounces off the wall the moment it hits it
export const WALL_JUMP_COOLDOWN = 0.45; // seconds between two wall jumps (was 0.3)
export const WALL_JUMP_CHARGE_COST = 0.5; // share of a full charge one wall jump uses — 2 in a row, the second at half strength (was 0.34, ~3 in a row)
export const WALL_JUMP_MIN_CHARGE = 0.15; // below this there's no wall jump at all (was 0.1)
export const WALL_JUMP_RECHARGE_SECONDS = 5; // empty -> full (was 3)
export const WALL_JUMP_UP_SPEED = 240; // units/sec upward — well below the ground jump's JUMP_SPEED (was 380)
export const WALL_JUMP_PUSH_SPEED = 160; // units/sec at least away from the wall (more if already moving away faster) (was 250)
export const WALL_JUMP_SAME_WALL_DOT = 0.7; // normals closer than this (dot product, ~45°) count as the same wall
