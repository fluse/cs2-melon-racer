// Pure jump rules — ground jump, wall jump and the wall-jump charge — no
// cs_script import, so they're unit-testable in Node (see
// test/movement/jump-logic.test.mjs). movement/jump/jump.js applies them; whether the
// melon is on the ground or at a wall comes from movement/contact/. See the
// JUMP_SPEED / WALL_PROBE_DIRECTIONS comments in movement/jump/constants.js
// for the design.
import {
    WALL_JUMP_WINDOW,
    WALL_JUMP_COOLDOWN,
    WALL_JUMP_UP_SPEED,
    WALL_JUMP_PUSH_SPEED,
    WALL_JUMP_SAME_WALL_DOT,
    WALL_JUMP_CHARGES,
    WALL_JUMP_RECHARGE_SECONDS,
    WALL_JUMP_RATING_SPEED_MULTIPLIER,
    WALL_JUMP_PERFECT_UP_MULTIPLIER,
    BOUNCE_RATINGS,
    WALL_JUMP_APPROACH_MEMORY,
} from "../../constants/index.js";
import { WallAngleFactor, GetBounceRating } from "../wall-bounce/logic.js";

/**
 * Whether a jump press right now is a ground jump: on the ground, and it's
 * a new ground contact since the last jump — touching down is what resets
 * the jump, no cooldown.
 * @param {{ grounded: boolean, lastGroundedTime?: number, lastJumpTime?: number }} s
 */
export function CanGroundJump({ grounded, lastGroundedTime, lastJumpTime }) {
    if (!grounded) {
        return false;
    }
    return lastJumpTime === undefined || (lastGroundedTime !== undefined && lastGroundedTime > lastJumpTime);
}

/**
 * The wall-jump charges (0..WALL_JUMP_CHARGES, fractional while one is
 * refilling) after `dt` seconds of refilling — one after the other,
 * WALL_JUMP_RECHARGE_SECONDS each.
 * @param {number} charges @param {number} dt
 */
export function RechargeWallJump(charges, dt) {
    return Math.min(WALL_JUMP_CHARGES, charges + Math.max(0, dt) / WALL_JUMP_RECHARGE_SECONDS);
}

/**
 * The charges left after one wall jump: one whole charge used. The one that
 * was refilling keeps its progress.
 * @param {number} charges
 */
export function WallJumpChargeAfter(charges) {
    return Math.max(0, charges - 1);
}

/**
 * Whether a jump press right now is a wall jump.
 * @param {Parameters<typeof WallJumpBlockReason>[0]} s
 */
export function CanWallJump(s) {
    return WallJumpBlockReason(s) === null;
}

/**
 * Why a jump press right now is *not* a wall jump, or null if it is one —
 * the collision debug log prints this.
 * @param {{
 *   now: number,
 *   grounded: boolean,
 *   wallContact?: { time: number, normal: { x: number, y: number } },
 *   lastWallJump?: { time: number, normal: { x: number, y: number } },
 *   lastGroundedTime?: number,
 *   charge: number, // wall jumps charged, see WALL_JUMP_CHARGES — at least one whole one needed
 *   cooldown?: number, // WALL_JUMP_COOLDOWN, shorter in a lift zone
 *   window?: number, // WALL_JUMP_WINDOW, longer in a lift zone
 *   bounceTiming?: boolean, // a wall bounce's jump-timing window is still open — this press is its timing, not a wall jump
 * }} s
 */
export function WallJumpBlockReason({ now, grounded, wallContact, lastWallJump, lastGroundedTime, charge, cooldown = WALL_JUMP_COOLDOWN, window = WALL_JUMP_WINDOW, bounceTiming = false }) {
    if (grounded) {
        return "on the ground";
    }
    if (bounceTiming) {
        return "counts as the wall bounce's jump timing (WALL_BOUNCE_PERFECT_JUMP_WINDOW still open)";
    }
    if (!wallContact) {
        return "no wall contact yet";
    }
    if (now - wallContact.time > window) {
        return `not at a wall (last there ${(now - wallContact.time).toFixed(3)}s ago > ${window}s)`;
    }
    if (charge < 1) {
        return `no wall jump charged (${charge.toFixed(2)} of ${WALL_JUMP_CHARGES})`; // wait for one to refill
    }
    if (!lastWallJump) {
        return null;
    }
    if (now - lastWallJump.time < cooldown) {
        return `cooldown (${(now - lastWallJump.time).toFixed(2)}s since the last wall jump < ${cooldown}s)`;
    }
    if (lastGroundedTime !== undefined && lastGroundedTime > lastWallJump.time) {
        return null; // touched ground since — any wall is fresh again
    }
    const sameWall =
        wallContact.normal.x * lastWallJump.normal.x + wallContact.normal.y * lastWallJump.normal.y > WALL_JUMP_SAME_WALL_DOT;
    return sameWall ? "same wall as the last wall jump (touch ground or another wall first)" : null;
}

/**
 * Velocity right after a wall jump (always full strength): speed along the
 * wall is kept, the part across it points away from the wall at
 * WALL_JUMP_PUSH_SPEED (or faster, if it already was — e.g. just after a
 * wall bounce), plus WALL_JUMP_UP_SPEED up (the caller keeps a faster
 * upward speed the melon already has, see TryWallJump).
 * @param {{ x: number, y: number }} v current horizontal velocity @param {{ x: number, y: number }} n wall normal (horizontal, unit length, pointing away from the wall)
 */
export function WallJumpVelocity(v, n) {
    const across = v.x * n.x + v.y * n.y;
    const alongX = v.x - across * n.x;
    const alongY = v.y - across * n.y;
    const away = Math.max(across, WALL_JUMP_PUSH_SPEED);
    return { x: alongX + away * n.x, y: alongY + away * n.y, z: WALL_JUMP_UP_SPEED };
}

/**
 * The angle a wall jump came at the wall, rated like a wall bounce. By the
 * time of the press physics has usually stopped the melon against the wall
 * already, so of the velocities given (this tick's, last tick's commanded,
 * the one before) whichever heads most squarely into the wall counts. None
 * heading into it at all (only along it, or already away): 90°, grazing.
 * incomingSpeed is that velocity's horizontal speed — what a bonus builds on
 * (see WallJumpBoostedVelocity).
 * @param {Array<{ x: number, y: number } | undefined>} velocities
 * @param {{ x: number, y: number }} n wall normal (horizontal, unit length, pointing away from the wall)
 * @returns {{ angle: number, angleFactor: number, rating: typeof BOUNCE_RATINGS[number], incomingSpeed: number }}
 */
export function WallJumpAngle(velocities, n) {
    const best = MostHeadOn(velocities, n);
    const bestInto = best ? HeadOnRatio(best, n) : 0; // cos(angle)
    const incomingSpeed = best ? Math.hypot(best.x, best.y) : 0;
    const angle = (Math.acos(Math.min(1, bestInto)) * 180) / Math.PI;
    const angleFactor = WallAngleFactor(angle);
    return { angle, angleFactor, rating: GetBounceRating(angleFactor), incomingSpeed };
}

/**
 * A rated wall jump's horizontal velocity: with a bonus (multiplier > 1) it
 * works like a bounce — the full speed the melon came in with (not what's
 * left after the wall stopped it), times the multiplier, in the plain wall
 * jump's direction (away from the wall, along it). Never slower than the
 * plain jump × multiplier. Without a bonus the plain jump stays as it is.
 * @param {{ x: number, y: number }} jump the plain wall jump's horizontal velocity (WallJumpVelocity)
 * @param {number} incomingSpeed see WallJumpAngle @param {number} multiplier see WallJumpRatingMultipliers
 */
export function WallJumpBoostedVelocity(jump, incomingSpeed, multiplier) {
    const plain = Math.hypot(jump.x, jump.y);
    if (multiplier <= 1 || plain <= 0) {
        return { x: jump.x, y: jump.y };
    }
    const scale = (Math.max(plain, incomingSpeed) * multiplier) / plain;
    return { x: jump.x * scale, y: jump.y * scale };
}

/**
 * Speed and upward multipliers a wall jump's rating earns (see
 * WALL_JUMP_RATING_SPEED_MULTIPLIER).
 * @param {typeof BOUNCE_RATINGS[number]} rating
 */
export function WallJumpRatingMultipliers(rating) {
    const table = /** @type {Record<string, number>} */ (WALL_JUMP_RATING_SPEED_MULTIPLIER);
    return {
        speed: table[rating.label] ?? 1,
        up: rating === BOUNCE_RATINGS[0] ? WALL_JUMP_PERFECT_UP_MULTIPLIER : 1,
    };
}

/**
 * cos of the angle between a horizontal velocity and the way into a wall
 * (1 = head-on, 0 = along it, below 0 = away from it).
 * @param {{ x: number, y: number }} v @param {{ x: number, y: number }} n wall normal, pointing away from the wall
 */
function HeadOnRatio(v, n) {
    const speed = Math.hypot(v.x, v.y);
    return speed < 1 ? -Infinity : -(v.x * n.x + v.y * n.y) / speed;
}

/**
 * Of the velocities given, the one heading most squarely into the wall —
 * undefined if none heads into it at all.
 * @template {{ x: number, y: number }} V
 * @param {Array<V | undefined>} velocities @param {{ x: number, y: number }} n
 * @returns {V | undefined}
 */
export function MostHeadOn(velocities, n) {
    /** @type {V | undefined} */
    let best = undefined;
    for (const v of velocities) {
        if (v && HeadOnRatio(v, n) > 0 && (!best || HeadOnRatio(v, n) > HeadOnRatio(best, n))) {
            best = v;
        }
    }
    return best;
}

/**
 * The approach remembered with a wall contact (see WALL_JUMP_APPROACH_MEMORY):
 * a contact that continues the previous one (that wall, last seen within
 * WALL_JUMP_WINDOW) keeps its approach and start time, unless one of this
 * tick's velocities heads in more squarely; a new contact starts from them.
 * @param {{ time: number, normal: { x: number, y: number }, approach?: { x: number, y: number }, approachTime?: number } | undefined} previous kart.lastWallContact
 * @param {number} now @param {{ x: number, y: number }} n this contact's wall normal
 * @param {Array<{ x: number, y: number } | undefined>} velocities this tick's, last tick's and the one before's
 * @returns {{ approach?: { x: number, y: number }, approachTime: number }}
 */
export function WallApproach(previous, now, n, velocities) {
    const continues =
        previous !== undefined &&
        now - previous.time <= WALL_JUMP_WINDOW &&
        previous.normal.x * n.x + previous.normal.y * n.y > WALL_JUMP_SAME_WALL_DOT;
    const kept = continues ? previous.approach : undefined;
    const best = MostHeadOn([kept, ...velocities], n);
    return {
        approach: best ? { x: best.x, y: best.y } : undefined,
        approachTime: continues && previous.approachTime !== undefined ? previous.approachTime : now,
    };
}

/**
 * The remembered approach if it's still recent enough to count.
 * @param {{ approach?: { x: number, y: number }, approachTime?: number }} contact @param {number} now
 */
export function FreshApproach(contact, now) {
    return contact.approachTime !== undefined && now - contact.approachTime <= WALL_JUMP_APPROACH_MEMORY ? contact.approach : undefined;
}
