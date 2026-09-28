// Attack boost — speed for health (ATTACK_BOOST_* in constants/attack-boost.js).
// Pure rule, no cs_script import; physics/drive.js applies it
// (test/attack-boost.test.mjs).
import { ATTACK_BOOST_HEALTH_PER_SECOND } from "../constants/index.js";

/**
 * `velocity`'s horizontal part limited to the horizontal speed of
 * `commanded` (what the script set last tick) — drops whatever speed an
 * engine push (knife swing, see ATTACK_PUSH_GUARD_SECONDS) added, keeping
 * the direction and the vertical part.
 * @param {{ x: number, y: number, z: number }} velocity @param {{ x: number, y: number, z: number }} commanded
 */
export function WithoutEnginePush(velocity, commanded) {
    const speed = Math.hypot(velocity.x, velocity.y);
    const allowed = Math.hypot(commanded.x, commanded.y);
    if (speed <= allowed) {
        return velocity;
    }
    const scale = allowed / speed;
    return { x: velocity.x * scale, y: velocity.y * scale, z: velocity.z };
}

/**
 * Whether the boost is on this tick and the health left after paying for
 * it. On whenever attack is held and there's health left — no floor: at 0
 * or below the melon breaks (the caller's job).
 * @param {number} health @param {boolean} attackHeld @param {number} dt
 * @returns {{ boosting: boolean, health: number }}
 */
export function AttackBoost(health, attackHeld, dt) {
    if (!attackHeld || health <= 0) {
        return { boosting: false, health };
    }
    return {
        boosting: true,
        health: health - ATTACK_BOOST_HEALTH_PER_SECOND * dt,
    };
}
