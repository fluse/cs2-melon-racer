// Map entities the script keeps running on their own, not tied to a kart:
// mover/ (func_movelinears going back and forth).
export { movers, StartMovers, RestoreMovers } from "./mover/mover.js";
export { RegisterMoverInputs } from "./mover/inputs.js";
