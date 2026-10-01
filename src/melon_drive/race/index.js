// Racing: the tracks read from trigger names (track-config.js), checkpoint and
// lap progress (checkpoints/), the time trial clock and best times
// (time-trial/), and the hub -> countdown -> racing -> break flow (heat/).
import { RegisterCheckpointAndFinishInputs } from "./checkpoints/checkpoints.js";
import { RegisterHeatInputs } from "./heat/inputs.js";

export { GetTrackConfig, GetTrackOrder } from "./track-config.js";
export { RestartTimeTrial } from "./checkpoints/checkpoints.js";
export { StartRun, CancelRun, FinishRun, RunElapsed, CanRestartTimeTrial, GetBestTime } from "./time-trial/time-trial.js";
export * from "./heat/race-flow.js";

export function RegisterRaceInputs() {
    RegisterCheckpointAndFinishInputs();
    RegisterHeatInputs();
}
