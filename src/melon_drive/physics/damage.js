// Health loss from hard impacts (landings, crashes) — see IMPACT_DAMAGE_*.
import { Debug } from "../debug.js";
// Landing flat on level ground costs more — see FLAT_LANDING_* and
// ../logic/health.js.
import { MELON_MAX_HEALTH } from "../constants/index.js";
import { ImpactDamage } from "../logic/health.js";
import { IsPadProtected } from "./jump-pad.js";

/**
 * @param {number} slot @param {import("../kart-registry.js").Kart} kart
 * @param {{ x: number, y: number, z: number }} impactDelta the velocity change physics forced this tick
 */
export function ApplyImpactDamage(slot, kart, impactDelta) {
    const impactSpeed = Math.hypot(impactDelta.x, impactDelta.y, impactDelta.z);
    const { damage, flatLanding } = ImpactDamage(impactDelta, kart.floorNormalZ);
    DamageKart(slot, kart, damage, `impact ${impactSpeed.toFixed(0)} u/s${flatLanding ? " (flat landing)" : ""}`);
}

/**
 * Impact and wall-bounce damage. None on a jump pad or flying off one (see
 * IsPadProtected) — the attack boost's cost and melon_break triggers still apply.
 * @param {number} slot @param {import("../kart-registry.js").Kart} kart @param {number} damage @param {string} reason
 */
export function DamageKart(slot, kart, damage, reason) {
    if (IsPadProtected(kart)) {
        Debug(`slot ${slot}: ${reason} -> no damage (jump pad)`);
        return;
    }
    kart.health -= damage;
    Debug(`slot ${slot}: ${reason} -> ${damage.toFixed(0)} dmg, health ${kart.health.toFixed(0)}/${MELON_MAX_HEALTH}`);
}
