// Melon physics — everything that moves, hurts, breaks or respawns a kart's
// melon, split by concern into the files in this folder. Other parts of
// melon_drive import from here, not from the individual files.
export { UpdateKart } from "./drive.js";
export { GetJumpChargeFraction } from "./jump.js";
export { ApplyImpactDamage } from "./damage.js";
export { BreakMelon, HandleMelonLost } from "./breaking.js";
export { RespawnKartAtCheckpoint, TeleportKartTo, SetKartPaintColor } from "./teleport.js";
