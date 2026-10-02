// Developer aids (dev/).

// Free look (dev/free-look.js): the player's own pawn flies through the map
// (it's already NOCLIP, see FreezePawn) and the view switches to its eyes.
// Switching it on puts those eyes where the chase camera was: the pawn's
// origin goes FREE_LOOK_EYE_HEIGHT below that spot (CS2's standing eye height).
export const FREE_LOOK_EYE_HEIGHT = 64;
