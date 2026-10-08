// All tunable numbers and static/Hammer-naming-convention data for
// melon_drive, one file per system they configure. Import from here, not
// from the single files. Actual mutable runtime state (kart registry, race
// phase, caches) lives with the module that owns it instead — see
// core/kart-registry.js, race/heat/race-flow.js, race/track-config.js.

export * from "../movement/driving/constants.js";
export * from "../movement/jump/constants.js";
export * from "../zones/jump-pad/constants.js";
export * from "../zones/water/constants.js";
export * from "../health/damage/constants.js";
export * from "../health/heal/constants.js"; // heal zones live with the rest of healing in heal/
export * from "../movement/wall-bounce/constants.js";
export * from "../fx/boost-trail/constants.js";
export * from "../movement/attack-boost/constants.js";
export * from "../movement/momentum/constants.js";
export * from "../zones/lift/constants.js";
export * from "../fx/prediction/constants.js";
export * from "../health/breaking/constants.js";
export * from "../race/constants.js";
export * from "../race/time-trial/constants.js";
export * from "../race/grand-prix/constants.js";
export * from "../race/podium/constants.js";
export * from "../zones/teleport/constants.js";
export * from "../kart/constants.js";
export * from "../camera/follow/constants.js";
export * from "../camera/wall-clip/constants.js";
export * from "../camera/lift-zoom/constants.js";
export * from "../camera/break-zoom/constants.js";
export * from "../zones/camera-zone/constants.js";
export * from "../zones/side-view/constants.js";
export * from "../camera/side-view/constants.js";
export * from "../hud/constants.js";
export * from "../hud/speedometer/constants.js";
export * from "../hud/track/constants.js";
export * from "../hud/scoreboard/constants.js";
export * from "../hud/hub-modal/constants.js";
export * from "../core/constants.js";
export * from "../dev/constants.js";
export * from "../world/mover/constants.js";
