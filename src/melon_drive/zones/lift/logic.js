// Pure lift-zone rules — no cs_script import, so it's unit-testable in Node
// (see test/zones/lift-zone.test.mjs). Everything a lift zone changes about wall
// bounces and wall jumps is decided here, in one place: drive.js and jump.js
// just read the WallRules they're handed.
import {
    WALL_BOUNCE_UP_SPEED,
    WALL_JUMP_WINDOW,
    WALL_JUMP_UP_SPEED,
    WALL_JUMP_PUSH_SPEED,
    SIDE_VIEW_WALL_JUMP_UP_SPEED,
    SIDE_VIEW_WALL_JUMP_PUSH_SPEED,
    LIFT_ZONE_UP_SPEED,
    LIFT_ZONE_NAME_PATTERN,
    LIFT_ZONE_MIN_BOUNCE_SPEED,
    LIFT_ZONE_WALL_JUMP_WINDOW,
} from "../../constants/index.js";

/**
 * @typedef {{
 *   inLift: boolean,
 *   bounceUpSpeed: number, // upward kick of a wall bounce (u/s)
 *   minBounceSpeed: number, // a bounce leaves the wall at least this fast (u/s), 0 = no minimum
 *   wallJumpWindow: number, // seconds a wall contact stays jumpable
 *   freeWallJumps: boolean, // wall jumps cost no charge, are full strength, may follow a bounce at once
 *   ratedWallJumps: boolean, // wall jumps are rated by angle (boost, PERFECT kick, feedback) — not in lift or side-view zones
 *   wallJumpUpSpeed: number, // a wall jump's upward speed (u/s)
 *   wallJumpPushSpeed: number, // a wall jump's push away from the wall, at least (u/s)
 * }} WallRules
 */

/**
 * The wall bounce / wall jump rules for a melon, given the kick of the
 * strongest lift zone it's in (undefined = not in one) and whether it's in a
 * side-view zone — there wall jumps aren't rated either (a 2D jump & run's
 * walls are jumped at whatever angle the plane allows) but go higher and
 * further (SIDE_VIEW_WALL_JUMP_*), with a lift zone's longer contact window
 * so wall-to-wall jumps chain, and like
 * there they cost no charge (freeWallJumps).
 * @param {number | undefined} liftUpSpeed @param {boolean} [inSideView]
 * @returns {WallRules}
 */
export function WallRules(liftUpSpeed, inSideView = false) {
    if (liftUpSpeed === undefined) {
        return {
            inLift: false,
            bounceUpSpeed: WALL_BOUNCE_UP_SPEED,
            minBounceSpeed: 0,
            wallJumpWindow: inSideView ? LIFT_ZONE_WALL_JUMP_WINDOW : WALL_JUMP_WINDOW,
            freeWallJumps: inSideView,
            ratedWallJumps: !inSideView,
            wallJumpUpSpeed: inSideView ? SIDE_VIEW_WALL_JUMP_UP_SPEED : WALL_JUMP_UP_SPEED,
            wallJumpPushSpeed: inSideView ? SIDE_VIEW_WALL_JUMP_PUSH_SPEED : WALL_JUMP_PUSH_SPEED,
        };
    }
    return {
        inLift: true,
        // A lift zone never kicks weaker than outside one.
        bounceUpSpeed: Math.max(WALL_BOUNCE_UP_SPEED, liftUpSpeed),
        minBounceSpeed: LIFT_ZONE_MIN_BOUNCE_SPEED,
        wallJumpWindow: LIFT_ZONE_WALL_JUMP_WINDOW,
        freeWallJumps: true,
        ratedWallJumps: false,
        wallJumpUpSpeed: WALL_JUMP_UP_SPEED,
        wallJumpPushSpeed: WALL_JUMP_PUSH_SPEED,
    };
}

/**
 * Upward kick of a lift trigger: parsed from a "lift_zone_<speed>" name,
 * else LIFT_ZONE_UP_SPEED.
 * @param {string} triggerName
 */
export function LiftZoneUpSpeed(triggerName) {
    const match = LIFT_ZONE_NAME_PATTERN.exec(triggerName.trim());
    return match ? Number(match[1]) : LIFT_ZONE_UP_SPEED;
}
