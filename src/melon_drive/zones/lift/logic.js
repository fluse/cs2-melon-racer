// Pure lift-zone rules — no cs_script import, so it's unit-testable in Node
// (see test/lift-zone.test.mjs). Everything a lift zone changes about wall
// bounces and wall jumps is decided here, in one place: drive.js and jump.js
// just read the WallRules they're handed.
import {
    WALL_BOUNCE_UP_SPEED,
    WALL_JUMP_COOLDOWN,
    LIFT_ZONE_UP_SPEED,
    LIFT_ZONE_NAME_PATTERN,
    LIFT_ZONE_MIN_BOUNCE_SPEED,
    LIFT_ZONE_WALL_JUMP_COOLDOWN,
    LIFT_ZONE_JUMP_BUFFER,
} from "../../constants/index.js";

/**
 * @typedef {{
 *   inLift: boolean,
 *   bounceUpSpeed: number, // upward kick of a wall bounce (u/s)
 *   minBounceSpeed: number, // a bounce leaves the wall at least this fast (u/s), 0 = no minimum
 *   wallJumpCooldown: number, // seconds between two wall jumps
 *   freeWallJumps: boolean, // wall jumps cost no charge, are full strength, may follow a bounce at once
 *   jumpBuffer: number, // seconds a jump press before touching a wall still counts, 0 = none
 * }} WallRules
 */

/**
 * The wall bounce / wall jump rules for a melon, given the kick of the
 * strongest lift zone it's in (undefined = not in one).
 * @param {number | undefined} liftUpSpeed
 * @returns {WallRules}
 */
export function WallRules(liftUpSpeed) {
    if (liftUpSpeed === undefined) {
        return {
            inLift: false,
            bounceUpSpeed: WALL_BOUNCE_UP_SPEED,
            minBounceSpeed: 0,
            wallJumpCooldown: WALL_JUMP_COOLDOWN,
            freeWallJumps: false,
            jumpBuffer: 0,
        };
    }
    return {
        inLift: true,
        // A lift zone never kicks weaker than outside one.
        bounceUpSpeed: Math.max(WALL_BOUNCE_UP_SPEED, liftUpSpeed),
        minBounceSpeed: LIFT_ZONE_MIN_BOUNCE_SPEED,
        wallJumpCooldown: LIFT_ZONE_WALL_JUMP_COOLDOWN,
        freeWallJumps: true,
        jumpBuffer: LIFT_ZONE_JUMP_BUFFER,
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
