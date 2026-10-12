// Rolling a catapult's base (CATAPULT_ROLL_* in world/catapult/constants.js).
// Pure rules, no cs_script import; world/catapult/roll.js applies them
// (test/world/catapult-roll.test.mjs).
import {
    CATAPULT_ROLL_DECEL,
    CATAPULT_ROLL_MAX_DECEL,
    CATAPULT_ROLL_STOP_SPEED,
    CATAPULT_ROLL_BLOCKED_SHARE,
    CATAPULT_ROLL_STEADY_TILT_SPEED,
    CATAPULT_ROLL_MAX_TILT,
    CATAPULT_ROLL_TILT_DAMPING,
} from "./constants.js";

/** @typedef {{ x: number, y: number, z: number }} Vec */
/** @typedef {{ pitch: number, yaw: number, roll: number }} Angles */

/**
 * The velocity to give the base for the next tick, from the one physics left
 * it with (`velocity`) and the one it had after the script's last tick
 * (`last`, null on its first): where it lost horizontal speed to friction
 * (at most CATAPULT_ROLL_MAX_DECEL), it keeps going in its new
 * direction with only CATAPULT_ROLL_DECEL taken off. A hit (a faster
 * loss), a push (a gain), the base about to stop or one that's stuck (it moved
 * less than CATAPULT_ROLL_BLOCKED_SHARE of `last` since then: `travelled`,
 * its horizontal distance, null when unknown) stay as physics made them —
 * the very same object back; up and down are physics' too.
 * @param {Vec} velocity @param {Vec | null} last @param {number} dt
 * @param {number | null} [travelled]
 * @returns {Vec}
 */
export function RollingVelocity(velocity, last, dt, travelled = null) {
    if (!last) {
        return velocity;
    }
    const speed = Math.hypot(velocity.x, velocity.y);
    const lastSpeed = Math.hypot(last.x, last.y);
    const loss = lastSpeed - speed;
    if (lastSpeed < CATAPULT_ROLL_STOP_SPEED || speed <= 0 || loss <= 0 || loss > CATAPULT_ROLL_MAX_DECEL * dt) {
        return velocity;
    }
    if (travelled !== null && travelled < lastSpeed * dt * CATAPULT_ROLL_BLOCKED_SHARE) {
        return velocity;
    }
    const scale = Math.max(0, lastSpeed - CATAPULT_ROLL_DECEL * dt) / speed;
    return { x: velocity.x * scale, y: velocity.y * scale, z: velocity.z };
}

/**
 * Its angles held within CATAPULT_ROLL_MAX_TILT of upright (pitch and roll;
 * yaw stays), or null when they're within it already.
 * @param {Angles} angles @returns {Angles | null}
 */
export function UprightAngles(angles) {
    const Clamp = (/** @type {number} */ a) => Math.max(-CATAPULT_ROLL_MAX_TILT, Math.min(CATAPULT_ROLL_MAX_TILT, Wrap(a)));
    const pitch = Clamp(angles.pitch), roll = Clamp(angles.roll);
    if (pitch === Wrap(angles.pitch) && roll === Wrap(angles.roll)) {
        return null;
    }
    return { pitch, yaw: angles.yaw, roll };
}

/** An angle in -180..180. @param {number} a */
function Wrap(a) {
    return ((((a + 180) % 360) + 360) % 360) - 180;
}

/**
 * Its turning for the next tick: tipping (x, y) dies away at
 * CATAPULT_ROLL_TILT_DAMPING — or stops at once when it was just put back
 * upright (`held`), so it doesn't tip straight back past the limit and get
 * put back every tick, shaking —, turning round (z) stays as it is.
 * @param {Vec} angularVelocity @param {number} dt @param {boolean} [held]
 * @returns {Vec}
 */
export function SteadyAngularVelocity(angularVelocity, dt, held = false) {
    const keep = held ? 0 : Math.exp(-CATAPULT_ROLL_TILT_DAMPING * dt);
    return { x: angularVelocity.x * keep, y: angularVelocity.y * keep, z: angularVelocity.z };
}

/** Whether it's hardly tipping (pitch and roll turning below CATAPULT_ROLL_STEADY_TILT_SPEED). @param {Vec} angularVelocity */
export function IsSteady(angularVelocity) {
    return Math.abs(angularVelocity.x) < CATAPULT_ROLL_STEADY_TILT_SPEED && Math.abs(angularVelocity.y) < CATAPULT_ROLL_STEADY_TILT_SPEED;
}
