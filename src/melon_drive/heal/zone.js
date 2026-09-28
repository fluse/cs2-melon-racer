// Healing a kart's melon: heal zones (heal_enter / heal_leave, registered in
// ../zone-inputs.js — which zones it's in: ../physics/zones.js) and the full
// refill on every respawn/race-flow teleport.
import { MELON_MAX_HEALTH } from "../constants/index.js";
import { StrongestZone } from "../physics/zones.js";
import { HealedHealth } from "./logic.js";

/** Health per second the melon heals right now (0 outside heal zones). @param {import("../kart-registry.js").Kart} kart */
export function CurrentHealRate(kart) {
    return StrongestZone(kart, "healZones") ?? 0;
}

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

/** Back to full health — respawns after a break, checkpoint/race-flow teleports. @param {import("../kart-registry.js").Kart} kart */
export function RestoreFullHealth(kart) {
    kart.health = MELON_MAX_HEALTH;
}
