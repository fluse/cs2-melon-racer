// The track HUD: time trial panel and checkpoint strip in speedometer.xml.

// Checkpoint strip at the top of the screen (start flag -> numbered
// checkpoints -> finish flag) — see CHECKPOINT_HUD_SLOTS panel ids
// ("cp_slot_0" .. "cp_slot_{N-1}", each with a "cp_link_<i>" line before
// it) in speedometer.xml. A track with more checkpoints shows a window of
// this many that moves along with the kart (see hud/track/logic.js).
export const CHECKPOINT_HUD_SLOTS = 12;
