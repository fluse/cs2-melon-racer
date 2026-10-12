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
// The floor the trace finds must also be right at the melon: its plane
// within this many units of the melon's center (resting: 6.9; tip-down
// ~8). The physics already slows a falling melon in the tick *before* it
// touches down — that reads as support while it's still up to ~13 units
// above the floor, and a (buffered) jump fired there took off before the
// melon ever landed. Measured to the plane (the trace's length × the
// floor's normal z), so a slope, where the floor straight below is
// further down, still counts.
export const GROUND_CONTACT_DISTANCE = 9; // units
// That slowed-down tick still moves the melon into the floor (the physics
// has it arrive exactly at the end of the step: gap / tick), while a melon
// that's on the floor — resting, rolling, or along a slope — doesn't move
// into it any more. So moving into the floor's plane faster than this
// isn't ground yet either (50 = under a unit a tick: a gap you can't see).
export const GROUND_MAX_APPROACH_SPEED = 50; // units/sec along the floor normal
export const GROUND_NORMAL_MIN_Z = 0.5; // surface must be at least this floor-like (not a wall) to count as ground
export const GROUND_COYOTE_TIME = 0.08; // seconds a ground contact stays valid after losing it — only bridges rolling hops
// Right after a jump (ground or wall) the floor can still be pushing the
// melon up for a tick, which reads exactly like support — so ground contact
// doesn't count for this long after any jump. Otherwise a second press just
// after taking off jumped again in mid-air.
export const GROUND_LIFTOFF_TIME = 0.15; // seconds
// A jump pressed in the air up to this long before touching down jumps on
// the touchdown (see BufferedGroundJump) — otherwise a press a tick or two
// early was simply lost. Shorter than any real jump's airtime, so a second
// press right after taking off can't turn into a jump on the next landing.
export const GROUND_JUMP_BUFFER = 0.1; // seconds

// Wall jump: in the air, at a wall (a line trace in any of
// WALL_PROBE_DIRECTIONS horizontal directions finds a steep surface within
// WALL_JUMP_CONTACT_RADIUS of the melon's center and the melon no longer
// moving into it — see IsAtWall — or a wall bounce just happened) and
// pressing jump pushes the melon off that wall and up. The timing is that
// distance: press while the wall is right at the melon, not some time after;
// a press before the touch waits for it (WALL_JUMP_BUFFER).
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
// tip at the wall. 8.5 covers a melon tip-first at the wall too. (It was 7,
// with one tick's travel towards the wall added on top — so a wall jump
// fired a tick *before* the melon reached the wall, like the ground jump
// did before the floor; now only a real contact counts, see IsAtWall.)
// Much more (16) lets a wall ~9 units off the melon's surface count.
// Higher: more forgiving; lower: below 6.7 not even a melon lying flat
// against the wall counts.
export const WALL_JUMP_CONTACT_RADIUS = 8.5; // units
// Like the floor (GROUND_MAX_APPROACH_SPEED): the tick before the touch the
// physics slows the melon to arrive exactly at the wall, so it's within the
// radius but still moving into it — not at the wall yet. At it, the wall
// has stopped it (or pushed it off already).
export const WALL_JUMP_MAX_APPROACH_SPEED = 50; // units/sec into the wall
// Seconds a wall contact stays jumpable after the melon was last at the wall
// — only a tick or two: a melon that hits a wall is pushed off it at once,
// so the press on the touch can land a tick late. (Lift zones: longer, see
// LIFT_ZONE_WALL_JUMP_WINDOW.)
export const WALL_JUMP_WINDOW = 0.035; // seconds
// No cooldown between two wall jumps (there was one, 0.45 s): the next one
// needs a new wall contact instead — the melon has left the wall it jumped
// off and touched one again (see WallJumpBlockReason). A press too early for
// that isn't lost: pressed up to this long before the melon can wall jump
// (before touching the next wall, or while still at the last one), it fires
// the wall jump the moment it can — everywhere, as it used to only in lift
// zones.
export const WALL_JUMP_BUFFER = 0.2; // seconds
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
