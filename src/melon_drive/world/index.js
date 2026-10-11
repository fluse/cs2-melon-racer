// Map entities the script keeps running on their own, not tied to a kart:
// mover/ (func_movelinears going back and forth), spike-spring/ (spike traps
// popping out of the floor on a clock), ball-pit/ (balls kept in their pit),
// ball-spawner/ (balls dropping in at a spawn point, removed after a while).
export { movers, StartMovers, RestoreMovers } from "./mover/mover.js";
export { RegisterMoverInputs } from "./mover/inputs.js";
export { spikeSprings, UpdateSpikeSprings, ResetSpikeSprings } from "./spike-spring/spike-spring.js";
export { RegisterSpikeSpringInputs } from "./spike-spring/inputs.js";
export { ballsOutside, UpdateBallPits } from "./ball-pit/ball-pit.js";
export { RegisterBallPitInputs } from "./ball-pit/inputs.js";
export { spawnedBalls, UpdateBallSpawner, ResetBallSpawner, RestoreSpawnedBalls } from "./ball-spawner/ball-spawner.js";
export { RegisterBallSpawnerInputs } from "./ball-spawner/inputs.js";
