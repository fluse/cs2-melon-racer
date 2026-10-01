// The heal effect: particle_health_template played on the melon as it
// enters a heal zone (hooked up in ../../zones/inputs.js).
import { PlayParticleTemplate } from "../../fx/particles.js";
import { HEAL_PARTICLE_TEMPLATE_NAME, HEAL_PARTICLE_LIFETIME } from "./constants.js";

/**
 * Plays a fresh copy of the heal effect on the melon, parented so it rides
 * along while the melon rolls through the zone. Not for melons that can't
 * heal right now (broken, or locked by the race flow — see ApplyHealing's
 * caller).
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function PlayHealEffect(kart) {
    if (kart.breaking || kart.locked || !kart.melon.IsValid()) {
        return;
    }
    PlayParticleTemplate(HEAL_PARTICLE_TEMPLATE_NAME, kart.melon.GetAbsOrigin(), { lifetime: HEAL_PARTICLE_LIFETIME, parent: kart.melon });
}
