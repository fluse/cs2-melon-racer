// Pure ground/wall contact and wall-jump rules — no cs_script import, so
// it's unit-testable in Node (see test/contact.test.mjs). movement/contact/contact.js and movement/jump/jump.js
// runs the traces and feeds the results in here. See the JUMP_SPEED /
// WALL_PROBE_DIRECTIONS comments in movement/jump/constants.js for the design.
import {
    GRAVITY,
    FREE_FALL_FRACTION,
    GROUND_NORMAL_MIN_Z,
    WALL_JUMP_WINDOW,
    WALL_JUMP_COOLDOWN,
    WALL_JUMP_UP_SPEED,
    WALL_JUMP_PUSH_SPEED,
    WALL_JUMP_SAME_WALL_DOT,
    WALL_JUMP_CHARGE_COST,
    WALL_JUMP_MIN_CHARGE,
    WALL_JUMP_RECHARGE_SECONDS,
    WALL_JUMP_CONTACT_RADIUS,
    GROUND_LIFTOFF_TIME,
} from "../../constants/index.js";

/**
 * The melon's vertical acceleration over the last tick: the vertical
 * velocity physics left it with, compared to the one we commanded.
 * @param {number} commandedVz @param {number} actualVz @param {number} dt
 */
export function VerticalAccel(commandedVz, actualVz, dt) {
    return dt > 0 ? (actualVz - commandedVz) / dt : 0;
}

/**
 * Whether something held the melon up last tick: in free fall gravity
 * takes the full GRAVITY off its vertical velocity every second, anything
 * it rests or rolls on cancels a clear part of that.
 * @param {number} verticalAccel units/sec^2, see VerticalAccel
 */
export function IsSupported(verticalAccel) {
    return verticalAccel > -FREE_FALL_FRACTION * GRAVITY;
}

/**
 * On the ground = held up (IsSupported) by a floor-like surface underneath
 * (the floor trace's normal; undefined if it found nothing).
 * @param {boolean} supported @param {number | undefined} floorNormalZ
 */
export function IsGrounded(supported, floorNormalZ) {
    return supported && floorNormalZ !== undefined && floorNormalZ >= GROUND_NORMAL_MIN_Z;
}

/**
 * Whether the melon is still taking off from a jump (ground or wall, see
 * GROUND_LIFTOFF_TIME) — ground contact measured now doesn't count then.
 * @param {number} now @param {number | undefined} lastJumpTime @param {number | undefined} lastWallJumpTime
 */
export function InLiftoff(now, lastJumpTime, lastWallJumpTime) {
    const last = Math.max(lastJumpTime ?? -Infinity, lastWallJumpTime ?? -Infinity);
    return now - last < GROUND_LIFTOFF_TIME;
}

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
 * How far from the melon's center (to the wall's plane) a wall still counts
 * as at the melon: WALL_JUMP_CONTACT_RADIUS, plus how far the melon gets
 * towards it in one tick — at speed it would otherwise go from outside the
 * radius into the wall and off it again between two ticks.
 * @param {number} speedIntoWall units/sec towards the wall (negative: moving away)
 * @param {number} dt
 */
export function WallContactReach(speedIntoWall, dt) {
    return WALL_JUMP_CONTACT_RADIUS + Math.max(0, speedIntoWall) * Math.max(0, dt);
}

/**
 * Whether a wall `gap` units from the melon's center is at the melon (see
 * WallContactReach) — the wall jump's contact test.
 * @param {number} gap center to the wall's plane
 * @param {{ x: number, y: number }} n the wall's horizontal, unit-length normal (pointing away from it)
 * @param {{ x: number, y: number }} velocity the melon's velocity now
 * @param {number} dt
 */
export function IsAtWall(gap, n, velocity, dt) {
    return gap <= WallContactReach(-(velocity.x * n.x + velocity.y * n.y), dt);
}

/**
 * The wall-jump charge after `dt` seconds of refilling (0..1).
 * @param {number} charge @param {number} dt
 */
export function RechargeWallJump(charge, dt) {
    return Math.min(1, charge + Math.max(0, dt) / WALL_JUMP_RECHARGE_SECONDS);
}

/** The wall-jump charge left after one wall jump. @param {number} charge */
export function WallJumpChargeAfter(charge) {
    return Math.max(0, charge - WALL_JUMP_CHARGE_COST);
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
 *   charge: number,
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
    if (charge < WALL_JUMP_MIN_CHARGE) {
        return `charge spent (${charge.toFixed(2)} < WALL_JUMP_MIN_CHARGE ${WALL_JUMP_MIN_CHARGE})`; // wait for it to refill
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
 * Velocity right after a wall jump at `charge` (0..1, see CanWallJump —
 * the jump is that strong): speed along the wall is kept, the part across
 * it points away from the wall at charge × WALL_JUMP_PUSH_SPEED (or faster,
 * if it already was — e.g. just after a wall bounce), plus
 * charge × WALL_JUMP_UP_SPEED up (the caller keeps a faster upward speed
 * the melon already has, see TryWallJump).
 * @param {{ x: number, y: number }} v current horizontal velocity @param {{ x: number, y: number }} n wall normal (horizontal, unit length, pointing away from the wall) @param {number} charge
 */
export function WallJumpVelocity(v, n, charge) {
    const across = v.x * n.x + v.y * n.y;
    const alongX = v.x - across * n.x;
    const alongY = v.y - across * n.y;
    const away = Math.max(across, WALL_JUMP_PUSH_SPEED * charge);
    return { x: alongX + away * n.x, y: alongY + away * n.y, z: WALL_JUMP_UP_SPEED * charge };
}
