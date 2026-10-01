// Engine side of jumping: what a jump press does each tick (ground jump,
// wall jump, wall-bounce timing credit) and the wall-jump charge the HUD
// jump bar shows. The rules themselves are in ../logic/contact.js and
// ../logic/wall-bounce.js; what a lift zone changes arrives as WallRules
// (../logic/lift.js).
import { Debug } from "../../core/debug.js";
import { CanGroundJump, WallJumpBlockReason, WallJumpVelocity, RechargeWallJump, WallJumpChargeAfter } from "../contact/logic.js";
import { JumpTimingFactor, JumpMultiplier, WallTimingPress } from "../wall-bounce/logic.js";
import { MomentumMaxSpeed } from "../momentum/logic.js";
import { JUMP_SPEED } from "../../constants/index.js";
import { LogJumpPress, LogWallJumpVerdict } from "../../dev/collision-debug.js";

/**
 * Records a jump-button press for wall-bounce timing, separately from the
 * normal (ground-contact gated) jump. Anti-spam (WallTimingPress): a press
 * soon after one that did nothing locks timing credit, so mashing jump along
 * a wall never counts — a ground or wall jump just before doesn't (see
 * RecordIdlePress for what counts as doing nothing).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} now
 * @returns {boolean} whether this press counts for wall timing
 */
function RegisterWallTimingPress(kart, now) {
    kart.lastJumpPressTime = now; // every press — jump pads buffer on it
    const press = WallTimingPress(now, kart.lastIdleJumpPressTime, kart.wallTimingLockedUntil);
    kart.wallTimingLockedUntil = press.lockedUntil;
    if (press.mashing) {
        kart.wallTimingPressTime = undefined; // an earlier press in the same mash doesn't count either
    }
    if (press.counts) {
        kart.wallTimingPressTime = now;
    }
    return press.counts;
}

/**
 * Refills the wall-jump charge — every tick, from the top of UpdateKart, so
 * it also fills while the melon stands still, is race-locked or broken (it
 * used to refill only on ticks that got as far as the jump handling).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function RechargeWallJumpCharge(kart, dt) {
    // ?? 1: karts carried over a hot reload from before the charge existed.
    kart.wallJumpCharge = RechargeWallJump(kart.wallJumpCharge ?? 1, dt);
}

/** How full the wall-jump charge is, 0 (spent) to 1 (full) — what the HUD jump bar shows. @param {{ wallJumpCharge?: number }} kart */
export function GetJumpChargeFraction(kart) {
    return kart.wallJumpCharge ?? 1;
}

/**
 * Everything a jump press does this tick, applied to `v` (the velocity
 * UpdateKart is about to command, modified in place): the ground jump, the
 * wall-bounce timing credit, and the wall jump. Also fires a buffered wall
 * jump (lift zones) without a new press. (The charge refills in
 * RechargeWallJumpCharge.)
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} now
 * @param {boolean} grounded see UpdateGrounded @param {boolean} jumpPressed
 * @param {{ x: number, y: number, z: number }} v
 * @param {import("../../zones/lift/logic.js").WallRules} rules see CurrentWallRules
 */
export function ApplyJump(slot, kart, now, grounded, jumpPressed, v, rules) {
    if (!jumpPressed) {
        FireBufferedWallJump(slot, kart, now, grounded, v, rules);
        return;
    }
    // Jump: straight-up force, only with real ground contact (see
    // UpdateGrounded / IsSupported) — no cooldown, touching down again is
    // what resets it (CanGroundJump). In the air at a wall, a wall jump
    // instead, as strong as its charge.
    const groundJump = CanGroundJump({ grounded, lastGroundedTime: kart.lastGroundedTime, lastJumpTime: kart.lastJumpTime });
    const timingPress = RegisterWallTimingPress(kart, now);
    LogJumpPress(slot, kart, now, grounded, groundJump, timingPress);
    if (groundJump) {
        v.z = JUMP_SPEED;
        kart.lastJumpTime = now;
    }
    // Wall timing — independent of the normal jump above (works in the air
    // too), purely about *when* it's pressed.
    if (timingPress) {
        UpgradePendingBounce(kart, now, v);
    }
    // Wall jump — after the bounce-timing upgrade, so that one's extra speed
    // isn't lost.
    const blockedBy = groundJump ? "ground jump instead" : TryWallJump(slot, kart, now, grounded, v, rules);
    LogWallJumpVerdict(slot, kart, blockedBy, rules.inLift);
    // Neither a ground nor a wall jump: the press did nothing, so the next
    // one soon after is mashing (see WallTimingPress).
    if (!groundJump && blockedBy !== null) {
        kart.lastIdleJumpPressTime = now;
    }
    // In the air and not a wall jump yet: where there's a jump buffer (lift
    // zones), remember the press — a wall touched soon after still gets it.
    kart.bufferedWallJumpTime = blockedBy !== null && !grounded && rules.jumpBuffer > 0 ? now : undefined;
}

/**
 * A timing press just *after* a wall bounce whose damage is still pending:
 * if this timing beats whatever press (if any) the bounce already counted,
 * upgrade it — more speed (the speed gain it'll settle damage for grows with
 * it; a perfect angle still makes that free).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} now @param {{ x: number, y: number, z: number }} v
 */
function UpgradePendingBounce(kart, now, v) {
    const pending = kart.pendingBounce;
    if (!pending) {
        return;
    }
    const lateFactor = JumpTimingFactor(now - pending.time);
    if (lateFactor <= pending.jumpFactor) {
        return;
    }
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
    kart.speedCap = Math.max(kart.speedCap ?? MomentumMaxSpeed(kart.momentum), after);
}

/**
 * A jump pressed shortly *before* touching a wall (within rules.jumpBuffer,
 * lift zones only) fires the wall jump once the melon touches one.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} now @param {boolean} grounded
 * @param {{ x: number, y: number, z: number }} v @param {import("../../zones/lift/logic.js").WallRules} rules
 */
function FireBufferedWallJump(slot, kart, now, grounded, v, rules) {
    const pressed = kart.bufferedWallJumpTime;
    if (pressed === undefined) {
        return;
    }
    if (now - pressed > rules.jumpBuffer) {
        kart.bufferedWallJumpTime = undefined; // too long ago, or left the lift zone (no buffer outside)
        return;
    }
    const wallContact = kart.lastWallContact;
    if (wallContact && wallContact.time > pressed && TryWallJump(slot, kart, now, grounded, v, rules) === null) {
        kart.bufferedWallJumpTime = undefined;
        if (kart.lastIdleJumpPressTime === pressed) {
            kart.lastIdleJumpPressTime = undefined; // that press did something after all — not mashing
        }
        Debug(`wall jump: slot ${slot} from a press ${(now - pressed).toFixed(2)}s before touching the wall`);
    }
}

/**
 * Wall jump, if allowed right now: in the air, at (or just off) a wall, push
 * away from it and up, as strong as the charge is full, then the charge
 * drops (so chained wall jumps get weaker). WallJumpVelocity keeps whichever
 * push away from the wall is stronger. Deliberately does NOT raise
 * kart.speedCap: chained wall jumps used to ratchet the melon ever faster.
 * Never lowers the melon's upward speed (a jump just after a ground jump,
 * a bounce's kick or a jump pad launch keeps the faster one).
 * While a wall bounce's jump-timing window is open (kart.pendingBounce),
 * the press is that bounce's timing and no wall jump — otherwise every
 * well-timed bounce also used up charge. Not in lift zones
 * (rules.freeWallJumps): there it's always full strength, costs no charge,
 * may follow a bounce at once, and the cooldown is rules.wallJumpCooldown.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} now @param {boolean} grounded
 * @param {{ x: number, y: number, z: number }} v modified in place @param {import("../../zones/lift/logic.js").WallRules} rules
 * @returns {string | null} why it didn't happen, or null if it did
 */
function TryWallJump(slot, kart, now, grounded, v, rules) {
    const wallContact = kart.lastWallContact;
    const charge = rules.freeWallJumps ? 1 : kart.wallJumpCharge;
    const blockedBy = WallJumpBlockReason({
        now,
        grounded,
        wallContact,
        lastWallJump: kart.lastWallJump,
        lastGroundedTime: kart.lastGroundedTime,
        charge,
        cooldown: rules.wallJumpCooldown,
        window: rules.wallJumpWindow,
        bounceTiming: !rules.freeWallJumps && kart.pendingBounce !== undefined,
    });
    if (!wallContact || blockedBy !== null) {
        return blockedBy;
    }
    const jump = WallJumpVelocity({ x: v.x, y: v.y }, wallContact.normal, charge);
    v.x = jump.x;
    v.y = jump.y;
    v.z = Math.max(v.z, jump.z);
    kart.lastWallJump = { time: now, normal: wallContact.normal };
    if (!rules.freeWallJumps) {
        kart.wallJumpCharge = WallJumpChargeAfter(charge);
    }
    Debug(`wall jump: slot ${slot}, strength ${charge.toFixed(2)}${rules.freeWallJumps ? " (lift zone, free)" : ""}, off wall normal (${wallContact.normal.x.toFixed(2)}, ${wallContact.normal.y.toFixed(2)})`);
    return null;
}
