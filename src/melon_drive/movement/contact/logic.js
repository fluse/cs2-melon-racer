// Pure ground/wall contact rules — is the melon on the ground, is a wall
// right at it — no cs_script import, so it's unit-testable in Node (see
// test/movement/contact.test.mjs). movement/contact/contact.js runs the traces and
// feeds the results in here; what a jump does with them is
// movement/jump/logic.js.
import {
    GRAVITY,
    FREE_FALL_FRACTION,
    GROUND_NORMAL_MIN_Z,
    GROUND_CONTACT_DISTANCE,
    GROUND_MAX_APPROACH_SPEED,
    WALL_JUMP_CONTACT_RADIUS,
    WALL_JUMP_MAX_APPROACH_SPEED,
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
 * it rests or rolls on cancels a clear part of that. With less gravity
 * (`gravityFactor` below 1: a gravity zone, the physics page) the script
 * cancels part of the pull itself, so the floor's share is smaller and the
 * bar is lowered with it; below ~0.1 a floor can hardly be told from a fall.
 * @param {number} verticalAccel units/sec^2, see VerticalAccel
 * @param {number} [gravityFactor] the share of GRAVITY the melon is pulled with
 */
export function IsSupported(verticalAccel, gravityFactor = 1) {
    return verticalAccel > -GRAVITY + (1 - FREE_FALL_FRACTION) * GRAVITY * Math.min(1, gravityFactor);
}

/**
 * On the ground = held up (IsSupported) by a floor-like surface right
 * underneath: the floor trace's normal (undefined if it found nothing) and
 * how far straight down it hit, its plane within GROUND_CONTACT_DISTANCE of
 * the center, and the melon no longer moving into it (`approachSpeed`, at
 * most GROUND_MAX_APPROACH_SPEED) — support measured a tick before the
 * touchdown, with the floor still a few units below and the melon on its
 * way down onto it, isn't ground yet.
 * @param {boolean} supported @param {number | undefined} floorNormalZ @param {number} floorDistance units straight down to the hit
 * @param {number} [approachSpeed] units/sec into the floor's plane, see FloorApproachSpeed
 */
export function IsGrounded(supported, floorNormalZ, floorDistance, approachSpeed = 0) {
    return (
        supported &&
        floorNormalZ !== undefined &&
        floorNormalZ >= GROUND_NORMAL_MIN_Z &&
        FloorPlaneDistance(floorDistance, floorNormalZ) <= GROUND_CONTACT_DISTANCE &&
        approachSpeed <= GROUND_MAX_APPROACH_SPEED
    );
}

/**
 * How fast the melon moves into the floor's plane (positive = towards it):
 * its velocity against the floor's normal. Rolling along a slope is 0.
 * @param {{ x: number, y: number, z: number }} velocity @param {{ x: number, y: number, z: number }} floorNormal
 */
export function FloorApproachSpeed(velocity, floorNormal) {
    return -(velocity.x * floorNormal.x + velocity.y * floorNormal.y + velocity.z * floorNormal.z);
}

/**
 * Distance from the melon's center to the floor's plane, from the floor
 * trace straight down: on a slope the floor below is further down than the
 * plane is away.
 * @param {number} floorDistance units straight down to the hit @param {number} floorNormalZ
 */
export function FloorPlaneDistance(floorDistance, floorNormalZ) {
    return floorDistance * floorNormalZ;
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
 * as at the melon: WALL_JUMP_CONTACT_RADIUS, plus how far the melon moved
 * *away* from it over the last tick — a melon the wall pushed off during
 * the tick was at it, it's just no longer within the radius. Nothing is
 * added towards the wall: that's a contact still to come (the press waits
 * for it, WALL_JUMP_BUFFER).
 * @param {number} speedIntoWall units/sec towards the wall (negative: moving away)
 * @param {number} dt
 */
export function WallContactReach(speedIntoWall, dt) {
    return WALL_JUMP_CONTACT_RADIUS + Math.max(0, -speedIntoWall) * Math.max(0, dt);
}

/**
 * Whether a wall `gap` units from the melon's center is at the melon: within
 * WallContactReach, and not still moving into it faster than
 * WALL_JUMP_MAX_APPROACH_SPEED (the tick before the touch) — the wall
 * jump's contact test.
 * @param {number} gap center to the wall's plane
 * @param {{ x: number, y: number }} n the wall's horizontal, unit-length normal (pointing away from it)
 * @param {{ x: number, y: number }} velocity the melon's velocity now
 * @param {number} dt
 */
export function IsAtWall(gap, n, velocity, dt) {
    const into = -(velocity.x * n.x + velocity.y * n.y);
    return into <= WALL_JUMP_MAX_APPROACH_SPEED && gap <= WallContactReach(into, dt);
}
