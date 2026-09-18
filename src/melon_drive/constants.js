// All tunable numbers and static/Hammer-naming-convention data for
// melon_drive live here, grouped by the system they configure. Actual
// mutable runtime state (kart registry, race phase, caches) lives with the
// module that owns it instead — see kart-registry.js, race-flow.js,
// track-config.js.

export const MELON_TEMPLATE_NAME = "melon_template";

// Force ratios ported from the original melonracer GMod gamemode
// (sent_melon_base/init.lua ENT:Think + gamemode/shared.lua DefXSpeed):
// forward is the strongest push, reverse is half that, strafe is weaker
// still — keeping FORWARD_ACCEL as our existing tuned baseline.
export const FORWARD_ACCEL = 900; // units/sec^2 while holding forward
export const REVERSE_ACCEL = 450; // 0.5x forward, matches original's Reverse/Forward ratio
export const STRAFE_ACCEL = 360; // 0.4x forward, matches original's Strafe/Forward ratio
export const MAX_SPEED = 650; // units/sec, horizontal speed cap
export const COAST_FRICTION = 500; // units/sec^2 horizontal slowdown with no input
export const JUMP_SPEED = 320; // units/sec upward impulse
// Jump is no longer gated on being grounded (the melon wobbles/bounces
// enough while rolling that a ground trace was unreliable) — instead it's a
// simple cooldown: always available, but only once per JUMP_COOLDOWN
// seconds. The HUD shows a recharge bar so the player can see when it's up.
export const JUMP_COOLDOWN = 1.5; // seconds

// Impact damage: every tick we compare the velocity we commanded last tick
// against the melon's actual velocity now. A big gap means physics forcibly
// overrode our command — a wall crash or a hard landing — since gravity and
// our own steering only ever change velocity gradually. That gap's
// magnitude is the "impact speed" damage is based on.
export const MELON_MAX_HEALTH = 100;
export const IMPACT_DAMAGE_THRESHOLD = 450; // units/sec of sudden velocity change before it starts to hurt
export const IMPACT_DAMAGE_SCALE = 0.2; // health lost per unit/sec beyond the threshold

// When a melon breaks it doesn't respawn instantly — it sits at the crash
// site, visibly dead (tinted dark, frozen), for BREAK_RESPAWN_DELAY seconds
// before teleporting back to the last checkpoint. Gives the player a beat to
// register that it broke instead of it just snapping to the checkpoint.
export const BREAK_RESPAWN_DELAY = 1; // seconds
export const BREAK_TINT = { r: 40, g: 40, b: 40, a: 255 }; // dark/dead look while broken, before the paint color is restored
// Name of a point_template placed in Hammer holding the break effect (e.g. an
// info_particle_system with "Start Active" set so it plays as soon as it's
// spawned, no input needed) — same ForceSpawn-from-a-template convention as
// MELON_TEMPLATE_NAME.
export const BREAK_PARTICLE_TEMPLATE_NAME = "melon_break_template";

// The map has multiple separate tracks, so a checkpoint's script input
// parameter names both which track it belongs to and its position along
// that track: "checkpoint_<trackId>_<index>", e.g. "checkpoint_2_5" is
// track 2's 5th checkpoint. Registered up front for every combination (see
// checkpoints.js) — raise these if a track ends up needing more checkpoints,
// or the map more tracks, than currently allowed for.
export const MAX_TRACKS = 8;
export const MAX_CHECKPOINTS_PER_TRACK = 32;

// Race flow: HUB (default/gather) -> COUNTDOWN (locked, pre-race) -> RACING
// -> BREAK (finished, waiting for the next heat) -> back to COUNTDOWN on the
// next track, or back to HUB after the last one. See GAMEPLAY.md's "Hub ->
// race -> next-track flow" for the full design.
export const RacePhase = /** @type {const} */ ({
    HUB: "HUB",
    COUNTDOWN: "COUNTDOWN",
    RACING: "RACING",
    BREAK: "BREAK",
});

export const HUB_TRIGGER_NAME = "hub_start_trigger";

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

export const COUNTDOWN_SECONDS = 3;
export const BREAK_SECONDS = 10; // fixed by the original request
// Spacing between racers teleported onto the same start line side-by-side,
// so they don't spawn stacked on top of each other.
export const RACE_SPAWN_LATERAL_SPACING = 120;

// Track start/finish trigger naming convention:
// "track_start_<trackId>_cp<checkpointCount>_laps<lapsToWin>" (e.g.
// "track_start_1_cp8_laps3"). See GetTrackConfig() in track-config.js for
// how this is parsed, cached, and used as each track's start position.
export const START_TRIGGER_NAME_PATTERN = /^track_start_(\d+)_cp(\d+)_laps(\d+)$/;

// How far in front of (and above) the player to spawn their melon, so it
// doesn't spawn overlapping the player's own hitbox.
export const SPAWN_FORWARD_OFFSET = 80;
export const SPAWN_UP_OFFSET = 40;

// Name of an info_target placed in Hammer purely as a facing reference (a
// pivot — origin doesn't matter, only its angle) pointing down the track
// from the hub. A freshly spawned melon (first connect, or any respawn
// before the racer has picked a track/touched a checkpoint) faces this
// direction instead of wherever the player's camera happened to be looking
// on connect, which has no relation to the track layout. Optional — if it's
// not placed, spawning falls back to the player's eye yaw like before.
export const HUB_SPAWN_FACING_NAME = "hub_spawn_facing";

// Race-flow teleports (heat start, return-to-hub) target a trigger_multiple's
// raw GetAbsOrigin() — Hammer mappers commonly sink a trigger's brush a bit
// into the floor so a fast-moving physics prop reliably touches it instead
// of tunneling past a paper-thin volume. Teleporting the melon to that exact
// height would embed it in solid ground; VPhysics can't resolve that
// overlap upward and the melon tunnels down through the floor instead. Lift
// the target up by this much so the melon always drops onto the floor from
// just above it, same trick as SPAWN_UP_OFFSET above.
export const TELEPORT_UP_OFFSET = 40;

// cs_script has no "disable collision" call for a pawn, so instead of
// fighting the melon's physics forever, park the frozen pawn far enough
// above the track that its hitbox is physically unreachable. Lower this if
// it turns out to exceed the map's compiled bounds.
export const PAWN_PARK_HEIGHT = 3000;

// Offsets for CameraFollowConfig — behind and above the melon. cameraOffset
// is rotated by the player's eye angles: x is forward (negative = behind),
// z is up. Height/lateral are fixed; only the backward distance is
// player-adjustable (see CAMERA_DISTANCE_* and GetCameraOffsetFor in
// camera.js, and the user menu's camera distance control).
export const FOLLOW_OFFSET = { x: 0, y: 0, z: 20 };
export const CAMERA_HEIGHT = 80;
export const CAMERA_LATERAL = 0;
export const CAMERA_DISTANCE_MIN = 150;
export const CAMERA_DISTANCE_MAX = 600;
export const CAMERA_DISTANCE_DEFAULT = 320; // matches the old fixed CAMERA_OFFSET.x
// CustomHudLayout only supports Panel/Label/Image/Button — no native
// slider/drag widget — so the user menu's "distance slider" is really a
// clickable row of notches the player picks from, same trick as the jump
// recharge bar (JUMP_BAR_SEGMENTS) below. This is how many notches it has.
export const CAMERA_DISTANCE_STEPS = 10;

// Name of the custom_hud_layout entity (place one in Hammer pointing at
// panorama/layout/custom_game/speedometer.vxml) that shows the speedometer.
export const SPEED_HUD_ENTITY_NAME = "speed_hud";
// Hammer units/sec -> km/h (1 unit = 1 inch: units/sec * 0.0254 * 3.6).
export const UNITS_TO_KMH = 0.0254 * 3.6;

// Segmented jump-recharge bar — see JUMP_BAR_SEGMENTS panel ids
// ("jump_seg_0" .. "jump_seg_{N-1}") in speedometer.xml.
export const JUMP_BAR_SEGMENTS = 10;

// Think's debug heartbeat log interval — see think.js.
export const HEARTBEAT_INTERVAL = 1; // seconds
