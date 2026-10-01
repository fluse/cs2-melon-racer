// HUD entity and the speedometer/jump/health bars in speedometer.xml.

// Name of the custom_hud_layout entity (place one in Hammer pointing at
// panorama/layout/custom_game/speedometer.vxml) that shows the speedometer.
export const SPEED_HUD_ENTITY_NAME = "speed_hud";
// Hammer units/sec -> km/h (1 unit = 1 inch: units/sec * 0.0254 * 3.6).
export const UNITS_TO_KMH = 0.0254 * 3.6;

// Segmented wall-jump charge bar (kart.wallJumpCharge) — see JUMP_BAR_SEGMENTS panel ids
// ("jump_seg_0" .. "jump_seg_{N-1}") in speedometer.xml.
export const JUMP_BAR_SEGMENTS = 10;

// Segmented melon health bar — see HEALTH_BAR_SEGMENTS panel ids
// ("health_seg_0" .. "health_seg_{N-1}") in speedometer.xml, filled up to
// kart.health / MELON_MAX_HEALTH. Below these fractions the bar's fill color
// shifts (green -> yellow -> red, see UpdateHealthHud/speedometer.css) to
// warn that another hard impact will break the melon.
export const HEALTH_BAR_SEGMENTS = 20;
export const HEALTH_LOW_FRACTION = 0.6;
export const HEALTH_CRITICAL_FRACTION = 0.3;

// Checkpoint strip at the top of the screen (start flag -> numbered
// checkpoints -> finish flag) — see CHECKPOINT_HUD_SLOTS panel ids
// ("cp_slot_0" .. "cp_slot_{N-1}", each with a "cp_link_<i>" line before
// it) in speedometer.xml. A track with more checkpoints shows a window of
// this many that moves along with the kart (see hud/checkpoint-strip-logic.js).
export const CHECKPOINT_HUD_SLOTS = 12;
