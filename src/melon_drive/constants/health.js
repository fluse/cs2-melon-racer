// Melon health and impact damage from landings/crashes (wall hits have their own rules in wall-bounce.js).

// Impact damage: every tick we compare the velocity we commanded last tick
// against the melon's actual velocity now. A big gap means physics forcibly
// overrode our command — a wall crash or a hard landing — since gravity and
// our own steering only ever change velocity gradually. That gap's
// magnitude is the "impact speed" damage is based on:
//   damage = (impactSpeed - IMPACT_DAMAGE_THRESHOLD) * IMPACT_DAMAGE_SCALE
// e.g. a 700 u/s impact = (700 - 450) * 0.2 = 50 of MELON_MAX_HEALTH's 70.

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

// Heal zones: a trigger_multiple (filtered to prop_physics like the other
// triggers) with OnStartTouch -> RunScriptInput "heal_enter" and OnEndTouch
// -> RunScriptInput "heal_leave" heals the melon over time while it's
// inside. Health per second, used for a zone whose name doesn't set its own
// rate (see HEAL_ZONE_NAME_PATTERN).
// Higher: a quick stop in the zone refills the melon — heal zones become
//   pit stops you barely slow down for.
// Lower: healing takes a long stay; driving through only helps a little.
export const HEAL_ZONE_RATE = 10;
// Optional per-zone rate: a heal trigger named "heal_zone_<rate>" (e.g.
// "heal_zone_25") heals <rate> health per second instead of HEAL_ZONE_RATE.
// Any other name uses HEAL_ZONE_RATE. Overlapping zones don't stack — the
// fastest one counts.
export const HEAL_ZONE_NAME_PATTERN = /^heal_zone_(\d+(?:\.\d+)?)$/;
