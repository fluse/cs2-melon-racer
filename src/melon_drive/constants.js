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
export const FORWARD_ACCEL = 600; // units/sec^2 while holding forward (was 900 — lowered for a heavier, slower build-up: ~1.1s instead of ~0.7s to MAX_SPEED)
export const REVERSE_ACCEL = FORWARD_ACCEL * 0.5; // 0.5x forward, matches original's Reverse/Forward ratio
export const STRAFE_ACCEL = FORWARD_ACCEL * 0.4; // 0.4x forward, matches original's Strafe/Forward ratio
export const MAX_SPEED = 650; // units/sec, horizontal speed cap
export const COAST_FRICTION = 120; // units/sec^2 horizontal slowdown with no input — low, so the melon keeps rolling on its own momentum instead of grinding to a stop
export const JUMP_SPEED = 400; // units/sec upward impulse
// The ground jump needs real ground contact (see logic/contact.js), and a
// new one since the last jump — no cooldown: touching down is what resets
// it. (The "new contact" part stops a second press within
// GROUND_COYOTE_TIME of taking off from jumping again.)
//
// Ground contact is measured, not guessed from distance: each tick the
// vertical velocity we commanded is compared with what physics made of it.
// In the air gravity pulls it down by the full GRAVITY; anything holding
// the melon up (the floor, a slope) cancels part of that. So "supported" =
// the vertical acceleration was clearly less than free fall — independent
// of the melon's (non-round) shape, and a melon hovering just above the
// floor is correctly "in the air". A short line trace down then confirms
// what's holding it up is floor-like (GROUND_NORMAL_MIN_Z), not a wall or
// an edge. GROUND_COYOTE_TIME only bridges the tiny hops a rolling,
// egg-shaped melon makes — keep it short.
export const GRAVITY = 800; // units/sec^2 — CS2's sv_gravity, what vphysics pulls the melon down with
export const FREE_FALL_FRACTION = 0.8; // vertical accel at or below -FREE_FALL_FRACTION * GRAVITY counts as falling freely (not supported); lower = stricter
// Units down from the melon's center the floor-confirming trace reaches.
// A resting melon's center sits only ~7 units above the floor (see the
// floor distance in the DEBUG overlay / jump log), so this is its half
// height, rolled onto its long side or on a slope, plus a small margin. It
// used to be 48, which found the floor while the melon was still ~40 units
// up in a jump — together with a moment of measured "support" that allowed
// a jump in mid-air.
export const GROUND_CHECK_DISTANCE = 20;
export const GROUND_NORMAL_MIN_Z = 0.5; // surface must be at least this floor-like (not a wall) to count as ground
export const GROUND_COYOTE_TIME = 0.08; // seconds a ground contact stays valid after losing it — only bridges rolling hops
// Right after a jump (ground or wall) the floor can still be pushing the
// melon up for a tick, which reads exactly like support — so ground contact
// doesn't count for this long after any jump. Otherwise a second press just
// after taking off jumped again in mid-air.
export const GROUND_LIFTOFF_TIME = 0.15; // seconds

// Wall jump: in the air, touching a wall (a line trace in any of
// WALL_PROBE_DIRECTIONS horizontal directions finds a steep surface within
// WALL_CONTACT_DISTANCE and physics just stopped the melon's motion into
// it — see WALL_TOUCH_MIN_STOP_SPEED — or a wall impact just happened) and pressing jump
// pushes the melon off that wall and up. Its strength comes from a charge
// (the HUD jump bar): a wall jump is as strong as the charge is full
// (WALL_JUMP_UP_SPEED / WALL_JUMP_PUSH_SPEED at 100%) and uses up
// WALL_JUMP_CHARGE_COST of it, so chained wall jumps get weaker and weaker;
// the charge refills over WALL_JUMP_RECHARGE_SECONDS. A wall jump never
// raises the melon's speed cap, so chaining them can't build up speed.
// Can't climb one wall forever: after a wall jump, the next one
// needs ground contact first or a different wall (normal differing by more
// than WALL_JUMP_SAME_WALL_DOT) — bouncing between two facing walls chains.
export const WALL_PROBE_DIRECTIONS = 8;
export const WALL_JUMP_WINDOW = 0.2; // seconds a wall contact stays jumpable — the melon usually bounces off the wall the moment it hits it
export const WALL_JUMP_COOLDOWN = 0.45; // seconds between two wall jumps (was 0.3)
export const WALL_JUMP_CHARGE_COST = 0.5; // share of a full charge one wall jump uses — 2 in a row, the second at half strength (was 0.34, ~3 in a row)
export const WALL_JUMP_MIN_CHARGE = 0.15; // below this there's no wall jump at all (was 0.1)
export const WALL_JUMP_RECHARGE_SECONDS = 5; // empty -> full (was 3)
export const WALL_JUMP_UP_SPEED = 240; // units/sec upward — well below the ground jump's JUMP_SPEED (was 380)
export const WALL_JUMP_PUSH_SPEED = 160; // units/sec at least away from the wall (more if already moving away faster) (was 250)
export const WALL_JUMP_SAME_WALL_DOT = 0.7; // normals closer than this (dot product, ~45°) count as the same wall

// Below this horizontal AND vertical speed, with no steering/jump input,
// the melon counts as fully settled — UpdateKart stops re-pinning its
// velocity/spin to zero every tick and lets vphysics run it completely
// freely, so its own weight and (irregular) resting shape can tip or slide
// it exactly as real physics dictates instead of gluing it to whatever spot
// it stopped at.
export const MELON_REST_SPEED = 2; // units/sec

// The instant a melon crosses into "fully settled" (see MELON_REST_SPEED
// above), vphysics owns its orientation completely — but a perfectly
// balanced landing (e.g. resting dead upright on end) is a knife-edge
// equilibrium that a deterministic physics sim has no numerical noise to
// break on its own, so it would otherwise freeze there forever instead of
// tipping onto a stable side. UpdateKart gives it one small, random-direction
// spin nudge the moment it settles to break that tie; real vphysics then
// decides — from the melon's actual collision shape and whatever surface
// it's resting on — whether that nudge grows into a proper topple or just
// gets damped straight back to rest.
export const SETTLE_NUDGE_ANGULAR_SPEED = 40; // deg/sec, one-off pitch/roll kick on settling

// Impact damage: every tick we compare the velocity we commanded last tick
// against the melon's actual velocity now. A big gap means physics forcibly
// overrode our command — a wall crash or a hard landing — since gravity and
// our own steering only ever change velocity gradually. That gap's
// magnitude is the "impact speed" damage is based on.
export const MELON_MAX_HEALTH = 80;
// The melon entity's *engine* health (not kart.health above) — set this high
// on every spawn so the engine's own physics damage never destroys the prop,
// regardless of its Hammer health/damage settings. See MakeUnbreakableByEngine.
export const MELON_ENGINE_HEALTH = 1000000;
export const IMPACT_DAMAGE_THRESHOLD = 450; // units/sec of sudden velocity change before it starts to hurt
export const IMPACT_DAMAGE_SCALE = 0.2; // health lost per unit/sec beyond the threshold

// Wall bounce: an impact against a wall (any world/brush surface whose
// normal is mostly horizontal — see WALL_NORMAL_MAX_Z) reflects the melon's
// pre-impact velocity off that wall instead of letting vphysics just stop
// it, and can come out *faster* than it went in — trading health for speed.
// How much faster is skill-based: the speed multiplier is fixed per rating
// (BOUNCE_RATINGS[].speedMultiplier), and the rating comes from how close
// the hit was to WALL_BOUNCE_OPTIMAL_ANGLE (measured from the wall's normal,
// 0 = head-on, 90 = grazing) — closeness falls off linearly to 0 at
// WALL_BOUNCE_ANGLE_FALLOFF degrees away from it. A jump timed within
// WALL_BOUNCE_PERFECT_JUMP_WINDOW of the hit (before or after) multiplies the
// result once more — fully for the exact same tick, fading out towards the
// window's edges. Floors/landings never bounce — they keep using the
// plain IMPACT_DAMAGE_* rules above.
export const WALL_BOUNCE_MIN_IMPACT = 200; // units/sec of sudden velocity change before a wall hit counts as a bounce at all
export const WALL_NORMAL_MAX_Z = 0.5; // |normal.z| above this is a floor/ceiling/steep ramp, not a wall
export const WALL_BOUNCE_TRACE_DISTANCE = 160; // ray length from last tick's position along the incoming direction — must reach the wall even at grazing angles (grows with 1/cos(angle))
// A wall the traces find only counts if the melon is actually touching it
// (see IsWallContact in logic/wall-bounce.js) — the trace reaches far ahead,
// so in a small room it finds *some* wall on almost every hard landing or
// bump, which used to bounce the melon off a wall it never touched.
export const WALL_CONTACT_DISTANCE = 56; // max units from the melon's center to the wall plane — melon radius plus margin for the tick physics already pushed it back
// A wall the probes find only counts as touched for a wall jump if physics
// actually stopped the melon against it, measured like ground contact: of
// the speed into the wall we commanded last tick, at least
// WALL_CONTACT_MIN_STOP must be gone now — and at least this much in
// absolute terms. Without the absolute part, flying almost parallel past a
// nearby wall (only a few units/sec into it) counted as touching it from
// small physics noise alone.
// (WALL_CONTACT_DISTANCE alone is from the melon's center and let a melon
// still flying towards a wall jump off it before touching it.)
export const WALL_TOUCH_MIN_STOP_SPEED = 60; // units/sec of speed into the wall that must have been stopped
export const WALL_CONTACT_MIN_STOP = 0.5; // fraction of the into-the-wall speed the impact must have taken away — a landing or friction leaves it almost untouched, a real wall stops it
export const WALL_BOUNCE_TRACE_RADIUS = 8; // backup sphere sweep from the current position, for posts/edges the ray slips past
export const WALL_BOUNCE_SPHERE_TRACE_DISTANCE = 48;
// DEBUG only (debug.js): world lines drawn per bounce — wall normal green,
// incoming red, outgoing blue, look direction yellow — plus a log line with
// the velocity-based vs. look-based angle.
export const WALL_BOUNCE_DEBUG_SECONDS = 4;
export const WALL_BOUNCE_DEBUG_LINE_LENGTH = 96;
export const WALL_BOUNCE_OPTIMAL_ANGLE = 45; // degrees from the wall normal where the bounce is strongest
export const WALL_BOUNCE_ANGLE_FALLOFF = 45; // degrees away from optimal at which the bonus has faded out completely
export const WALL_BOUNCE_PERFECT_JUMP_WINDOW = 0.12; // seconds, before or after the hit
export const WALL_BOUNCE_PERFECT_JUMP_MULTIPLIER = 1.3; // extra multiplier on top for a perfectly timed jump (scaled down the further off it is)
// The timing press is the jump button, but separate from the normal jump:
// it counts even in the air or while the jump is on cooldown (it gives no
// upward push, only timing credit). Pressing again within this many seconds
// of the previous press is treated as mashing and locks timing credit for
// that long — see RegisterWallTimingPress.
export const WALL_TIMING_SPAM_LOCKOUT = 0.4; // seconds
export const WALL_BOUNCE_COOLDOWN = 0.2; // seconds — stops one wall contact from bouncing (and damaging) on consecutive ticks
// Wall hits get their own damage rules, separate from landings: a base part
// from the impact itself (same shape as IMPACT_DAMAGE_*), plus a cost for
// every unit/sec of speed the bounce *gained* — that second part is the
// actual "speed for health" trade. That total is then reduced by how close
// to the optimal angle it hit (the angle factor, 0..1) — jump timing only
// affects speed, not damage. Anything rated PERFECT (BOUNCE_RATINGS[0]) costs
// no health at all; one with no angle bonus pays full price. Charged once the jump window has
// closed (a late jump can still add speed), not on impact itself.
export const WALL_IMPACT_DAMAGE_THRESHOLD = 450;
export const WALL_IMPACT_DAMAGE_SCALE = 0.2;
export const WALL_BOUNCE_DAMAGE_PER_SPEED = 0.05; // health lost per unit/sec gained by a bounce
// A bounce may lift the melon above MAX_SPEED — deliberately with no upper
// limit, chained bounces stack. The raised cap then decays back towards
// MAX_SPEED at this rate (and never sits above the melon's actual speed, so
// braking and re-accelerating can't reclaim a boost already lost).
export const BOOST_DECAY = 150; // units/sec^2
// The speedometer flashes (PerfectBounce class) for this long after a bounce
// with at least this angle factor — i.e. one that cost little or no health.
export const PERFECT_BOUNCE_FLASH_SECONDS = 0.4;
export const PERFECT_BOUNCE_ANGLE_FACTOR = 0.8;
// Bounce feedback panel (bounce_panel in speedometer.xml, see
// UpdateBounceHud): shown for this long after each wall bounce.
export const BOUNCE_HUD_SECONDS = 1.5;
// Angle scale: 0°..90° split into this many equal segments
// ("bounce_angle_seg_0".."_{N-1}"), 10° each — the one containing 45° is
// styled as the target in speedometer.css, the one actually hit gets "Hit".
export const BOUNCE_ANGLE_SEGMENTS = 9;
// Jump-timing bar ("bounce_jump_seg_0".."_{N-1}"), filled by how well the
// jump was timed (1 = same tick as the hit).
export const BOUNCE_JUMP_SEGMENTS = 5;
// Rating word by how close to WALL_BOUNCE_OPTIMAL_ANGLE the hit was
// (angleFactor, 1 = exact). First match wins — keep sorted high to low,
// last entry is the catch-all. speedMultiplier is what a bounce with that
// rating does to the melon's speed (before jump timing). cssClass colors the panel; color is the same
// accent for the in-world prediction line (see prediction.js) — keep the two
// in sync with speedometer.css's .Rating* rules.
export const BOUNCE_RATINGS = [
    { minAngleFactor: 0.9, label: "PERFECT", speedMultiplier: 1.35, cssClass: "RatingPerfect", color: { r: 255, g: 224, b: 102, a: 255 } },
    { minAngleFactor: 0.7, label: "GOOD", speedMultiplier: 1.1, cssClass: "RatingGood", color: { r: 102, g: 221, b: 102, a: 255 } },
    { minAngleFactor: 0.4, label: "BAD", speedMultiplier: 0.5, cssClass: "RatingBad", color: { r: 102, g: 170, b: 255, a: 255 } },
    { minAngleFactor: 0, label: "MISS", speedMultiplier: 0.3, cssClass: "RatingMiss", color: { r: 255, g: 102, b: 102, a: 255 } },
];

// Wall-bounce prediction line, drawn in front of the melon (see
// prediction.js): a dotted line along its current direction of travel up to
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

// When a melon breaks it doesn't respawn instantly — it shreds apart at the
// crash site (hidden immediately, with the break particle standing in for
// the melon itself) for BREAK_RESPAWN_DELAY seconds before reappearing at the
// last checkpoint. Gives the player a beat to register that it broke instead
// of it just snapping to the checkpoint.
export const BREAK_RESPAWN_DELAY = 3; // seconds
// While broken, the chase camera pulls back from the crash site so the
// player actually sees the melon burst (see BreakCameraOffset in
// logic/break-sequence.js): it eases out by this much extra distance/height
// over BREAK_CAMERA_ZOOM_SECONDS, holds there, and snaps back to the
// player's normal offset when the melon respawns BREAK_RESPAWN_DELAY later.
export const BREAK_CAMERA_ZOOM_SECONDS = 0.8;
export const BREAK_CAMERA_EXTRA_DISTANCE = 260; // units further back
export const BREAK_CAMERA_EXTRA_HEIGHT = 160; // units further up
// How long a break's spawned effect entities (both templates below) are
// kept before being removed — long, so the chunks stay lying at the crash
// site. Removing the info_particle_system ends its particles, so this is an
// upper bound: the .vpcf's own particle lifetime can still end them sooner.
export const BREAK_EFFECT_LIFETIME = 180; // seconds
// Cap on how many breaks' effects exist at once, so a long session doesn't
// pile up entities — the oldest break's effects go first.
export const BREAK_EFFECT_MAX_ACTIVE = 24;
// Fallback look while broken when no break particle actually spawned (see
// SpawnBreakParticles/BreakMelon) — a dark, dead-looking husk visibly marking
// the crash site instead of the melon just vanishing for BREAK_RESPAWN_DELAY
// seconds with nothing to look at.
export const BREAK_TINT_FALLBACK = { r: 40, g: 40, b: 40, a: 255 };
// Name of a point_template placed in Hammer holding the break effect (e.g. an
// info_particle_system with "Start Active" set so it plays as soon as it's
// spawned, no input needed) — same ForceSpawn-from-a-template convention as
// MELON_TEMPLATE_NAME.
export const BREAK_PARTICLE_TEMPLATE_NAME = "melon_break_template";
// Second, separate break effect layered on top of the one above — e.g. flying
// melon chunks, as opposed to the main burst. Same point_template convention.
export const BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME = "melon_break_chunks_template";
// Any prop_physics the two break templates above spawn (e.g. the melon
// model's own break pieces, models/cs_italy/italy_food_melon/
// italy_food_melon/piece.vmdl .. piece8.vmdl, added to the chunks template)
// is treated as a break piece: flung outward from the crash site, tinted in
// the melon's color, and left lying there for BREAK_EFFECT_LIFETIME. The
// chunks particle alone is only sprite flecks that fade within moments.
export const BREAK_PIECE_SPEED = 220; // units/sec outward from the crash site
export const BREAK_PIECE_UP_SPEED = 180; // units/sec extra upward pop
export const BREAK_PIECE_SPIN = 600; // max degrees/sec of random tumble per axis

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

// Generic teleporters, same name-carries-the-config convention: a
// trigger_multiple named "teleport_to_<destination>" (filtered to
// prop_physics) with OnStartTouch -> RunScriptInput "melon_teleport" sends
// the touching melon to the entity named <destination> (e.g. an
// info_target), facing that entity's yaw. One shared handler for every
// teleporter — adding one is a pure Hammer edit. A teleport only moves the
// melon; it never changes its respawn point / checkpoint progress.
export const TELEPORT_TRIGGER_NAME_PATTERN = /^teleport_to_(.+)$/;
// true: keep the melon's horizontal speed, redirected along the
// destination's facing; false: arrive standing still.
export const TELEPORT_KEEP_SPEED = true;

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
export const GO_DISPLAY_SECONDS = 1; // how long "GO!" stays on screen once the countdown ends
export const BREAK_SECONDS = 10; // fixed by the original request
// Spacing between racers teleported onto the same start line side-by-side,
// so they don't spawn stacked on top of each other.
export const RACE_SPAWN_LATERAL_SPACING = 120;

// Track start/finish trigger naming convention:
// "track_start_<trackId>_cp<checkpointCount>_laps<lapsToWin>" (e.g.
// "track_start_1_cp8_laps3"). See GetTrackConfig() in track-config.js for
// how this is parsed, cached, and used as each track's start position.
export const START_TRIGGER_NAME_PATTERN = /^track_start_(\d+)_cp(\d+)_laps(\d+)$/;

// How far above the floor under a spawn entity (hub_spawn, intro_spawn) the
// melon's origin appears — straight above it, no sideways offset (see
// PositionAboveFloor in spawn-points.js). Just enough to clear the floor:
// a long drop lands hard enough for the engine's own physics to destroy the
// melon on impact (it used to be 128 plus the template's offset, ~180 units,
// and the melon broke on every landing and respawned in a loop).
export const SPAWN_UP_OFFSET = 40;
// The floor trace for that starts FLOOR_TRACE_UP above the spawn entity (in
// case it's sunk into the floor) and looks FLOOR_TRACE_DOWN below it (in case
// it's floating above the floor).
export const FLOOR_TRACE_UP = 32;
export const FLOOR_TRACE_DOWN = 512;

// Spawn entities — resolved in spawn-points.js.
// hub_spawn (info_player_start, required): where melons go in the hub.
// hub_spawn_facing (info_target, optional): only its angle counts — which
// way a melon at hub_spawn faces; without it, hub_spawn's own angle.
// intro_spawn (info_player_start, optional): a player's very first melon
// (the tutorial), facing its own angle; without it, hub_spawn.
export const HUB_SPAWN_NAME = "hub_spawn";
export const HUB_SPAWN_FACING_NAME = "hub_spawn_facing";
export const INTRO_SPAWN_NAME = "intro_spawn";

// Race-flow teleports (heat start, checkpoint respawns) target a trigger_multiple's
// raw GetAbsOrigin() — Hammer mappers commonly sink a trigger's brush a bit
// into the floor so a fast-moving physics prop reliably touches it instead
// of tunneling past a paper-thin volume. Teleporting the melon to that exact
// height would embed it in solid ground; VPhysics can't resolve that
// overlap upward and the melon tunnels down through the floor instead. Lift
// the target up by this much so the melon always drops onto the floor from
// just above it, same trick as SPAWN_UP_OFFSET above.
export const TELEPORT_UP_OFFSET = 40;

// The frozen pawn is also set to CSMoveType.NOCLIP (see OnPlayerReset),
// which makes its hitbox non-solid — this park height is now just a
// belt-and-suspenders backup (e.g. in case some other code path resets its
// move type) rather than the only thing keeping the melon off it. Lower
// this if it turns out to exceed the map's compiled bounds.
export const PAWN_PARK_HEIGHT = 3000;

// Offsets for CameraFollowConfig — behind and above the melon. cameraOffset
// is rotated by the player's eye angles: x is forward (negative = behind),
// z is up. Lateral is fixed; the backward distance and the up height are
// both player-adjustable (see CAMERA_DISTANCE_*/CAMERA_HEIGHT_* and
// GetCameraOffsetFor in camera.js, and the user menu's camera controls).
export const FOLLOW_OFFSET = { x: 0, y: 0, z: 20 };
export const CAMERA_LATERAL = 0;
export const CAMERA_DISTANCE_MIN = 50; // was 150 — players wanted it much closer
export const CAMERA_DISTANCE_MAX = 400;
export const CAMERA_DISTANCE_DEFAULT = CAMERA_DISTANCE_MIN; // closest setting feels best in play (was 320)
// CustomHudLayout only supports Panel/Label/Image/Button — no native
// slider/drag widget — so the user menu's "distance slider" is really a
// clickable row of notches the player picks from, same trick as the jump
// recharge bar (JUMP_BAR_SEGMENTS) below. This is how many notches it has.
export const CAMERA_DISTANCE_STEPS = 16; // must match the camdist_seg_* buttons in speedometer.xml (test/camera-steps.test.mjs checks)

// Same notch-slider trick as CAMERA_DISTANCE_* above, for how high above the
// melon the chase camera sits — lets players pick a low, close-to-the-ground
// view or a higher, more overview-ish one.
export const CAMERA_HEIGHT_MIN = 0; // was 20 — down to the melon's own FOLLOW_OFFSET height
export const CAMERA_HEIGHT_MAX = 160;
export const CAMERA_HEIGHT_DEFAULT = CAMERA_HEIGHT_MIN; // lowest setting feels best in play (was 80)
export const CAMERA_HEIGHT_STEPS = 16; // must match the camheight_seg_* buttons in speedometer.xml

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

// Think's debug heartbeat log interval — see think.js.
export const HEARTBEAT_INTERVAL = 1; // seconds
