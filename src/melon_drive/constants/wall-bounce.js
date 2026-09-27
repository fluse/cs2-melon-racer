// Wall bounce: contact rules, speed-for-health trade, ratings, bounce HUD and the PERFECT spark.

// Wall bounce: an impact against a wall (any world/brush surface whose
// normal is mostly horizontal — see WALL_NORMAL_MAX_Z) reflects the melon's
// pre-impact velocity off that wall instead of letting vphysics just stop
// it, and can come out *faster* than it went in — trading health for speed.
// How much faster is skill-based: the speed multiplier is fixed per rating
// (BOUNCE_RATINGS[].speedMultiplier), and the rating comes from how close
// the hit was to WALL_BOUNCE_OPTIMAL_ANGLE (measured from the wall's normal,
// 0 = head-on, 90 = grazing) — closeness falls off linearly to 0 at
// WALL_BOUNCE_ANGLE_FALLOFF degrees away from it. A jump timed within
// WALL_BOUNCE_PERFECT_JUMP_WINDOW of the hit (before or after) multiplies the
// result once more — fully for the exact same tick, fading out towards the
// window's edges. Floors/landings never bounce — they keep using the
// plain IMPACT_DAMAGE_* rules (health.js).
export const WALL_BOUNCE_MIN_IMPACT = 200; // units/sec of sudden velocity change before a wall hit counts as a bounce at all
export const WALL_NORMAL_MAX_Z = 0.5; // |normal.z| above this is a floor/ceiling/steep ramp, not a wall
export const WALL_BOUNCE_TRACE_DISTANCE = 160; // ray length from last tick's position along the incoming direction — must reach the wall even at grazing angles (grows with 1/cos(angle))
// A wall the traces find only counts if the melon is actually touching it
// (see IsWallContact in logic/wall-bounce.js) — the trace reaches far ahead,
// so in a small room it finds *some* wall on almost every hard landing or
// bump, which used to bounce the melon off a wall it never touched.
export const WALL_CONTACT_DISTANCE = 56; // max units from the melon's center to the wall plane — melon radius plus margin for the tick physics already pushed it back
// A wall the probes find only counts as touched for a wall jump if physics
// actually stopped the melon against it, measured like ground contact: of
// the speed into the wall we commanded last tick, at least
// WALL_CONTACT_MIN_STOP must be gone now — and at least this much in
// absolute terms. Without the absolute part, flying almost parallel past a
// nearby wall (only a few units/sec into it) counted as touching it from
// small physics noise alone.
// (WALL_CONTACT_DISTANCE alone is from the melon's center and let a melon
// still flying towards a wall jump off it before touching it.)
export const WALL_TOUCH_MIN_STOP_SPEED = 60; // units/sec of speed into the wall that must have been stopped
export const WALL_CONTACT_MIN_STOP = 0.5; // fraction of the into-the-wall speed the impact must have taken away — a landing or friction leaves it almost untouched, a real wall stops it
export const WALL_BOUNCE_TRACE_RADIUS = 8; // backup sphere sweep from the current position, for posts/edges the ray slips past
export const WALL_BOUNCE_SPHERE_TRACE_DISTANCE = 48;
export const WALL_BOUNCE_OPTIMAL_ANGLE = 45; // degrees from the wall normal where the bounce is strongest
export const WALL_BOUNCE_ANGLE_FALLOFF = 45; // degrees away from optimal at which the bonus has faded out completely
export const WALL_BOUNCE_PERFECT_JUMP_WINDOW = 0.12; // seconds, before or after the hit
export const WALL_BOUNCE_PERFECT_JUMP_MULTIPLIER = 1.3; // extra multiplier on top for a perfectly timed jump (scaled down the further off it is)
// The timing press is the jump button, but separate from the normal jump:
// it counts even in the air or while the jump is on cooldown (it gives no
// upward push, only timing credit). Pressing again within this many seconds
// of the previous press is treated as mashing and locks timing credit for
// that long — see RegisterWallTimingPress.
export const WALL_TIMING_SPAM_LOCKOUT = 0.4; // seconds
export const WALL_BOUNCE_COOLDOWN = 0.2; // seconds — stops one wall contact from bouncing (and damaging) on consecutive ticks
// Wall hits get their own damage rules, separate from landings: a base part
// from the impact itself (same shape as IMPACT_DAMAGE_*), plus a cost for
// every unit/sec of speed the bounce *gained* — that second part is the
// actual "speed for health" trade. That total is then reduced by how close
// to the optimal angle it hit (the angle factor, 0..1) — jump timing only
// affects speed, not damage. Anything rated PERFECT (BOUNCE_RATINGS[0]) costs
// no health at all; one with no angle bonus pays full price. Charged once the jump window has
// closed (a late jump can still add speed), not on impact itself.
export const WALL_IMPACT_DAMAGE_THRESHOLD = 200; // units/sec — same as WALL_BOUNCE_MIN_IMPACT, so any bounce that isn't PERFECT costs health from its first unit/sec
export const WALL_IMPACT_DAMAGE_SCALE = 0.3; // health lost per unit/sec beyond the threshold (before the angle reduction)
export const WALL_BOUNCE_DAMAGE_PER_SPEED = 0.05; // health lost per unit/sec gained by a bounce
// A bounce may lift the melon above MAX_SPEED — deliberately with no upper
// limit, chained bounces stack. The raised cap then decays back towards
// MAX_SPEED at this rate (and never sits above the melon's actual speed, so
// braking and re-accelerating can't reclaim a boost already lost).
export const BOOST_DECAY = 150; // units/sec^2
// The speedometer flashes (PerfectBounce class) for this long after a bounce
// with at least this angle factor — i.e. one that cost little or no health.
export const PERFECT_BOUNCE_FLASH_SECONDS = 0.4;
export const PERFECT_BOUNCE_ANGLE_FACTOR = 0.8;
// point_template placed in Hammer holding the spark's info_particle_system:
// spawned at the melon on every wall bounce the HUD rates PERFECT
// (BOUNCE_RATINGS[0]) — two fresh copies per hit, one left at the wall and
// one parented to the melon so its player sees it too, and perfect hits by
// several karts at once each get their own. Must match the name in Hammer.
export const PERFECT_SPARK_TEMPLATE_NAME = "perfect_hit_particle_template";
// Seconds a spawned spark is kept before it's removed. Removing the
// info_particle_system ends its particles, so this is an upper bound.
// Higher: the effect is never cut short, but more entities pile up when
//   perfect hits come in fast succession.
// Lower: cleaned up sooner; below the .vpcf's own duration the spark is
//   cut off mid-play.
export const PERFECT_SPARK_LIFETIME = 2;
// Bounce feedback panel (bounce_panel in speedometer.xml, see
// UpdateBounceHud): shown for this long after each wall bounce.
export const BOUNCE_HUD_SECONDS = 1.5;
// Angle scale: 0°..90° split into this many equal segments
// ("bounce_angle_seg_0".."_{N-1}"), 10° each — the one containing 45° is
// styled as the target in speedometer.css, the one actually hit gets "Hit".
export const BOUNCE_ANGLE_SEGMENTS = 9;
// Jump-timing bar ("bounce_jump_seg_0".."_{N-1}"), filled by how well the
// jump was timed (1 = same tick as the hit).
export const BOUNCE_JUMP_SEGMENTS = 5;
// Rating word by how close to WALL_BOUNCE_OPTIMAL_ANGLE the hit was
// (angleFactor, 1 = exact). First match wins — keep sorted high to low,
// last entry is the catch-all. speedMultiplier is what a bounce with that
// rating does to the melon's speed (before jump timing). cssClass colors the panel; color is the same
// accent for the in-world prediction line (see prediction.js) — keep the two
// in sync with speedometer.css's .Rating* rules.
// PERFECT counts within this many degrees either side of
// WALL_BOUNCE_OPTIMAL_ANGLE (was 4.5°, i.e. minAngleFactor 0.9).
export const PERFECT_BOUNCE_TOLERANCE = 6.5; // degrees
export const BOUNCE_RATINGS = [
    { minAngleFactor: 1 - PERFECT_BOUNCE_TOLERANCE / WALL_BOUNCE_ANGLE_FALLOFF, label: "PERFECT", speedMultiplier: 1.35, cssClass: "RatingPerfect", color: { r: 255, g: 224, b: 102, a: 255 } },
    { minAngleFactor: 0.7, label: "GOOD", speedMultiplier: 1.1, cssClass: "RatingGood", color: { r: 102, g: 221, b: 102, a: 255 } },
    { minAngleFactor: 0.4, label: "BAD", speedMultiplier: 0.5, cssClass: "RatingBad", color: { r: 102, g: 170, b: 255, a: 255 } },
    { minAngleFactor: 0, label: "MISS", speedMultiplier: 0.3, cssClass: "RatingMiss", color: { r: 255, g: 102, b: 102, a: 255 } },
];
