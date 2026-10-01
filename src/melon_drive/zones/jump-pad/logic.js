// Jump pads (JUMP_PAD_* in zones/jump-pad/constants.js). Pure rules, no cs_script
// import; zones/jump-pad/jump-pad.js applies them (test/jump-pad.test.mjs).
import {
    JUMP_PAD_NAME_PATTERN,
    JUMP_PAD_UP_SPEED,
    JUMP_PAD_FORWARD_BOOST,
    JUMP_PAD_MIN_DIRECTION_SPEED,
    JUMP_PAD_BUFFER,
    JUMP_PAD_COOLDOWN,
    JUMP_PAD_LANDING_GRACE,
    JUMP_PAD_MAX_PROTECTED_SECONDS,
} from "./constants.js";
import { GROUND_LIFTOFF_TIME } from "../../movement/jump/constants.js";

/** @typedef {{ up: number, forward: number }} JumpPad upward launch speed, horizontal speed added (units/sec) */
/** @typedef {{ launchTime: number, landedTime?: number }} PadFlight a launch whose damage protection is still on */

/**
 * A pad's launch, from its trigger name (see JUMP_PAD_NAME_PATTERN), else
 * the defaults. @param {string} triggerName @returns {JumpPad}
 */
export function JumpPadFromName(triggerName) {
    const match = JUMP_PAD_NAME_PATTERN.exec(triggerName.trim());
    return {
        up: match ? Number(match[1]) : JUMP_PAD_UP_SPEED,
        forward: match?.[2] !== undefined ? Number(match[2]) : JUMP_PAD_FORWARD_BOOST,
    };
}

/**
 * Whether the melon on a pad launches this tick: a jump press now, or one
 * made at most JUMP_PAD_BUFFER ago that hasn't launched it yet — and not
 * again within JUMP_PAD_COOLDOWN of the last launch.
 * @param {number} now @param {boolean} jumpPressed this tick
 * @param {number | undefined} lastPressTime last jump press @param {number | undefined} lastLaunchTime last pad launch
 */
export function ShouldPadLaunch(now, jumpPressed, lastPressTime, lastLaunchTime) {
    if (lastLaunchTime !== undefined && now - lastLaunchTime < JUMP_PAD_COOLDOWN) {
        return false;
    }
    if (jumpPressed) {
        return true;
    }
    return (
        lastPressTime !== undefined &&
        now - lastPressTime <= JUMP_PAD_BUFFER &&
        (lastLaunchTime === undefined || lastPressTime > lastLaunchTime)
    );
}

/**
 * The velocity right after a launch: `pad.up` upward (a fall is cancelled; a
 * melon already rising faster keeps that), and `pad.forward` more horizontal
 * speed along where it's going — along `lookDir` if it's barely moving.
 * @param {{ x: number, y: number, z: number }} v @param {{ x: number, y: number }} lookDir unit vector
 * @param {JumpPad} pad
 */
export function PadLaunchVelocity(v, lookDir, pad) {
    const speed = Math.hypot(v.x, v.y);
    const dir = speed > JUMP_PAD_MIN_DIRECTION_SPEED ? { x: v.x / speed, y: v.y / speed } : lookDir;
    const launched = speed + pad.forward;
    return { x: dir.x * launched, y: dir.y * launched, z: Math.max(v.z, pad.up) };
}

/**
 * The launch's damage protection this tick, or undefined once it's over:
 * JUMP_PAD_LANDING_GRACE after the first ground contact after taking off
 * (contact within GROUND_LIFTOFF_TIME of the launch is the pad itself), or
 * JUMP_PAD_MAX_PROTECTED_SECONDS after the launch at the latest.
 * @param {PadFlight | undefined} flight @param {number} now @param {number | undefined} lastGroundedTime
 * @returns {PadFlight | undefined}
 */
export function PadFlightAfter(flight, now, lastGroundedTime) {
    if (!flight || now - flight.launchTime > JUMP_PAD_MAX_PROTECTED_SECONDS) {
        return undefined;
    }
    const landedTime =
        flight.landedTime ??
        (lastGroundedTime !== undefined && lastGroundedTime > flight.launchTime + GROUND_LIFTOFF_TIME ? lastGroundedTime : undefined);
    if (landedTime !== undefined && now - landedTime > JUMP_PAD_LANDING_GRACE) {
        return undefined;
    }
    return landedTime === flight.landedTime ? flight : { ...flight, landedTime };
}
