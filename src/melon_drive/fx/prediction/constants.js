// Wall-bounce prediction line (see fx/prediction/prediction.js).

// Wall-bounce prediction line, drawn in front of the melon (see
// fx/prediction/prediction.js): a dotted line along its current direction of travel up to
// the next wall, then on along the direction it would bounce off in —
// colored by the rating (BOUNCE_RATINGS) that wall hit would get at the
// current angle, so the player can steer until it turns PERFECT before
// reaching the wall. Dots are entities spawned from a point_template named
// PREDICTION_DOT_TEMPLATE_NAME (one small, non-solid prop_dynamic inside it)
// — Instance.DebugLine only works in dev environments, so real players
// would never see a debug-drawn line. Without that template in the map it
// falls back to DebugLine anyway, for testing in tools mode.
// Note: the dots are ordinary networked entities, so every player sees every
// kart's prediction line, not just their own.
// Master switch for the whole map. Each player also turns their own line
// on in the user menu ("GUIDE LINE") — off by default.
export const PREDICTION_ENABLED = true;
// "debug": Instance.DebugLine — a clean continuous line, but only visible in
//          dev environments (tools mode), never to real players.
// "dots":  entities from PREDICTION_DOT_TEMPLATE_NAME — visible to everyone.
export const PREDICTION_RENDER_MODE = "debug";
export const PREDICTION_DOT_TEMPLATE_NAME = "prediction_dot_template";
export const PREDICTION_LENGTH = 700; // units ahead to look for the next wall
export const PREDICTION_REFLECT_LENGTH = 250; // units the bounced-off part of the line continues
export const PREDICTION_DOTS_IN = 12; // dots from the melon to the wall
export const PREDICTION_DOTS_OUT = 5; // dots along the bounce direction
export const PREDICTION_START_OFFSET = 36; // first dot this far ahead of the melon's center, so it isn't hidden inside the melon
export const PREDICTION_MIN_SPEED = 80; // units/sec — below this there's no meaningful direction, line hidden
export const PREDICTION_NEUTRAL_COLOR = { r: 255, g: 255, b: 255, a: 160 }; // no wall in range
