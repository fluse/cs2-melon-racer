import { Instance } from "cs_script/point_script";
import { ResetBouncers } from "./bouncer.js";

/** A round restart respawns the bouncers: start them again. */
export function RegisterBouncerInputs() {
    Instance.OnRoundStart(ResetBouncers);
}
