// The kart: spawning (melon template, spawn entities, intro logo, frozen pawn) and painting.

export const MELON_TEMPLATE_NAME = "melon_template";

// How long the Melon Racer logo (intro_logo in speedometer.xml) shows after
// a player picks a team, before their melon spawns at the intro. Its
// animation (.IntroLogoImage in speedometer.css) has the logo out of the
// picture after 2.85s — keep this a little longer than that, and shorter
// than the animation itself (5s).
export const INTRO_LOGO_SECONDS = 3.2;

// How far above the floor under a spawn entity (hub_spawn, intro_spawn) the
// melon's origin appears — straight above it, no sideways offset (see
// PositionAboveFloor in kart/spawn-points.js). Just enough to clear the floor:
// a long drop lands hard enough for the engine's own physics to destroy the
// melon on impact (it used to be 128 plus the template's offset, ~180 units,
// and the melon broke on every landing and respawned in a loop).
export const SPAWN_UP_OFFSET = 40;
// The floor trace for that starts FLOOR_TRACE_UP above the spawn entity (in
// case it's sunk into the floor) and looks FLOOR_TRACE_DOWN below it (in case
// it's floating above the floor).
export const FLOOR_TRACE_UP = 32;
export const FLOOR_TRACE_DOWN = 512;

// Spawn entities — resolved in kart/spawn-points.js.
// hub_spawn (info_player_start, required): where melons go in the hub.
// hub_spawn_facing (info_target, optional): only its angle counts — which
// way a melon at hub_spawn faces; without it, hub_spawn's own angle.
// intro_spawn (info_player_start, optional): a player's very first melon
// (the tutorial), facing its own angle; without it, hub_spawn.
export const HUB_SPAWN_NAME = "hub_spawn";
export const HUB_SPAWN_FACING_NAME = "hub_spawn_facing";
export const INTRO_SPAWN_NAME = "intro_spawn";

// The frozen pawn (CSMoveType.NOCLIP: non-solid, but WASD still flies it)
// stays where it spawned — see HoldPawn in kart/spawn.js. It's only put back
// once it has drifted further than this, not every tick.
export const PAWN_DRIFT_TOLERANCE = 16;

// --- Painting: paint triggers and the user menu's color swatches. ---

// Paint triggers: place a trigger_multiple anywhere (hub is the intended
// use, but nothing restricts it there) named "paint_trigger_<r>_<g>_<b>"
// (e.g. "paint_trigger_255_0_0" for red), filtered to prop_physics like the
// other triggers. Its OnStartTouch calls RunScriptInput "melon_paint" on
// this point_script — the color itself is read back off the trigger's own
// name (regex below), not the script input parameter, so adding/changing a
// paint trigger's color is a pure Hammer edit, same convention as
// start_<trackId> in GetTrackConfig().
export const PAINT_TRIGGER_NAME_PATTERN = /^paint_trigger_(\d+)_(\d+)_(\d+)$/;

// Outline glow (the engine's Glow(), like CS2's teammate outline) around
// every whole melon, in its paint color — and in this green while it hasn't
// been painted yet — see kart/look.js.
export const MELON_GLOW_ENABLED = true;
export const MELON_GLOW_UNPAINTED_COLOR = { r: 60, g: 255, b: 60, a: 255 };

// Color swatches offered by the user menu's color picker (see the
// "usermenu_color_<key>" buttonId handling in hud/inputs.js's OnCustomHudClicked)
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
