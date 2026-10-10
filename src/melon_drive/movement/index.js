// Everything that moves a kart's melon each tick, one folder per mechanic:
// driving/ (UpdateKart — the per-tick order — and steering), contact/ (floor
// and wall probes), jump/ (ground + wall jump), wall-bounce/, attack-boost/,
// momentum/. Other parts of melon_drive import from here.
export { UpdateKart } from "./driving/drive.js";
export { GetWallJumpCharges } from "./jump/jump.js";
import { RegisterAttackBoostInputs } from "./attack-boost/inputs.js";

/** Registers the movement mechanics' engine events. Called once from index.js. */
export function RegisterMovementInputs() {
    RegisterAttackBoostInputs(); // OnKnifeAttack: knife guard
}
