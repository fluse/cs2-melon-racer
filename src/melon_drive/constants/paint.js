// Melon painting: paint triggers and the user menu's color swatches.

// Paint triggers: place a trigger_multiple anywhere (hub is the intended
// use, but nothing restricts it there) named "paint_trigger_<r>_<g>_<b>"
// (e.g. "paint_trigger_255_0_0" for red), filtered to prop_physics like the
// other triggers. Its OnStartTouch calls RunScriptInput "melon_paint" on
// this point_script — the color itself is read back off the trigger's own
// name (regex below), not the script input parameter, so adding/changing a
// paint trigger's color is a pure Hammer edit, same convention as
// track_start_* in GetTrackConfig().
export const PAINT_TRIGGER_NAME_PATTERN = /^paint_trigger_(\d+)_(\d+)_(\d+)$/;

// Color swatches offered by the user menu's color picker (see the
// "usermenu_color_<key>" buttonId handling in index.js's OnCustomHudClicked)
// — a fixed palette rather than a full picker since panorama's
// CustomHudLayout only supports basic panels/buttons, not input widgets
// like a color wheel.
/** @type {Record<string, { r: number, g: number, b: number, a: number }>} */
export const COLOR_PRESETS = {
    red: { r: 220, g: 60, b: 60, a: 255 },
    orange: { r: 230, g: 140, b: 50, a: 255 },
    yellow: { r: 255, g: 224, b: 102, a: 255 },
    green: { r: 90, g: 200, b: 90, a: 255 },
    blue: { r: 90, g: 140, b: 230, a: 255 },
    purple: { r: 170, g: 100, b: 220, a: 255 },
    white: { r: 255, g: 255, b: 255, a: 255 },
    black: { r: 40, g: 40, b: 40, a: 255 },
};
