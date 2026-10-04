// Map triggers that change what a melon does while it's inside: lift/,
// jump-pad/, camera-zone/, side-view/, water/, jump-recharge/ (heal zones are in health/heal/), plus the
// teleporters (teleport/). registry.js tracks which zones a melon is in;
// inputs.js registers every *_enter/*_leave and melon_teleport input.
export * from "./registry.js";
export { RegisterZoneInputs } from "./inputs.js";
