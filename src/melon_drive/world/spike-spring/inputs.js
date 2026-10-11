import { Instance } from "cs_script/point_script";
import { ResetSpikeSprings } from "./spike-spring.js";

/** A round restart respawns the spike springs: look them up again. */
export function RegisterSpikeSpringInputs() {
    Instance.OnRoundStart(ResetSpikeSprings);
}
