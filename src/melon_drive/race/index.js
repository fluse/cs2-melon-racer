// Racing: the tracks read from trigger names (track-config.js), checkpoint and
// lap progress (checkpoints/), the time trial clock and best times
// (time-trial/), the hub -> countdown -> racing -> break flow (heat/), and
// the Grand Prix places and points over its heats (grand-prix/).
import { RegisterCheckpointAndFinishInputs } from "./checkpoints/checkpoints.js";
import { RegisterHeatInputs } from "./heat/inputs.js";

export { GetTrackConfig, GetTrackOrder } from "./track-config.js";
export { RestartTimeTrial } from "./checkpoints/checkpoints.js";
export { StartRun, CancelRun, FinishRun, RunElapsed, CanRestartTimeTrial, GetBestTime, GetTrackBestTimes } from "./time-trial/time-trial.js";
export { grandPrix, PlayerKey, RestoreGrandPrix } from "./grand-prix/grand-prix.js";
export * from "./heat/race-flow.js";

export function RegisterRaceInputs() {
    RegisterCheckpointAndFinishInputs();
    RegisterHeatInputs();
}
