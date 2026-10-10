// Engine events for the attack boost's knife guard (knife-guard.js).
import { Instance } from "cs_script/point_script";
import { OnKnifeAttack } from "./knife-guard.js";

/** Registers OnKnifeAttack. Called once from movement/index.js's RegisterMovementInputs. */
export function RegisterAttackBoostInputs() {
    Instance.OnKnifeAttack(OnKnifeAttack);
}
