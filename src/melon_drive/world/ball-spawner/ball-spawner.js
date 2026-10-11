// Spawning balls (see world/ball-spawner/constants.js): every tick the balls
// past their lifetime are removed, and when the next one is due — and fewer
// than BALL_SPAWNER_MAX_BALLS are alive — a fresh copy of the ball template
// is put at a spawn point. When it's full, the due ball is skipped and the
// next one gets a new random delay, so they stay irregular.
import { Instance } from "cs_script/point_script";
import { BALL_SPAWNER_TEMPLATE_NAME, BALL_SPAWNER_SPAWN_NAME, BALL_SPAWNER_LIFETIME } from "../../constants/index.js";
import { SpawnFromTemplate } from "../../fx/particles.js";
import { BallSpawnDelay, ShouldSpawnBall, BallSpawnPosition } from "./logic.js";

/** @typedef {import("cs_script/point_script").Entity} Entity */

/** Every spawned ball still around, and when it's removed. @type {{ ball: Entity, removeAt: number }[]} */
export const spawnedBalls = [];
let nextSpawnTime = -Infinity;
let warned = false;

/** Forgets the balls and the timer (a round restart removed them anyway). */
export function ResetBallSpawner() {
    spawnedBalls.length = 0;
    nextSpawnTime = -Infinity;
}

/** After a hot reload: the balls spawned before it, so they're still removed in time. @param {{ ball: Entity, removeAt: number }[] | undefined} balls */
export function RestoreSpawnedBalls(balls) {
    for (const entry of balls ?? []) {
        if (entry.ball.IsValid() && !spawnedBalls.includes(entry)) {
            spawnedBalls.push(entry);
        }
    }
}

/** Every tick: old balls removed, a new one spawned when it's due. @param {number} now */
export function UpdateBallSpawner(now) {
    for (let i = spawnedBalls.length - 1; i >= 0; i--) {
        const { ball, removeAt } = spawnedBalls[i];
        if (!ball.IsValid()) {
            spawnedBalls.splice(i, 1);
        } else if (now >= removeAt) {
            ball.Remove();
            spawnedBalls.splice(i, 1);
        }
    }
    if (now < nextSpawnTime) {
        return;
    }
    const spawn = ShouldSpawnBall(now, nextSpawnTime, spawnedBalls.length);
    nextSpawnTime = now + BallSpawnDelay(Math.random());
    if (spawn) {
        SpawnBall(now);
    }
}

/** A ball at a random spawn point (none in the map: nothing). @param {number} now */
function SpawnBall(now) {
    const points = Instance.FindEntitiesByName(BALL_SPAWNER_SPAWN_NAME);
    if (points.length === 0) {
        return;
    }
    const point = points[Math.floor(Math.random() * points.length)];
    const position = BallSpawnPosition(point.GetAbsOrigin(), Math.random(), Math.random());
    // Said in the console once, not every few seconds: a spawn point without a working template.
    const spawned = SpawnFromTemplate(BALL_SPAWNER_TEMPLATE_NAME, position, undefined, { warn: !warned });
    if (spawned.length === 0) {
        warned = true;
        return;
    }
    for (const ball of spawned) {
        // ForceSpawn keeps the template's Hammer offset: put it right on the spawn point.
        ball.Teleport({ position, velocity: { x: 0, y: 0, z: 0 } });
        spawnedBalls.push({ ball, removeAt: now + BALL_SPAWNER_LIFETIME });
    }
}
