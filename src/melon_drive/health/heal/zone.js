// Healing a kart's melon: heal zones (heal_enter / heal_leave, registered in
// ../../zones/inputs.js — which zones it's in: ../../zones/registry.js) and the full
// refill on every respawn/race-flow teleport.
import { MELON_MAX_HEALTH, WALL_JUMP_CHARGES } from "../../constants/index.js";
import { StrongestZone } from "../../zones/registry.js";
import { HealedHealth } from "./logic.js";

/** Health per second the melon heals right now (0 outside heal zones). @param {import("../../core/kart-registry.js").Kart} kart */
export function CurrentHealRate(kart) {
    return StrongestZone(kart, "healZones") ?? 0;
}

/**
 * Heals the melon for this tick at the fastest rate of the zones it's in.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function ApplyHealing(kart, dt) {
    const rate = CurrentHealRate(kart);
    if (rate > 0) {
        kart.health = HealedHealth(kart.health, rate, dt);
    }
}

/**
 * Back to full health — respawns after a break, checkpoint/race-flow
 * teleports. A melon arriving whole also gets all its wall jumps charged
 * (the HUD jump icons), like a freshly spawned one.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function RestoreFullHealth(kart) {
    kart.health = MELON_MAX_HEALTH;
    kart.wallJumpCharge = WALL_JUMP_CHARGES;
}
