// Heal zones: while a melon is inside one or more heal triggers (heal_enter /
// heal_leave, see HEAL_ZONE_RATE), its health refills over time.
import { HealedHealth } from "../logic/health.js";

/**
 * Heals the melon for this tick at the fastest rate of the zones it's in.
 * Zone entities that no longer exist are dropped.
 * @param {import("../kart-registry.js").Kart} kart @param {number} dt
 */
export function ApplyHealing(kart, dt) {
    if (!kart.healZones || kart.healZones.size === 0) {
        return;
    }
    let rate = 0;
    for (const [zone, zoneRate] of kart.healZones) {
        if (!zone.IsValid()) {
            kart.healZones.delete(zone);
            continue;
        }
        rate = Math.max(rate, zoneRate);
    }
    kart.health = HealedHealth(kart.health, rate, dt);
}

/**
 * Forgets every heal zone the melon was in — for teleports/respawns, where
 * the zone's OnEndTouch may never reach us (the melon left it by teleport,
 * or it's a brand new melon entity). If the melon lands inside a zone, the
 * zone's next OnStartTouch adds it back.
 * @param {import("../kart-registry.js").Kart} kart
 */
export function LeaveHealZones(kart) {
    kart.healZones?.clear();
}
