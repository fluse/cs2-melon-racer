// Ball pits (BALL_PIT_* in world/ball-pit/constants.js). Pure rules, no
// cs_script import; world/ball-pit/ball-pit.js applies them
// (test/world/ball-pit.test.mjs).
import { BALL_PIT_RETURN_SPEED, BALL_PIT_DROP_HEIGHT, BALL_PIT_DROP_SPREAD } from "./constants.js";

/** @typedef {{ x: number, y: number, z: number }} Vec */

/**
 * A ball outside its pit, steered back: its horizontal velocity turned
 * towards the pit's middle, at least BALL_PIT_RETURN_SPEED (faster if it
 * already flies that way faster); its vertical velocity is left alone.
 * @param {Vec} position the ball
 * @param {Vec} velocity the ball's
 * @param {Vec} center the pit trigger's origin
 * @returns {Vec}
 */
export function BallReturnVelocity(position, velocity, center) {
    const dx = center.x - position.x, dy = center.y - position.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-3) {
        return { ...velocity };
    }
    const towards = (velocity.x * dx + velocity.y * dy) / distance;
    const speed = Math.max(towards, BALL_PIT_RETURN_SPEED);
    return { x: (dx / distance) * speed, y: (dy / distance) * speed, z: velocity.z };
}

/**
 * Where a ball is dropped back in: BALL_PIT_DROP_HEIGHT above the pit's
 * middle, up to BALL_PIT_DROP_SPREAD off it each way.
 * @param {Vec} center
 * @param {number} randomX 0..1
 * @param {number} randomY 0..1
 * @returns {Vec}
 */
export function BallDropPosition(center, randomX, randomY) {
    return {
        x: center.x + (randomX * 2 - 1) * BALL_PIT_DROP_SPREAD,
        y: center.y + (randomY * 2 - 1) * BALL_PIT_DROP_SPREAD,
        z: center.z + BALL_PIT_DROP_HEIGHT,
    };
}
