// Pure ground/wall contact rules — is the melon on the ground, is a wall
// right at it — no cs_script import, so it's unit-testable in Node (see
// test/contact.test.mjs). movement/contact/contact.js runs the traces and
// feeds the results in here; what a jump does with them is
// movement/jump/logic.js.
import {
    GRAVITY,
    FREE_FALL_FRACTION,
    GROUND_NORMAL_MIN_Z,
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
