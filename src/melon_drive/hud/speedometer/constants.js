// The speed panel (km/h, health bar, jump dots) in speedometer.xml.

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
