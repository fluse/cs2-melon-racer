// The boost trail: particle_boost_trail_template's particle effect riding along on a
// melon while ShouldShowBoostTrail (fx/boost-trail/logic.js) says so. Unlike
// the other effects in fx/particles.js it isn't played for a fixed lifetime —
// it runs as long as the boost does, then is stopped so the particles
// already out fade instead of vanishing. Tested in test/fx/boost-trail.test.mjs.
import { SpawnFromTemplate, PlaceAll, StartParticles, StopParticles, RemoveAfter } from "../particles.js";
import { ShouldShowBoostTrail } from "./logic.js";
import { KartMaxSpeed } from "../../movement/momentum/logic.js";
import { BOOST_TRAIL_TEMPLATE_NAME, BOOST_TRAIL_FADE_SECONDS, BOOST_TRAIL_STOP_MARGIN } from "../../constants/index.js";

/**
 * Starts or stops the kart's trail to match its speed and attack boost. Called every tick
 * for a kart whose melon is valid (core/think.js).
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function UpdateBoostTrail(kart) {
    if (kart.boostTrail && kart.boostTrail.melon !== kart.melon) {
        StopBoostTrail(kart); // a new melon entity — the old trail rode on the old one
    }
    const velocity = kart.melon.GetAbsVelocity();
    const horizSpeed = Math.hypot(velocity.x, velocity.y);
    // Measured against the melon's own top speed: speed earned by momentum
    // (MOMENTUM_*) isn't a boost and shows no trail.
    const normalMax = KartMaxSpeed(kart);
    // A PERFECT bounce's speed shows no trail — until that boost is used up
    // (back to normal speed) or the attack boost takes over.
    if (kart.attackBoosting || horizSpeed <= normalMax + BOOST_TRAIL_STOP_MARGIN) {
        kart.perfectBounceBoost = false;
    }
    const show = ShouldShowBoostTrail(kart.boostTrail !== undefined, horizSpeed, kart.breaking || kart.locked, kart.attackBoosting, kart.perfectBounceBoost, normalMax);
    if (show && !kart.boostTrail) {
        StartBoostTrail(kart);
    } else if (!show && kart.boostTrail) {
        StopBoostTrail(kart);
    }
}

/** @param {import("../../core/kart-registry.js").Kart} kart */
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
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function StopBoostTrail(kart) {
    if (!kart.boostTrail) {
        return;
    }
    StopParticles(kart.boostTrail.entities);
    RemoveAfter(kart.boostTrail.entities, BOOST_TRAIL_FADE_SECONDS);
    kart.boostTrail = undefined;
}
