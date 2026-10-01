// Jumping: ground jump, wall jump, and the ground contact they rely on (see movement/contact/logic.js).

export const JUMP_SPEED = 370; // units/sec upward impulse
// The ground jump needs real ground contact (see movement/contact/logic.js), and a
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

// Wall jump: in the air, at a wall (a line trace in any of
// WALL_PROBE_DIRECTIONS horizontal directions finds a steep surface within
// WALL_JUMP_CONTACT_RADIUS of the melon's center, plus one tick's travel
// towards it — see WallContactReach — or a wall bounce just happened) and
// pressing jump pushes the melon off that wall and up. The timing is that
// distance: press while the wall is right at the melon, not some time after.
// Charges (the HUD's jump icons): the melon holds WALL_JUMP_CHARGES wall
// jumps, each one full strength (WALL_JUMP_UP_SPEED / WALL_JUMP_PUSH_SPEED)
// and using up one; with none left there's no wall jump. They refill one
// after the other, WALL_JUMP_RECHARGE_SECONDS each. A plain wall jump never
// raises the melon's speed cap, so chaining them can't build up speed (only
// an angle rating's bonus does, see WALL_JUMP_RATING_SPEED_MULTIPLIER).
// Can't climb one wall forever: after a wall jump, the next one
// needs ground contact first or a different wall (normal differing by more
// than WALL_JUMP_SAME_WALL_DOT) — bouncing between two facing walls chains.
// Enough directions that the tight contact ring has no gaps: a wall between
// two probes is hit at up to 1/cos(180°/N) times its real distance (16:
// +2%, 8 was +8%).
export const WALL_PROBE_DIRECTIONS = 16;
// Units from the melon's center to the wall's plane at which the wall is at
// the melon. Measured from the center: traces onto the melon's own surface
// find nothing in-engine. Measured in-game with the collision debug view: a
// melon lying right against a wall has its center 6.7 from it (6.9 above
// the floor), and it's only ~10% longer than wide, so ~8 at most with its
// tip at the wall. 7 (tuned in-game) is just past lying flat against it: a
// melon resting tip-first at a wall doesn't count, but one moving into the
// wall does, since one tick's travel towards it is added (WallContactReach).
// Much more (16) lets a wall ~9 units off the melon's surface count.
// Higher: more forgiving; lower: the press has to be closer to the touch —
// below 6.7 not even a melon lying flat against the wall counts.
export const WALL_JUMP_CONTACT_RADIUS = 7; // units
// Seconds a wall contact stays jumpable after the melon was last at the wall
// — only a tick or two: a melon that hits a wall is pushed off it at once,
// so the press on the touch can land a tick late. (Lift zones: longer, see
// LIFT_ZONE_WALL_JUMP_WINDOW.)
export const WALL_JUMP_WINDOW = 0.035; // seconds
export const WALL_JUMP_COOLDOWN = 0.45; // seconds between two wall jumps (was 0.3)
export const WALL_JUMP_CHARGES = 3; // wall jumps in a row, each full strength (was a 0..1 charge, half used per jump, weaker each time)
export const WALL_JUMP_RECHARGE_SECONDS = 2; // seconds to refill one wall jump — they refill one after the other, empty -> full = WALL_JUMP_CHARGES × this
export const WALL_JUMP_UP_SPEED = 240; // units/sec upward — well below the ground jump's JUMP_SPEED (was 380)
export const WALL_JUMP_PUSH_SPEED = 160; // units/sec at least away from the wall (more if already moving away faster) (was 250)
export const WALL_JUMP_SAME_WALL_DOT = 0.7; // normals closer than this (dot product, ~45°) count as the same wall
// Wall jump angle rating — the wall bounce's PERFECT hit, for wall jumps:
// the angle the melon came at the wall (from the wall normal, 0 = head-on,
// 90 = along it) gets the same rating as a bounce (BOUNCE_RATINGS, 45° =
// PERFECT, see WallJumpAngle in ./logic.js), shown on the bounce panel, a
// PERFECT with the spark. A rating with a multiplier above 1 boosts it like
// a bounce: it leaves with the full speed it came in with (not what's left
// after the wall stopped it) times this, in the wall jump's direction (see
// WallJumpBoostedVelocity). Keyed by BOUNCE_RATINGS[].label — no penalty
// below GOOD, a plain wall jump stays as it was. Any gain lifts the speed cap like
// a bounce (decays at BOOST_DECAY); charge and the same-wall rule still
// limit chaining. A PERFECT also kicks WALL_JUMP_PERFECT_UP_MULTIPLIER
// harder upward.
export const WALL_JUMP_RATING_SPEED_MULTIPLIER = { PERFECT: 1.35, GOOD: 1.1, BAD: 1, MISS: 1 };
export const WALL_JUMP_PERFECT_UP_MULTIPLIER = 1.2;
// The angle is the melon's approach, remembered when the wall contact starts
// (kart.lastWallContact.approach, see WallApproach): once it touches the
// wall, physics stops it there and it only slides along — a press a tick or
// two late used to read that slide as 90° (MISS). The remembered approach
// counts for this long after the contact started — longer and a melon that
// slid along a wall for a while could still cash in its old approach.
export const WALL_JUMP_APPROACH_MEMORY = 0.15; // seconds
