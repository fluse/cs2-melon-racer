// Boost trail: a glowing band (particles/melon_racer/boost_trail.vpcf, with
// juice droplets as its child) behind a melon while a wall-bounce boost has
// it faster than MAX_SPEED. Started and stopped by ../boost-trail.js.

// point_template placed in Hammer holding the trail's info_particle_system
// (effect particles/melon_racer/boost_trail.vpcf). A fresh copy is spawned
// on the melon, parented so it rides along, when the boost starts, and
// stopped when it's over. Must match the name in Hammer. Without it there's
// simply no trail.
export const BOOST_TRAIL_TEMPLATE_NAME = "particle_boost_trail_template";
// The trail starts once the melon is this many units/sec above MAX_SPEED...
// Higher: only big boosts (PERFECT, chained bounces) leave a trail.
// Lower: even a small GOOD bounce shows it; at ~0 it flickers on every
//   tiny overshoot of MAX_SPEED.
export const BOOST_TRAIL_START_MARGIN = 30;
// ...and stops once it's back below MAX_SPEED + this. Lower than the start
// margin so a speed hovering around the threshold doesn't toggle it every
// tick.
export const BOOST_TRAIL_STOP_MARGIN = 5;
// Seconds a stopped trail's entities are kept, so the particles already out
// fade out instead of vanishing. Must cover the .vpcf's longest particle
// lifetime (0.75 s for the juice droplets).
export const BOOST_TRAIL_FADE_SECONDS = 1;
