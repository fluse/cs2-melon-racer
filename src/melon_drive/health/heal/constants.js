// Heal zones: a trigger_multiple (filtered to prop_physics like the other
// triggers) with OnStartTouch -> RunScriptInput "heal_enter" and OnEndTouch
// -> RunScriptInput "heal_leave" heals the melon over time while it's
// inside. Health per second, used for a zone whose name doesn't set its own
// rate (see HEAL_ZONE_NAME_PATTERN / HEAL_ZONE_FULL_NAME).
// Higher: a quick stop in the zone refills the melon — heal zones become
//   pit stops you barely slow down for.
// Lower: healing takes a long stay; driving through only helps a little.
export const HEAL_ZONE_RATE = 10;
// Optional per-zone rate: a heal trigger named "heal_zone_<rate>" (e.g.
// "heal_zone_25") heals <rate> health per second instead of HEAL_ZONE_RATE.
// Any other name uses HEAL_ZONE_RATE. Overlapping zones don't stack — the
// fastest one counts.
export const HEAL_ZONE_NAME_PATTERN = /^heal_zone_(\d+(?:\.\d+)?)$/;
// Full-heal zone: a heal trigger with exactly this name (same heal_enter /
// heal_leave wiring) refills the melon to MELON_MAX_HEALTH on the first tick
// inside and keeps it full while it stays there. Its rate is
// HEAL_ZONE_FULL_RATE, so it always beats any other zone it overlaps.
export const HEAL_ZONE_FULL_NAME = "heal_zone_full";
// Not a tuning knob: "infinitely fast" — HealedHealth jumps straight to full.
export const HEAL_ZONE_FULL_RATE = Infinity;
// point_template placed in Hammer holding the heal effect's
// info_particle_system: a fresh copy is played at the melon, riding along
// on it, every time it enters a heal zone (any kind). Must match the name
// in Hammer; test/map/map-templates.test.mjs checks it's there.
export const HEAL_PARTICLE_TEMPLATE_NAME = "particle_health_template";
// Seconds a spawned heal effect is kept before it's removed. Removing the
// info_particle_system ends its particles, so this is an upper bound.
// Higher: the effect is never cut short, but copies pile up while melons
//   keep driving in and out of heal zones.
// Lower: cleaned up sooner; below the .vpcf's own duration it's cut off
//   mid-play.
export const HEAL_PARTICLE_LIFETIME = 2;
