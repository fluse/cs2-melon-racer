// Engine side of jump pads (JUMP_PAD_*): launching a melon off the pad it's
// on when jump is pressed, and the damage protection that follows. The rules
// are in ../logic/jump-pad.js; which pad the melon is on, in zones.js.
import { Debug } from "../../core/debug.js";
import { ShouldPadLaunch, PadLaunchVelocity, PadFlightAfter } from "./logic.js";
import { KartMaxSpeed } from "../../movement/momentum/logic.js";
import { CurrentJumpPad } from "../registry.js";

/**
 * Per tick, before any damage: ends the launch's damage protection once the
 * melon has landed (see PadFlightAfter).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} now
 */
export function UpdatePadFlight(kart, now) {
    kart.padFlight = PadFlightAfter(kart.padFlight, now, kart.lastGroundedTime);
}

/**
 * Whether the melon takes no damage right now: on a jump pad, or flying off
 * one (until shortly after landing).
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function IsPadProtected(kart) {
    return kart.padFlight !== undefined || CurrentJumpPad(kart) !== undefined;
}

/**
 * On a jump pad with a (just) pressed jump: launches the melon — `v` (the
 * velocity UpdateKart is about to command) is replaced in place, after the
 * normal jump handling, so the launch wins over a ground/wall jump.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} now
 * @param {boolean} jumpPressed @param {{ x: number, y: number, z: number }} v
 * @param {{ x: number, y: number }} lookDir
 * @returns {boolean} whether it launched
 */
export function TryPadLaunch(slot, kart, now, jumpPressed, v, lookDir) {
    const pad = CurrentJumpPad(kart);
    if (!pad || !ShouldPadLaunch(now, jumpPressed, kart.lastJumpPressTime, kart.lastPadLaunchTime)) {
        return false;
    }
    const launched = PadLaunchVelocity(v, lookDir, pad);
    v.x = launched.x;
    v.y = launched.y;
    v.z = launched.z;
    kart.lastPadLaunchTime = now;
    // Counts as a jump: the pad still pushing up for a tick isn't ground
    // contact (GROUND_LIFTOFF_TIME), and the next ground jump needs a landing.
    kart.lastJumpTime = now;
    kart.padFlight = { launchTime: now };
    // Faster than the top speed, like a wall-bounce boost — decays at BOOST_DECAY.
    kart.speedCap = Math.max(kart.speedCap ?? KartMaxSpeed(kart), Math.hypot(v.x, v.y));
    Debug(`jump pad: slot ${slot} launched (${launched.z.toFixed(0)} u/s up, ${Math.hypot(v.x, v.y).toFixed(0)} u/s horizontal)`);
    return true;
}
