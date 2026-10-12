// Balloon balls (BALLOON_* in world/balloon/constants.js). Pure rules, no
// cs_script import; world/balloon/balloon.js applies them
// (test/world/balloon.test.mjs).
import { BALLOON_MODEL, BALLOON_SINK_SPEED, BALLOON_DRAG } from "./constants.js";

/** @typedef {{ x: number, y: number, z: number }} Vec */

/** Whether an entity with this model is a balloon ball (any case, "\" or "/", with or without "_c"). @param {string} model */
export function IsBalloonModel(model) {
    return model.toLowerCase().replace(/\\/g, "/").replace(/_c$/, "").endsWith(BALLOON_MODEL);
}

/**
 * The velocity to give a balloon for the next tick, from the one physics
 * left it with (`velocity` — knocks and bounces included): air drag takes
 * the speed of a knock away (BALLOON_DRAG), sideways towards standing
 * still, up or down towards sinking at BALLOON_SINK_SPEED; and the
 * engine's gravity for the coming tick (`gravity` × `dt`) is added on top,
 * so what's left after it pulls is that slow sinking — not a fall. On the
 * floor it just rests: physics stops the sinking there.
 * @param {Vec} velocity @param {number} dt @param {number} gravity GRAVITY
 * @returns {Vec}
 */
export function BalloonVelocity(velocity, dt, gravity) {
    const keep = Math.exp(-BALLOON_DRAG * dt);
    return {
        x: velocity.x * keep,
        y: velocity.y * keep,
        z: -BALLOON_SINK_SPEED + (velocity.z + BALLOON_SINK_SPEED) * keep + gravity * dt,
    };
}
