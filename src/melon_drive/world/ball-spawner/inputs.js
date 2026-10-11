import { Instance } from "cs_script/point_script";
import { ResetBallSpawner } from "./ball-spawner.js";

/** A round restart removes the spawned balls: start counting from zero. */
export function RegisterBallSpawnerInputs() {
    Instance.OnRoundStart(ResetBallSpawner);
}
