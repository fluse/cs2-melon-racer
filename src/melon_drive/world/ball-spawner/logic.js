// Ball spawner (BALL_SPAWNER_* in world/ball-spawner/constants.js). Pure
// rules, no cs_script import; world/ball-spawner/ball-spawner.js applies them
// (test/world/ball-spawner.test.mjs).
import {
    BALL_SPAWNER_MAX_BALLS,
    BALL_SPAWNER_MIN_INTERVAL,
    BALL_SPAWNER_MAX_INTERVAL,
    BALL_SPAWNER_SPREAD,
} from "./constants.js";

/** @typedef {{ x: number, y: number, z: number }} Vec */

/**
 * Seconds until the next ball: between BALL_SPAWNER_MIN_INTERVAL and
 * BALL_SPAWNER_MAX_INTERVAL, so they come irregularly.
 * @param {number} random 0..1
 */
export function BallSpawnDelay(random) {
    return BALL_SPAWNER_MIN_INTERVAL + random * (BALL_SPAWNER_MAX_INTERVAL - BALL_SPAWNER_MIN_INTERVAL);
}

/**
 * Whether a ball spawns now: its time has come and fewer than
 * BALL_SPAWNER_MAX_BALLS are alive.
 * @param {number} now @param {number} nextSpawnTime @param {number} alive
 */
export function ShouldSpawnBall(now, nextSpawnTime, alive) {
    return now >= nextSpawnTime && alive < BALL_SPAWNER_MAX_BALLS;
}

/**
 * Where a ball appears: the spawn point, up to BALL_SPAWNER_SPREAD off it
 * each way horizontally.
 * @param {Vec} point @param {number} randomX 0..1 @param {number} randomY 0..1
 * @returns {Vec}
 */
export function BallSpawnPosition(point, randomX, randomY) {
    return {
        x: point.x + (randomX * 2 - 1) * BALL_SPAWNER_SPREAD,
        y: point.y + (randomY * 2 - 1) * BALL_SPAWNER_SPREAD,
        z: point.z,
    };
}
