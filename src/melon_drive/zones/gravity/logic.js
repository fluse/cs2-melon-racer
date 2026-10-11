// Gravity zones (GRAVITY_ZONE_* in zones/gravity/constants.js). Pure rules,
// no cs_script import; movement/driving/drive.js applies them
// (test/zones/gravity-zone.test.mjs).
import { GRAVITY_ZONE_PERCENT, GRAVITY_ZONE_NAME_PATTERN, GRAVITY_ZONE_MAX_ROLL_DECEL } from "./constants.js";

/** @typedef {{ gravity: number, roll: number }} GravityZone factors of GRAVITY and of the speed lost while rolling (1 = normal) */

/**
 * A zone's factors, from its trigger name (see GRAVITY_ZONE_NAME_PATTERN),
 * else GRAVITY_ZONE_PERCENT for both.
 * @param {string} triggerName @returns {GravityZone}
 */
export function GravityZoneFromName(triggerName) {
    const match = GRAVITY_ZONE_NAME_PATTERN.exec(triggerName.trim());
    const gravity = (match ? Number(match[1]) : GRAVITY_ZONE_PERCENT) / 100;
    const roll = match?.[2] !== undefined ? Number(match[2]) / 100 : gravity;
    return { gravity, roll };
}

/**
 * The horizontal velocity after this tick's rolling loss is scaled by `roll`:
 * physics took the melon from `last` (what we commanded) down to `current`;
 * of that loss only `roll` stays (0: none, 1: all of it, 2: twice as much),
 * in the direction physics left it moving. A loss faster than
 * GRAVITY_ZONE_MAX_ROLL_DECEL is a hit, not rolling — left as it is.
 * @param {{ x: number, y: number }} current @param {{ x: number, y: number }} last
 * @param {number} roll @param {number} dt
 */
export function KeepRollingSpeed(current, last, roll, dt) {
    const speed = Math.hypot(current.x, current.y);
    const loss = Math.hypot(last.x, last.y) - speed;
    if (roll === 1 || speed <= 0 || loss <= 0 || loss > GRAVITY_ZONE_MAX_ROLL_DECEL * dt) {
        return current;
    }
    const scale = Math.max(0, speed + loss - loss * roll) / speed;
    return { x: current.x * scale, y: current.y * scale };
}
