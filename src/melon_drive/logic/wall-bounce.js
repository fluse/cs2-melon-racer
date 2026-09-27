// Pure wall-bounce math — no cs_script import, so it's unit-testable in
// Node (see test/wall-bounce.test.mjs). kart-physics.js does the engine side
// (detecting the wall normal via traces, applying the velocity, debug draws)
// and calls into these for the numbers. See "Wall bounce — speed for health"
// in GAMEPLAY.md for the design.
import {
    WALL_BOUNCE_OPTIMAL_ANGLE,
    WALL_BOUNCE_ANGLE_FALLOFF,
    WALL_BOUNCE_BASE_RESTITUTION,
    WALL_BOUNCE_PEAK_MULTIPLIER,
    WALL_BOUNCE_PERFECT_JUMP_WINDOW,
    WALL_BOUNCE_PERFECT_JUMP_MULTIPLIER,
    WALL_IMPACT_DAMAGE_THRESHOLD,
    WALL_IMPACT_DAMAGE_SCALE,
    WALL_BOUNCE_DAMAGE_PER_SPEED,
    BOUNCE_RATINGS,
    WALL_CONTACT_DISTANCE,
    WALL_CONTACT_MIN_STOP,
} from "../constants.js";

/**
 * Whether a wall the traces found is really the thing the melon just hit:
 * it must be close enough to be touching (within WALL_CONTACT_DISTANCE of
 * the melon's center), and the impact must have actually stopped most of
 * the melon's speed into that wall (WALL_CONTACT_MIN_STOP). Without this, a
 * landing or ceiling bump in a small room bounced the melon off whichever
 * wall happened to lie ahead within trace range.
 * @param {{ x: number, y: number }} origin the melon's center now
 * @param {{ x: number, y: number }} hitPoint where the trace hit the wall
 * @param {{ x: number, y: number }} n the wall's horizontal, unit-length normal
 * @param {{ x: number, y: number }} incoming commanded velocity before the impact
 * @param {{ x: number, y: number }} current the melon's actual velocity now
 */
export function IsWallContact(origin, hitPoint, n, incoming, current) {
    const gap = (origin.x - hitPoint.x) * n.x + (origin.y - hitPoint.y) * n.y;
    if (gap > WALL_CONTACT_DISTANCE) {
        return false;
    }
    const intoBefore = -(incoming.x * n.x + incoming.y * n.y);
    if (intoBefore <= 0) {
        return false; // wasn't heading into this wall at all
    }
    const intoAfter = -(current.x * n.x + current.y * n.y);
    return (intoBefore - intoAfter) / intoBefore >= WALL_CONTACT_MIN_STOP;
}

/**
 * 0..1 — how close a wall hit's angle (degrees from the wall normal, 0 =
 * head-on) is to WALL_BOUNCE_OPTIMAL_ANGLE. Shared by the bounce itself and
 * the prediction line, so both always agree.
 * @param {number} angle
 */
export function WallAngleFactor(angle) {
    return Math.max(0, 1 - Math.abs(angle - WALL_BOUNCE_OPTIMAL_ANGLE) / WALL_BOUNCE_ANGLE_FALLOFF);
}

/** @param {number} angleFactor */
export function GetBounceRating(angleFactor) {
    for (const r of BOUNCE_RATINGS) {
        if (angleFactor >= r.minAngleFactor) {
            return r;
        }
    }
    return BOUNCE_RATINGS[BOUNCE_RATINGS.length - 1];
}

/**
 * How well a jump was timed against a wall hit: 1 for the exact same tick,
 * fading linearly to 0 at WALL_BOUNCE_PERFECT_JUMP_WINDOW seconds either way.
 * @param {number} secondsApart
 */
export function JumpTimingFactor(secondsApart) {
    return Math.max(0, 1 - Math.abs(secondsApart) / WALL_BOUNCE_PERFECT_JUMP_WINDOW);
}

/** @param {number} jumpFactor */
export function JumpMultiplier(jumpFactor) {
    return 1 + (WALL_BOUNCE_PERFECT_JUMP_MULTIPLIER - 1) * jumpFactor;
}

/**
 * Of last tick's and the tick before's commanded velocity, whichever still
 * heads more squarely into the wall — a collision often plays out over two
 * ticks, so the most recent one may already be half-deflected.
 * @template {{ x: number, y: number }} V
 * @param {V} last @param {V | undefined} prev @param {{ x: number, y: number }} n
 * @returns {V}
 */
export function PickIncomingVelocity(last, prev, n) {
    if (!prev) {
        return last;
    }
    /** @param {{ x: number, y: number }} v */
    const intoRatio = (v) => {
        const s = Math.hypot(v.x, v.y);
        return s < 1 ? -Infinity : -(v.x * n.x + v.y * n.y) / s;
    };
    return intoRatio(prev) > intoRatio(last) ? prev : last;
}

/**
 * Reflects a horizontal velocity off a wall and scales it by how well the
 * hit was angled and timed (see WALL_BOUNCE_* in constants.js).
 * @param {{ x: number, y: number }} v incoming velocity
 * @param {{ x: number, y: number }} n the wall's horizontal, unit-length normal
 * @param {number} jumpFactor 0..1, see JumpTimingFactor
 * @returns {{ velocity: { x: number, y: number }, angle: number, angleFactor: number, speedGain: number } | null}
 *   null if the melon wasn't actually moving into the wall
 */
export function ReflectOffWall(v, n, jumpFactor) {
    const speed = Math.hypot(v.x, v.y);
    const into = -(v.x * n.x + v.y * n.y); // speed component heading into the wall
    if (into <= 0 || speed < 1) {
        return null;
    }
    // 0 = head-on, 90 = grazing along the wall.
    const angle = (Math.acos(Math.min(1, into / speed)) * 180) / Math.PI;
    const angleFactor = WallAngleFactor(angle);
    const multiplier =
        (WALL_BOUNCE_BASE_RESTITUTION + (WALL_BOUNCE_PEAK_MULTIPLIER - WALL_BOUNCE_BASE_RESTITUTION) * angleFactor) *
        JumpMultiplier(jumpFactor);
    return {
        velocity: {
            x: (v.x + 2 * into * n.x) * multiplier,
            y: (v.y + 2 * into * n.y) * multiplier,
        },
        angle,
        angleFactor,
        speedGain: Math.max(0, speed * multiplier - speed),
    };
}

/**
 * Health a wall bounce costs: the wall's usual impact + speed-gain damage,
 * reduced by how close to the optimal angle it hit — anything the HUD rates
 * as the best rating (PERFECT) is free, one with no angle bonus pays full
 * price. Jump timing only affects the bounce's speed, never its damage.
 * @param {number} impactSpeed @param {number} speedGain @param {number} angleFactor
 */
export function WallBounceDamage(impactSpeed, speedGain, angleFactor) {
    if (GetBounceRating(angleFactor) === BOUNCE_RATINGS[0]) {
        return 0;
    }
    const rawDamage =
        Math.max(0, impactSpeed - WALL_IMPACT_DAMAGE_THRESHOLD) * WALL_IMPACT_DAMAGE_SCALE +
        speedGain * WALL_BOUNCE_DAMAGE_PER_SPEED;
    return rawDamage * (1 - angleFactor);
}
