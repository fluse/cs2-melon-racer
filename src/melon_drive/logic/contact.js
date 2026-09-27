// Pure ground/wall contact and wall-jump rules — no cs_script import, so
// it's unit-testable in Node (see test/contact.test.mjs). physics/contact.js and physics/jump.js
// runs the traces and feeds the results in here. See the JUMP_SPEED /
// WALL_PROBE_DIRECTIONS comments in constants.js for the design.
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
    WALL_TOUCH_MIN_STOP_SPEED,
    GROUND_LIFTOFF_TIME,
    WALL_CONTACT_MIN_STOP,
} from "../constants.js";

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
 * Whether physics just stopped the melon against a wall: of the speed into
 * it we commanded last tick, at least WALL_CONTACT_MIN_STOP and at least
 * WALL_TOUCH_MIN_STOP_SPEED is gone now. A wall that's merely near (still a
 * few units ahead, or flown past in parallel) leaves that speed untouched.
 * @param {{ x: number, y: number }} n the wall's horizontal, unit-length normal (pointing away from it)
 * @param {{ x: number, y: number }} commanded velocity we set last tick
 * @param {{ x: number, y: number }} actual the melon's velocity now
 */
export function StoppedByWall(n, commanded, actual) {
    const intoBefore = -(commanded.x * n.x + commanded.y * n.y);
    const intoAfter = -(actual.x * n.x + actual.y * n.y);
    const stopped = intoBefore - intoAfter;
    return intoBefore > 0 && stopped >= WALL_TOUCH_MIN_STOP_SPEED && stopped / intoBefore >= WALL_CONTACT_MIN_STOP;
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
 * @param {{
 *   now: number,
 *   grounded: boolean,
 *   wallContact?: { time: number, normal: { x: number, y: number } },
 *   lastWallJump?: { time: number, normal: { x: number, y: number } },
 *   lastGroundedTime?: number,
 *   charge: number,
 * }} s
 */
export function CanWallJump({ now, grounded, wallContact, lastWallJump, lastGroundedTime, charge }) {
    if (grounded || !wallContact || now - wallContact.time > WALL_JUMP_WINDOW) {
        return false;
    }
    if (charge < WALL_JUMP_MIN_CHARGE) {
        return false; // spent — wait for it to refill
    }
    if (!lastWallJump) {
        return true;
    }
    if (now - lastWallJump.time < WALL_JUMP_COOLDOWN) {
        return false;
    }
    if (lastGroundedTime !== undefined && lastGroundedTime > lastWallJump.time) {
        return true; // touched ground since — any wall is fresh again
    }
    const sameWall =
        wallContact.normal.x * lastWallJump.normal.x + wallContact.normal.y * lastWallJump.normal.y > WALL_JUMP_SAME_WALL_DOT;
    return !sameWall;
}

/**
 * Velocity right after a wall jump at `charge` (0..1, see CanWallJump —
 * the jump is that strong): speed along the wall is kept, the part across
 * it points away from the wall at charge × WALL_JUMP_PUSH_SPEED (or faster,
 * if it already was — e.g. just after a wall bounce), plus
 * charge × WALL_JUMP_UP_SPEED up.
 * @param {{ x: number, y: number }} v current horizontal velocity @param {{ x: number, y: number }} n wall normal (horizontal, unit length, pointing away from the wall) @param {number} charge
 */
export function WallJumpVelocity(v, n, charge) {
    const across = v.x * n.x + v.y * n.y;
    const alongX = v.x - across * n.x;
    const alongY = v.y - across * n.y;
    const away = Math.max(across, WALL_JUMP_PUSH_SPEED * charge);
    return { x: alongX + away * n.x, y: alongY + away * n.y, z: WALL_JUMP_UP_SPEED * charge };
}
