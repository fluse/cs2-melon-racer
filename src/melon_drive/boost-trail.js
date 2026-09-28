// The boost trail: particle_boost_trail_template's particle effect riding along on a
// melon while ShouldShowBoostTrail (logic/boost-trail.js) says so. Unlike
// the other effects in particles.js it isn't played for a fixed lifetime —
// it runs as long as the boost does, then is stopped so the particles
// already out fade instead of vanishing. Tested in test/boost-trail.test.mjs.
import { SpawnFromTemplate, PlaceAll, StartParticles, StopParticles, RemoveAfter } from "./particles.js";
import { ShouldShowBoostTrail } from "./logic/boost-trail.js";
import { BOOST_TRAIL_TEMPLATE_NAME, BOOST_TRAIL_FADE_SECONDS } from "./constants/index.js";

/**
 * Starts or stops the kart's trail to match its speed. Called every tick
 * for a kart whose melon is valid (think.js).
 * @param {import("./kart-registry.js").Kart} kart
 */
export function UpdateBoostTrail(kart) {
    if (kart.boostTrail && kart.boostTrail.melon !== kart.melon) {
        StopBoostTrail(kart); // a new melon entity — the old trail rode on the old one
    }
    const velocity = kart.melon.GetAbsVelocity();
    const show = ShouldShowBoostTrail(kart.boostTrail !== undefined, Math.hypot(velocity.x, velocity.y), kart.breaking || kart.locked);
    if (show && !kart.boostTrail) {
        StartBoostTrail(kart);
    } else if (!show && kart.boostTrail) {
        StopBoostTrail(kart);
    }
}

/** @param {import("./kart-registry.js").Kart} kart */
function StartBoostTrail(kart) {
    const position = kart.melon.GetAbsOrigin();
    // Kept even when nothing spawned (no template in the map): marks the
    // trail as on, so the lookup isn't retried every tick of this boost.
    const entities = SpawnFromTemplate(BOOST_TRAIL_TEMPLATE_NAME, position);
    PlaceAll(entities, position);
    for (const entity of entities) {
        entity.SetParent(kart.melon);
    }
    StartParticles(entities);
    kart.boostTrail = { melon: kart.melon, entities };
}

/**
 * Stops the kart's trail, if it has one: no new particles, the ones out fade
 * over BOOST_TRAIL_FADE_SECONDS, then its entities are removed.
 * @param {import("./kart-registry.js").Kart} kart
 */
export function StopBoostTrail(kart) {
    if (!kart.boostTrail) {
        return;
    }
    StopParticles(kart.boostTrail.entities);
    RemoveAfter(kart.boostTrail.entities, BOOST_TRAIL_FADE_SECONDS);
    kart.boostTrail = undefined;
}
