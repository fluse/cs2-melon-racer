// Engine side of water zones (WATER_* in constants.js): stopping a melon that
// lands in water. Which water zones the melon is in is tracked in
// ../registry.js (InWater); UpdateKart skips impact and wall-bounce detection
// while it's inside.
import { WaterEntryVelocity } from "./logic.js";

/**
 * The melon just entered a water zone: it loses its momentum at once — speed
 * and spin (see WATER_ENTRY_SPEED_KEEP), a boosted speed cap and the
 * momentum run. The per-tick tracking is cleared, so the stop isn't read as
 * an impact (damage) or a wall hit. A broken melon is frozen anyway.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function StopInWater(kart) {
    if (kart.breaking) {
        return;
    }
    kart.melon.Move({
        velocity: WaterEntryVelocity(kart.melon.GetAbsVelocity()),
        angularVelocity: WaterEntryVelocity(kart.melon.GetAbsAngularVelocity()),
    });
    kart.lastVelocity = undefined;
    kart.prevLastVelocity = undefined;
    kart.prevOrigin = undefined;
    kart.settled = false;
    kart.speedCap = undefined;
    kart.momentum = undefined;
    kart.lastWallContact = undefined;
}
