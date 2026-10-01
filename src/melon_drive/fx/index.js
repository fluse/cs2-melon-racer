// Visual effects: particles.js spawns/places/starts/stops/removes every
// point_template particle effect; boost-trail/ and prediction/ (the guide
// line) are the effects that follow a melon every tick.
export * from "./particles.js";
export { UpdateBoostTrail, StopBoostTrail } from "./boost-trail/boost-trail.js";
export { HidePrediction, IsPredictionOn, SetPrediction, UpdatePrediction } from "./prediction/prediction.js";
