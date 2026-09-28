// Melon health and impact damage from landings/crashes (wall hits have their own rules in wall-bounce.js).

// Impact damage: every tick we compare the velocity we commanded last tick
// against the melon's actual velocity now. A big gap means physics forcibly
// overrode our command — a wall crash or a hard landing — since gravity and
// our own steering only ever change velocity gradually. That gap's
// magnitude is the "impact speed" damage is based on:
//   damage = (impactSpeed - IMPACT_DAMAGE_THRESHOLD) * IMPACT_DAMAGE_SCALE
// e.g. a 700 u/s impact = (700 - 450) * 0.2 = 50 of MELON_MAX_HEALTH's 70.
// Landing flat on level ground: times FLAT_LANDING_DAMAGE_MULTIPLIER (below).

// The melon's health pool (kart.health), refilled on every respawn at a
// checkpoint (after a break or via the user menu). Shared by landing/crash damage here and wall-hit damage
// (WALL_IMPACT_DAMAGE_* / WALL_BOUNCE_DAMAGE_PER_SPEED in wall-bounce.js).
// The HUD bar shows it as a fraction, so changing it doesn't change the bar.
// Higher: more or harder hits before the melon breaks — more forgiving,
//   crashes matter less, wall bounces that cost health can be chained longer.
// Lower: fewer hits until it breaks — punishing; at or below one typical
//   hard landing's damage (~50 above), a single bad jump breaks it.
export const MELON_MAX_HEALTH = 70; // was 80 — every hit now takes ~14% more of the pool
// The melon entity's *engine* health (not kart.health above) — set this high
// on every spawn so the engine's own physics damage never destroys the prop,
// regardless of its Hammer health/damage settings. See MakeUnbreakableByEngine.
// Not a gameplay knob: only has to stay far above anything the engine's
// physics damage could deal.
// Higher: no effect.
// Lower: the engine may destroy the melon prop itself on a hard hit, outside
//   our break/respawn logic — the kart loses its melon instead of breaking
//   and respawning properly.
export const MELON_ENGINE_HEALTH = 1000000;
// units/sec of sudden velocity change before it starts to hurt — also the
// gate for whether a landing/crash deals damage at all.
// Higher: more impacts are free — normal jumps and small bumps never hurt,
//   only really hard falls/crashes do; every damaging hit also deals less
//   (the threshold is subtracted first).
// Lower: even ordinary landings and light bumps cost health; set too low,
//   physics noise from rolling over uneven ground chips health away.
export const IMPACT_DAMAGE_THRESHOLD = 450;
// health lost per unit/sec beyond the threshold — how steeply damage grows
// once an impact is over it.
// Higher: impacts just above the threshold already hurt a lot; hard crashes
//   break the melon in one hit.
// Lower: damage grows slowly — even big crashes only nibble at health,
//   breaking needs many hard hits.
export const IMPACT_DAMAGE_SCALE = 0.2;
// Landing flat on level ground hurts more than the same impact anywhere else
// (a slope lets the melon roll the fall off; a wall crash has its own
// rules): the damage above is multiplied by FLAT_LANDING_DAMAGE_MULTIPLIER
// when the floor under the melon is at least FLAT_LANDING_MIN_NORMAL_Z level
// and the impact came mostly from above (upward share of the impact at least
// FLAT_LANDING_MIN_VERTICAL_SHARE). The threshold itself is unchanged, so
// landings that were free stay free.
// Higher multiplier: big drops onto flat floors break the melon much sooner.
// Lower (1 = off): flat landings hurt the same as any other impact.
export const FLAT_LANDING_DAMAGE_MULTIPLIER = 2; // was 1.5
// Floor normal z from which ground counts as flat (1 = perfectly level;
// 0.97 ≈ up to 14° of slope).
// Higher: only really level floors count, gentle ramps don't.
// Lower: moderate slopes count as flat too.
export const FLAT_LANDING_MIN_NORMAL_Z = 0.97;
// How much of the impact must point straight up (the floor stopping a fall)
// for it to be a landing rather than a crash that happens to be on flat ground.
// Higher: only near-vertical drops count; fast landings with a lot of forward
// speed lost in the same tick don't.
// Lower: more mixed impacts count as flat landings.
export const FLAT_LANDING_MIN_VERTICAL_SHARE = 0.7;

// Heal zones (HEAL_ZONE_*): heal/constants.js, re-exported by index.js.
