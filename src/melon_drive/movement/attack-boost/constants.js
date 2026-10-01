// Attack boost: holding the attack button (mouse1) pushes the melon faster
// than MAX_SPEED along the look direction — paid for with health, drained
// every tick while the boost is on. High risk, high reward: there's no
// floor — hold it too long and the health runs out and the melon breaks. Rule: ../logic/attack-boost.js, applied
// in ../physics/drive.js.

// Extra acceleration along the look direction while attack is held, on top
// of whatever W/S/A/D do (units/sec^2).
// Higher: the boost kicks in almost instantly.
// Lower: it takes a while to build up the extra speed.
export const ATTACK_BOOST_ACCEL = 450;
// Speed cap while boosting (units/sec). Letting go, the cap decays back to
// MAX_SPEED at BOOST_DECAY like a wall-bounce boost (so the boost trail shows
// too while above MAX_SPEED + BOOST_TRAIL_START_MARGIN).
// Higher: boosting gets much faster than normal driving.
// Lower (= MAX_SPEED): the boost only accelerates quicker, no higher top speed.
export const ATTACK_BOOST_MAX_SPEED = 850;
// Health lost per second while boosting (MELON_MAX_HEALTH = 70, so 20 = a
// full melon breaks after ~3.5 s of boosting).
// Higher: the boost is expensive, short bursts only.
// Lower: nearly free, can be held for long stretches.
export const ATTACK_BOOST_HEALTH_PER_SECOND = 20; // was 10
// The engine itself reacts to attack too — a knife swing shoves the melon
// ~140 u/s, even with the pawn's weapons taken away every tick. While attack
// is held and for this long after letting go, physics may not add
// horizontal speed on top of what the script commanded last tick, so speed
// only ever comes from driving and the paid boost.
// Higher: covers pushes that arrive later after the press; also blocks a
//   downhill roll's speed-up for longer after letting go.
// Lower (0): only while held — a push landing just after release gets through.
export const ATTACK_PUSH_GUARD_SECONDS = 0.3;
