// Heal zones: while a melon is inside one or more heal triggers (heal_enter /
// heal_leave, see HEAL_ZONE_RATE), its health refills over time. Which zones
// it's in: zones.js.
import { HealedHealth } from "../logic/health.js";
import { CurrentHealRate } from "./zones.js";

/**
 * Heals the melon for this tick at the fastest rate of the zones it's in.
 * @param {import("../kart-registry.js").Kart} kart @param {number} dt
 */
export function ApplyHealing(kart, dt) {
    const rate = CurrentHealRate(kart);
    if (rate > 0) {
        kart.health = HealedHealth(kart.health, rate, dt);
    }
}
