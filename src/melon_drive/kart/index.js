// A player's kart: spawning the melon and freezing the pawn (spawn.js), the
// spawn entities (spawn-points.js), moving the melon on purpose
// (teleport.js), its look — paint and glow (look.js) — and the player
// lifecycle / paint trigger inputs (inputs.js). The kart record itself and
// the registry of all karts are in core/kart-registry.js.
export { SpawnMelonAt, HoldPawn, SetUpPlayerKart, EnsurePlayerKarts, ForgetIntroLogo } from "./spawn.js";
export * from "./spawn-points.js";
export { RespawnKartAtCheckpoint, TeleportKartTo } from "./teleport.js";
export * from "./look.js";
export { RegisterKartInputs } from "./inputs.js";
