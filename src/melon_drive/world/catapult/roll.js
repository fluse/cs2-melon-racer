// Rolling a catapult's base (see world/catapult/constants.js): it rolls on
// when bumped (RollingVelocity) and stays upright (UprightAngles,
// SteadyAngularVelocity); called from world/catapult/catapult.js.
import { RollingVelocity, UprightAngles, SteadyAngularVelocity, IsSteady } from "./roll-logic.js";

/** @typedef {import("cs_script/point_script").Entity} Entity */
/** @typedef {{ velocity: { x: number, y: number, z: number }, origin: { x: number, y: number, z: number } }} RollTick what the base was sent with last tick, and where it was */

/**
 * One tick of a catapult's base: friction given back, kept
 * upright — and left to physics entirely while there's nothing to change
 * (resting, rolling as physics made it, not tipping), so the script doesn't
 * fight its contacts. Returns the tick to pass next time (null after a stall
 * or a reload: start over from what physics has).
 * @param {Entity} base @param {RollTick | null} last @param {number} dt @returns {RollTick | null}
 */
export function RollBase(base, last, dt) {
    if (dt <= 0 || dt > 0.5) {
        return null;
    }
    const origin = base.GetAbsOrigin();
    const physics = base.GetAbsVelocity();
    const travelled = last ? Math.hypot(origin.x - last.origin.x, origin.y - last.origin.y) : null;
    const velocity = RollingVelocity(physics, last?.velocity ?? null, dt, travelled);
    const upright = UprightAngles(base.GetAbsAngles());
    const spin = base.GetAbsAngularVelocity();
    if (velocity === physics && !upright && IsSteady(spin)) {
        return { velocity: physics, origin };
    }
    const angularVelocity = SteadyAngularVelocity(spin, dt, upright !== null);
    base.Move(upright ? { velocity, angularVelocity, angles: upright } : { velocity, angularVelocity });
    return { velocity, origin };
}
