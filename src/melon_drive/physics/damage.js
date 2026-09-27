// Health loss from hard impacts (landings, crashes) — see IMPACT_DAMAGE_*.
import { Debug } from "../debug.js";
import { IMPACT_DAMAGE_THRESHOLD, IMPACT_DAMAGE_SCALE, MELON_MAX_HEALTH } from "../constants.js";

/** @param {number} slot @param {import("../kart-registry.js").Kart} kart @param {number} impactSpeed */
export function ApplyImpactDamage(slot, kart, impactSpeed) {
    const damage = (impactSpeed - IMPACT_DAMAGE_THRESHOLD) * IMPACT_DAMAGE_SCALE;
    DamageKart(slot, kart, damage, `impact ${impactSpeed.toFixed(0)} u/s`);
}

/** @param {number} slot @param {import("../kart-registry.js").Kart} kart @param {number} damage @param {string} reason */
export function DamageKart(slot, kart, damage, reason) {
    kart.health -= damage;
    Debug(`slot ${slot}: ${reason} -> ${damage.toFixed(0)} dmg, health ${kart.health.toFixed(0)}/${MELON_MAX_HEALTH}`);
}
