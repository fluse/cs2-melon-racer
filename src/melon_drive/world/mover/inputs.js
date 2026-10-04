import { Instance } from "cs_script/point_script";
import { StartMovers } from "./mover.js";

/** Starts the movers when the script activates and after every round restart. */
export function RegisterMoverInputs() {
    Instance.OnActivate(StartMovers);
    Instance.OnRoundStart(StartMovers);
}
