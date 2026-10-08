// The HUD entity, and what every panel shares. Each panel with its own
// rules keeps its tunables in its folder (speedometer/, track/, scoreboard/).

// Name of the custom_hud_layout entity (place one in Hammer pointing at
// panorama/layout/custom_game/speedometer.vxml) that shows the whole HUD.
export const SPEED_HUD_ENTITY_NAME = "speed_hud";

// Panels that send a class or text only when it changes send their whole
// state again this often (seconds): a class sent before the player's HUD
// had loaded (e.g. full jump charges right at spawn) was lost and, never
// changing, never sent again.
export const HUD_RESEND_SECONDS = 1;
