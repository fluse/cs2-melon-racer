// What the HUD's checkpoint strip shows (start flag -> numbered checkpoints
// -> finish flag) for a kart's progress — pure, see
// test/checkpoint-strip.test.mjs; hud.js applies it to the panels.

/**
 * @typedef {"reached" | "next" | "pending"} StripState
 * @typedef {{
 *   slots: { number: number, state: StripState }[], // the visible checkpoints, in order
 *   finish: StripState,
 *   moreBefore: boolean, moreAfter: boolean, // checkpoints left out of the window on either side
 * }} Strip
 */

/**
 * @param {number} total the track's checkpoint count
 * @param {number} reached checkpoints reached this lap (kart.checkpointIndex)
 * @param {number} maxSlots how many checkpoints fit (CHECKPOINT_HUD_SLOTS)
 * @param {boolean} [done] the run is over — everything, finish included, reached
 * @returns {Strip}
 */
export function CheckpointStrip(total, reached, maxSlots, done = false) {
    const visible = Math.min(total, maxSlots);
    if (done) {
        reached = total;
    }
    // Keep the next checkpoint in view, about in the middle of the window.
    const offset = Math.max(0, Math.min(total - visible, reached - Math.floor(visible / 2)));
    const slots = [];
    for (let i = 0; i < visible; i++) {
        const number = offset + i + 1;
        slots.push({ number, state: number <= reached ? "reached" : number === reached + 1 ? "next" : "pending" });
    }
    return {
        slots,
        finish: done ? "reached" : reached >= total ? "next" : "pending",
        moreBefore: offset > 0,
        moreAfter: offset + visible < total,
    };
}
