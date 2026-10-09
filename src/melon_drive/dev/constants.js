// Developer aids (dev/).

// Free look (dev/free-look.js): the player's own pawn flies through the map
// (it's already NOCLIP, see FreezePawn) and the view switches to its eyes.
// Switching it on puts those eyes where the chase camera was: the pawn's
// origin goes FREE_LOOK_EYE_HEIGHT below that spot (CS2's standing eye height).
export const FREE_LOOK_EYE_HEIGHT = 64;

// The ghost avatar of a free-looking player: a fresh copy of this
// point_template's entities (e.g. a hat prop_dynamic, "Not solid") hangs on
// their flying pawn while free look is on — the pawn itself is invisible, so
// it shows the others who's flying around. Optional: without it, no avatar.
export const SPECTATOR_HAT_TEMPLATE_NAME = "template_spectator_hat";
// Where it hangs: this far above the pawn's origin (its feet) — at its eyes.
export const SPECTATOR_HAT_HEIGHT = FREE_LOOK_EYE_HEIGHT;
// …and this far behind the eyes, against the view's yaw — so the player's
// own camera (at the eyes) doesn't look out through it.
export const SPECTATOR_HAT_BACK = 48;
