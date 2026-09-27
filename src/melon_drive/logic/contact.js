// Pure ground/wall contact and wall-jump rules — no cs_script import, so
// it's unit-testable in Node (see test/contact.test.mjs). kart-physics.js
// runs the traces and feeds the results in here. See the JUMP_COOLDOWN /
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
 * Whether a jump press right now is a wall jump.
 * @param {{
 *   now: number,
 *   grounded: boolean,
 *   wallContact?: { time: number, normal: { x: number, y: number } },
 *   lastWallJump?: { time: number, normal: { x: number, y: number } },
 *   lastGroundedTime?: number,
 * }} s
 */
export function CanWallJump({ now, grounded, wallContact, lastWallJump, lastGroundedTime }) {
    if (grounded || !wallContact || now - wallContact.time > WALL_JUMP_WINDOW) {
        return false;
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
 * Velocity right after a wall jump: speed along the wall is kept, the part
 * across it points away from the wall at WALL_JUMP_PUSH_SPEED (or faster, if
 * it already was — e.g. just after a wall bounce), plus WALL_JUMP_UP_SPEED up.
 * @param {{ x: number, y: number }} v current horizontal velocity @param {{ x: number, y: number }} n wall normal (horizontal, unit length, pointing away from the wall)
 */
export function WallJumpVelocity(v, n) {
    const across = v.x * n.x + v.y * n.y;
    const alongX = v.x - across * n.x;
    const alongY = v.y - across * n.y;
    const away = Math.max(across, WALL_JUMP_PUSH_SPEED);
    return { x: alongX + away * n.x, y: alongY + away * n.y, z: WALL_JUMP_UP_SPEED };
}
