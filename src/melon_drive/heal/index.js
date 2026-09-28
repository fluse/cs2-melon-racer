// Everything that heals a melon, in one place: constants.js (HEAL_ZONE_* and
// the trigger names), logic.js (pure rules, unit-tested in test/heal.test.mjs)
// zone.js (applying them to karts) and effect.js (the particle_health_template
// played on entering a zone). The heal_enter/heal_leave inputs are
// registered with the other zones in ../zone-inputs.js; the constants are
// also re-exported by ../constants/index.js. Import from here.
export * from "./constants.js";
export { HealedHealth, HealZoneRate } from "./logic.js";
export { CurrentHealRate, ApplyHealing, RestoreFullHealth } from "./zone.js";
export { PlayHealEffect } from "./effect.js";
