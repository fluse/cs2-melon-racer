// HUD entity and the speed panel (km/h, health bar, jump dots) in speedometer.xml.

// Name of the custom_hud_layout entity (place one in Hammer pointing at
// panorama/layout/custom_game/speedometer.vxml) that shows the speedometer.
export const SPEED_HUD_ENTITY_NAME = "speed_hud";
// Hammer units/sec -> km/h (1 unit = 1 inch: units/sec * 0.0254 * 3.6).
export const UNITS_TO_KMH = 0.0254 * 3.6;

// Wall-jump charges as dots right of the speed panel, one per
// WALL_JUMP_CHARGES (stacked bottom up, "jump_dot_<i>" in speedometer.xml):
// an outline, filled white only once that charge is ready. JumpDotFills
// measures a refilling one in JUMP_DOT_FILL_STEPS steps; only the full step shows.
export const JUMP_DOT_FILL_STEPS = 8;

// Melon health bar, in the speed panel under the km/h: filled left to right
// in HEALTH_BAR_SEGMENTS steps up to kart.health / MELON_MAX_HEALTH — pieces
// "health_seg_0" .. "health_seg_{N-1}" in speedometer.xml (add/remove
// them there when changing the count). HEALTH_LOW/CRITICAL_FRACTION only feed HealthBarState's low/critical
// flags — the bar itself stays white (no tint).
export const HEALTH_BAR_SEGMENTS = 30;
export const HEALTH_LOW_FRACTION = 0.6;
export const HEALTH_CRITICAL_FRACTION = 0.3;
// The health bar and jump dots send a class only when it changes — plus
// their whole state again this often (seconds): a class sent before the
// player's HUD had loaded (e.g. full jump charges right at spawn) was lost
// and, never changing, never sent again.
export const HUD_RESEND_SECONDS = 1;

// Checkpoint strip at the top of the screen (start flag -> numbered
// checkpoints -> finish flag) — see CHECKPOINT_HUD_SLOTS panel ids
// ("cp_slot_0" .. "cp_slot_{N-1}", each with a "cp_link_<i>" line before
// it) in speedometer.xml. A track with more checkpoints shows a window of
// this many that moves along with the kart (see hud/checkpoint-strip-logic.js).
export const CHECKPOINT_HUD_SLOTS = 12;
