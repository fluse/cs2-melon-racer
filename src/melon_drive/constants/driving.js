// Driving: acceleration, speed cap, friction, and how a melon settles at rest.

// Force ratios ported from the original melonracer GMod gamemode
// (sent_melon_base/init.lua ENT:Think + gamemode/shared.lua DefXSpeed):
// forward is the strongest push, reverse is half that, strafe is weaker
// still — keeping FORWARD_ACCEL as our existing tuned baseline.
export const FORWARD_ACCEL = 325; // units/sec^2 while holding forward (was 900, then 500, then 400, then 450 — a heavier, slower build-up: ~2s to MAX_SPEED)
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

// Steering grip: while holding forward on the ground, the melon's horizontal
// velocity is turned towards the look direction by up to STEER_GRIP_RATE
// degrees per second, keeping its speed — so it goes where the camera points
// instead of only being pushed that way by FORWARD_ACCEL (which at MAX_SPEED
// turned it slowly, like a hovercraft). Only for velocity that is at most
// STEER_GRIP_MAX_ANGLE off the look direction: looking back or far to the
// side is braking/turning around via plain acceleration, not a snap U-turn.
// Higher STEER_GRIP_RATE: more direct, less drift. 0 = off (old behavior).
export const STEER_GRIP_RATE = 180; // degrees/sec
export const STEER_GRIP_MAX_ANGLE = 100; // degrees
// The same grip in the air (jumps, falls, after a wall bounce), at its own
// rate — without it, FORWARD_ACCEL alone barely turned a melon at speed.
// The bounce tick itself is never steered, so the reflected angle is applied
// as computed; lower this if bounces should keep their angle longer. 0 = no
// air steering beyond plain acceleration.
export const STEER_AIR_GRIP_RATE = 180; // degrees/sec
