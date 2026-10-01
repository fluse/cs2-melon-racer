// Breaking: what happens at the crash site and the respawn delay.

// When a melon breaks it doesn't respawn instantly — it shreds apart at the
// crash site (hidden immediately, with the break particle standing in for
// the melon itself) for BREAK_RESPAWN_DELAY seconds before reappearing at the
// last checkpoint. Gives the player a beat to register that it broke instead
// of it just snapping to the checkpoint. Seconds.
// Higher: a break costs more race time and the player watches the burst
//   longer — harsher penalty, can feel like waiting.
// Lower: quicker back on track, a milder penalty; too low and the burst and
//   camera pull-back (BREAK_CAMERA_ZOOM_SECONDS) are cut off before they're
//   seen — it just snaps to the checkpoint.
export const BREAK_RESPAWN_DELAY = 3;
// While broken, the chase camera pulls back from the crash site so the
// player actually sees the melon burst (see BreakCameraOffset in
// health/breaking/logic.js): it eases out by this much extra distance/height
// over BREAK_CAMERA_ZOOM_SECONDS, holds there, and snaps back to the
// player's normal offset when the melon respawns BREAK_RESPAWN_DELAY later.
// Seconds the pull-back takes.
// Higher: slower, smoother zoom-out; at or above BREAK_RESPAWN_DELAY it never
//   reaches its full distance before the respawn.
// Lower: a faster, more abrupt jerk back; 0 = jumps straight out.
export const BREAK_CAMERA_ZOOM_SECONDS = 0.8;
// Units the camera ends up further back than the player's normal distance.
// Higher: wider view of the burst and the flying pieces, the melon looks small.
// Lower: stays close — the burst fills the screen, pieces fly out of view;
//   0 = no pull-back (only BREAK_CAMERA_EXTRA_HEIGHT).
export const BREAK_CAMERA_EXTRA_DISTANCE = 260;
// Units the camera ends up higher than the player's normal height.
// Higher: looks down onto the crash site from above, pieces on the ground
//   are easier to see; in low rooms the camera may end up in the ceiling.
// Lower: flatter view from the side; 0 = no rise (only
//   BREAK_CAMERA_EXTRA_DISTANCE).
export const BREAK_CAMERA_EXTRA_HEIGHT = 100;
// How long a break's spawned effect entities (both templates below) are
// kept before being removed — long, so the chunks stay lying at the crash
// site. Removing the info_particle_system ends its particles, so this is an
// upper bound: the .vpcf's own particle lifetime can still end them sooner.
// Seconds.
// Higher: pieces stay lying around longer as traces of past crashes — more
//   entities alive at once (still capped by BREAK_EFFECT_MAX_ACTIVE).
// Lower: the crash site is cleaned up sooner; below the particle's own
//   lifetime it also cuts the burst itself short.
export const BREAK_EFFECT_LIFETIME = 180;
// Cap on how many breaks' effects exist at once, so a long session doesn't
// pile up entities — the oldest break's effects go first.
// Higher: more crash sites stay visible with many players/breaks — more
//   entities and physics pieces, costs performance and entity slots.
// Lower: fewer entities; with many breaks old pieces vanish long before
//   BREAK_EFFECT_LIFETIME, possibly while someone's still looking at them.
export const BREAK_EFFECT_MAX_ACTIVE = 24;
// Fallback look while broken when no break particle actually spawned (see
// SpawnBreakParticles/BreakMelon) — a dark, dead-looking husk visibly marking
// the crash site instead of the melon just vanishing for BREAK_RESPAWN_DELAY
// seconds with nothing to look at. Only used when the break templates are
// missing or spawn nothing.
// Brighter (r/g/b up): the husk looks less "dead", closer to a normal melon.
// Darker (r/g/b down): more clearly broken; a < 255 makes it see-through,
//   0 hides it completely (the melon just vanishes).
export const BREAK_TINT_FALLBACK = { r: 40, g: 40, b: 40, a: 255 };
// Name of a point_template placed in Hammer holding the break effect (e.g. an
// info_particle_system with "Start Active" set so it plays as soon as it's
// spawned, no input needed) — same ForceSpawn-from-a-template convention as
// MELON_TEMPLATE_NAME. Not a tuning value: must match the entity's name in
// Hammer (renaming means renaming it there too, and in MAPPING_API.md).
export const BREAK_PARTICLE_TEMPLATE_NAME = "melon_break_template";
// Second, separate break effect layered on top of the one above — e.g. flying
// melon chunks, as opposed to the main burst. Same point_template convention,
// same "must match Hammer" rule.
export const BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME = "melon_break_chunks_template";
// Any prop_physics the two break templates above spawn (e.g. the melon
// model's own break pieces, models/cs_italy/italy_food_melon/
// italy_food_melon/piece.vmdl .. piece8.vmdl, added to the chunks template)
// is treated as a break piece: flung outward from the crash site, tinted in
// the melon's color, and left lying there for BREAK_EFFECT_LIFETIME. The
// chunks particle alone is only sprite flecks that fade within moments.
// Units/sec each piece flies outward (along the ground) from the crash site.
// Higher: a more violent burst, pieces scatter wide — they can end up far
//   off, across the track (in karts' way) or out of view.
// Lower: pieces drop in a tight heap where the melon broke; 0 = straight up
//   only (BREAK_PIECE_UP_SPEED).
export const BREAK_PIECE_SPEED = 220;
// Units/sec extra upward pop per piece.
// Higher: pieces fly high and stay in the air longer before landing; too
//   high and they hit ceilings indoors.
// Lower: pieces skid along the ground instead of flying; 0 = no pop.
export const BREAK_PIECE_UP_SPEED = 180;
// Max degrees/sec of random tumble per axis.
// Higher: pieces spin wildly through the air, a more chaotic burst.
// Lower: pieces fly calmer, keeping their orientation; 0 = no spin at all.
export const BREAK_PIECE_SPIN = 600;
