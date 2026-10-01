// The melon's health: damage/ (impacts, flat landings), breaking/ (health 0
// or a kill trigger: break effects, respawn) and heal/ (heal zones, full
// health on respawn). Other parts of melon_drive import from here.
export { ApplyImpactDamage, DamageKart } from "./damage/damage.js";
export { BreakMelon, HandleMelonLost } from "./breaking/breaking.js";
export { RegisterBreakInputs } from "./breaking/inputs.js";
export * from "./heal/index.js";
