// Engine side of jumping: what a jump press does each tick (ground jump,
// wall jump, wall-bounce timing credit) and the wall-jump charge the HUD
// jump bar shows. The rules themselves are in ../logic/contact.js and
// ../logic/wall-bounce.js.
import { Debug } from "../debug.js";
import { CanGroundJump, CanWallJump, WallJumpVelocity, RechargeWallJump, WallJumpChargeAfter } from "../logic/contact.js";
import { JumpTimingFactor, JumpMultiplier } from "../logic/wall-bounce.js";
import { JUMP_SPEED, MAX_SPEED, WALL_TIMING_SPAM_LOCKOUT } from "../constants/index.js";
import { LogJumpPress } from "./jump-debug.js";

/**
 * Records a jump-button press for wall-bounce timing, separately from the
 * normal (ground-contact gated) jump. Anti-spam: a press less than
 * WALL_TIMING_SPAM_LOCKOUT after the previous one locks timing credit for
 * that long, so mashing jump along a wall never counts — only a single,
 * deliberately timed press does.
 * @param {import("../kart-registry.js").Kart} kart @param {number} now
 * @returns {boolean} whether this press counts for wall timing
 */
function RegisterWallTimingPress(kart, now) {
    const previous = kart.lastJumpPressTime;
    kart.lastJumpPressTime = now;
    if (previous !== undefined && now - previous < WALL_TIMING_SPAM_LOCKOUT) {
        kart.wallTimingLockedUntil = now + WALL_TIMING_SPAM_LOCKOUT;
        kart.wallTimingPressTime = undefined; // an earlier press in the same mash doesn't count either
        return false;
    }
    if (now < (kart.wallTimingLockedUntil ?? 0)) {
        return false;
    }
    kart.wallTimingPressTime = now;
    return true;
}

/** How full the wall-jump charge is, 0 (spent) to 1 (full) — what the HUD jump bar shows. @param {{ wallJumpCharge?: number }} kart */
export function GetJumpChargeFraction(kart) {
    return kart.wallJumpCharge ?? 1;
}

/**
 * Everything a jump press does this tick, applied to `v` (the velocity
 * UpdateKart is about to command, modified in place): the ground jump, the
 * wall-bounce timing credit, and the wall jump. Also refills the wall-jump
 * charge every tick, pressed or not.
 * @param {number} slot @param {import("../kart-registry.js").Kart} kart @param {number} now @param {number} dt
 * @param {boolean} grounded see UpdateGrounded @param {boolean} jumpPressed
 * @param {{ x: number, y: number, z: number }} v
 */
export function ApplyJump(slot, kart, now, dt, grounded, jumpPressed, v) {
    // Jump: straight-up force, only with real ground contact (see
    // UpdateGrounded / IsSupported) — no cooldown, touching down again is
    // what resets it (CanGroundJump). In the air at a wall, a wall jump
    // instead (see the end of this block), as strong as its charge.
    // ?? 1: karts carried over a hot reload from before the charge existed.
    kart.wallJumpCharge = RechargeWallJump(kart.wallJumpCharge ?? 1, dt);
    if (jumpPressed) {
        const groundJump = CanGroundJump({ grounded, lastGroundedTime: kart.lastGroundedTime, lastJumpTime: kart.lastJumpTime });
        const timingPress = RegisterWallTimingPress(kart, now);
        LogJumpPress(slot, kart, now, grounded, groundJump, timingPress);
        // The normal jump — gives the upward push.
        if (groundJump) {
            v.z = JUMP_SPEED;
            kart.lastJumpTime = now;
        }
        // Wall timing — independent of the normal jump above (works in the
        // air too), purely about *when* it's pressed.
        // Pressed just *after* a wall bounce whose damage is still pending:
        // if this timing beats whatever press (if any) the bounce already
        // counted, upgrade it — more speed (the speed gain it'll settle
        // damage for grows with it; a perfect angle still makes that free).
        if (timingPress) {
            const pending = kart.pendingBounce;
            if (pending) {
                const lateFactor = JumpTimingFactor(now - pending.time);
                if (lateFactor > pending.jumpFactor) {
                    const ratio = JumpMultiplier(lateFactor) / JumpMultiplier(pending.jumpFactor);
                    const before = Math.hypot(v.x, v.y);
                    v.x *= ratio;
                    v.y *= ratio;
                    const after = Math.hypot(v.x, v.y);
                    pending.speedGain += after - before;
                    pending.jumpFactor = lateFactor;
                    if (kart.lastBounceInfo) {
                        kart.lastBounceInfo.jumpFactor = lateFactor;
                    }
                    kart.speedCap = Math.max(kart.speedCap ?? MAX_SPEED, after);
                }
            }
        }
        // Wall jump — in the air, at (or just off) a wall: push away from
        // it and up, as strong as the charge is full, then the charge drops
        // (so chained wall jumps get weaker). After the bounce-timing
        // upgrade above, so that one's extra speed isn't lost;
        // WallJumpVelocity keeps whichever push away from the wall is
        // stronger. Deliberately does NOT raise kart.speedCap: chained wall
        // jumps used to ratchet the melon ever faster.
        const wallContact = kart.lastWallContact;
        const charge = kart.wallJumpCharge;
        if (
            !groundJump &&
            wallContact &&
            CanWallJump({ now, grounded, wallContact, lastWallJump: kart.lastWallJump, lastGroundedTime: kart.lastGroundedTime, charge })
        ) {
            const jump = WallJumpVelocity({ x: v.x, y: v.y }, wallContact.normal, charge);
            v.x = jump.x;
            v.y = jump.y;
            v.z = jump.z;
            kart.lastWallJump = { time: now, normal: wallContact.normal };
            kart.wallJumpCharge = WallJumpChargeAfter(charge);
            Debug(`wall jump: slot ${slot}, strength ${charge.toFixed(2)}, off wall normal (${wallContact.normal.x.toFixed(2)}, ${wallContact.normal.y.toFixed(2)})`);
        }
    }
}
