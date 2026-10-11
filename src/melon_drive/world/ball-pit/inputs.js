import { Instance } from "cs_script/point_script";
import { BallEnteredPit, BallLeftPit } from "./ball-pit.js";

/** ball_pit_enter / ball_pit_leave from the trigger around a ball pit. */
export function RegisterBallPitInputs() {
    Instance.OnScriptInput("ball_pit_enter", ({ activator }) => BallEnteredPit(activator));
    Instance.OnScriptInput("ball_pit_leave", ({ caller, activator }) => BallLeftPit(activator, caller));
}
