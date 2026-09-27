// Driving: acceleration, speed cap, friction, and how a melon settles at rest.

// Force ratios ported from the original melonracer GMod gamemode
// (sent_melon_base/init.lua ENT:Think + gamemode/shared.lua DefXSpeed):
// forward is the strongest push, reverse is half that, strafe is weaker
// still — keeping FORWARD_ACCEL as our existing tuned baseline.
export const FORWARD_ACCEL = 500; // units/sec^2 while holding forward (was 900 — lowered for a heavier, slower build-up: ~1.1s instead of ~0.7s to MAX_SPEED)
export const REVERSE_ACCEL = FORWARD_ACCEL * 0.5; // 0.5x forward, matches original's Reverse/Forward ratio
export const STRAFE_ACCEL = FORWARD_ACCEL * 0.4; // 0.4x forward, matches original's Strafe/Forward ratio
export const MAX_SPEED = 650; // units/sec, horizontal speed cap
export const COAST_FRICTION = 120; // units/sec^2 horizontal slowdown with no input — low, so the melon keeps rolling on its own momentum instead of grinding to a stop

// Below this horizontal AND vertical speed, with no steering/jump input,
// the melon counts as fully settled — UpdateKart stops re-pinning its
// velocity/spin to zero every tick and lets vphysics run it completely
// freely, so its own weight and (irregular) resting shape can tip or slide
// it exactly as real physics dictates instead of gluing it to whatever spot
// it stopped at.
export const MELON_REST_SPEED = 2; // units/sec

// The instant a melon crosses into "fully settled" (see MELON_REST_SPEED
// above), vphysics owns its orientation completely — but a perfectly
// balanced landing (e.g. resting dead upright on end) is a knife-edge
// equilibrium that a deterministic physics sim has no numerical noise to
// break on its own, so it would otherwise freeze there forever instead of
// tipping onto a stable side. UpdateKart gives it one small, random-direction
// spin nudge the moment it settles to break that tie; real vphysics then
// decides — from the melon's actual collision shape and whatever surface
// it's resting on — whether that nudge grows into a proper topple or just
// gets damped straight back to rest.
export const SETTLE_NUDGE_ANGULAR_SPEED = 40; // deg/sec, one-off pitch/roll kick on settling
