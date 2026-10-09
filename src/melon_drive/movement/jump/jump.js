// Engine side of jumping: what a jump press does each tick (ground jump,
// wall jump, wall-bounce timing credit) and the wall-jump charges the HUD's
// jump icons show. The rules themselves are in ./logic.js (jumps, charge)
// and ../wall-bounce/logic.js (timing); whether the melon is on the ground
// or at a wall comes from ../contact/; what a lift zone changes arrives as
// WallRules (../../zones/lift/logic.js).
import { Debug } from "../../core/debug.js";
import { CanGroundJump, BufferedGroundJump, WallJumpBlockReason, WallJumpVelocity, RechargeWallJump, WallJumpChargeAfter, WallJumpAngle, WallJumpRatingMultipliers, WallJumpBoostedVelocity, FreshApproach } from "./logic.js";
import { JumpTimingFactor, JumpMultiplier, WallTimingPress } from "../wall-bounce/logic.js";
import { KartMaxSpeed } from "../momentum/logic.js";
import { PhysicsFactor } from "../../dev/physics-tuning-logic.js";
import { PlayPerfectSpark } from "../wall-bounce/wall-bounce.js";
import { JUMP_SPEED, GROUND_JUMP_BUFFER, WALL_JUMP_BUFFER, BOUNCE_RATINGS, WALL_JUMP_CHARGES } from "../../constants/index.js";
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
 * Refills the wall-jump charges — every tick, from the top of UpdateKart, so
 * it also fills while the melon stands still, is race-locked or broken (it
 * used to refill only on ticks that got as far as the jump handling).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function RechargeWallJumpCharge(kart, dt) {
    // ?? full: karts carried over a hot reload from before the charge existed.
    kart.wallJumpCharge = RechargeWallJump(kart.wallJumpCharge ?? WALL_JUMP_CHARGES, dt);
}

/**
 * How many wall jumps are charged, 0..WALL_JUMP_CHARGES — fractional while
 * one is refilling. What the HUD's jump icons show.
 * @param {{ wallJumpCharge?: number }} kart
 */
export function GetWallJumpCharges(kart) {
    return kart.wallJumpCharge ?? WALL_JUMP_CHARGES;
}

/**
 * Everything a jump press does this tick, applied to `v` (the velocity
 * UpdateKart is about to command, modified in place): the ground jump, the
 * wall-bounce timing credit, and the wall jump. Also fires a buffered
 * ground or wall jump without a new press. (The charge refills in
 * RechargeWallJumpCharge.)
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} now
 * @param {boolean} grounded see UpdateGrounded @param {boolean} jumpPressed
 * @param {{ x: number, y: number, z: number }} v
 * @param {import("../../zones/lift/logic.js").WallRules} rules see CurrentWallRules
 */
export function ApplyJump(slot, kart, now, grounded, jumpPressed, v, rules) {
    if (!jumpPressed) {
        FireBufferedGroundJump(slot, kart, now, grounded, v);
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
        v.z = JUMP_SPEED * PhysicsFactor("jump"); // scaled by the physics page (dev/physics-tuning.js)
        kart.lastJumpTime = now;
    }
    // Wall timing — independent of the normal jump above (works in the air
    // too), purely about *when* it's pressed.
    const timedBounce = timingPress && UpgradePendingBounce(kart, now, v);
    // Wall jump — after the bounce-timing upgrade, so that one's extra speed
    // isn't lost.
    const blockedBy = groundJump ? "ground jump instead" : TryWallJump(slot, kart, now, grounded, v, rules);
    LogWallJumpVerdict(slot, kart, blockedBy, rules.inLift);
    // Neither a ground nor a wall jump nor a bounce's timing: the press did
    // nothing, so the next one soon after is mashing (see WallTimingPress).
    const didNothing = !groundJump && blockedBy !== null && !timedBounce;
    if (didNothing) {
        kart.lastIdleJumpPressTime = now;
    }
    // Did nothing: if the melon touches down within GROUND_JUMP_BUFFER, it
    // jumps then (FireBufferedGroundJump).
    kart.bufferedGroundJumpTime = didNothing ? now : undefined;
    // In the air and not a wall jump yet: remember the press — the next wall
    // touched (or the wall jump becoming possible) soon after still gets it.
    kart.bufferedWallJumpTime = didNothing && !grounded ? now : undefined;
}

/**
 * A timing press just *after* a wall bounce whose damage is still pending:
 * if this timing beats whatever press (if any) the bounce already counted,
 * upgrade it — more speed (the speed gain it'll settle damage for grows with
 * it; a perfect angle still makes that free).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} now @param {{ x: number, y: number, z: number }} v
 * @returns {boolean} whether it did — the press counted as the bounce's timing
 */
function UpgradePendingBounce(kart, now, v) {
    const pending = kart.pendingBounce;
    if (!pending) {
        return false;
    }
    const lateFactor = JumpTimingFactor(now - pending.time);
    if (lateFactor <= pending.jumpFactor) {
        return false;
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
    kart.speedCap = Math.max(kart.speedCap ?? KartMaxSpeed(kart), after);
    return true;
}

/**
 * A jump pressed in the air shortly *before* touching down (within
 * GROUND_JUMP_BUFFER) is a ground jump on the touchdown — see
 * BufferedGroundJump.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} now @param {boolean} grounded
 * @param {{ x: number, y: number, z: number }} v
 */
function FireBufferedGroundJump(slot, kart, now, grounded, v) {
    const pressed = kart.bufferedGroundJumpTime;
    if (pressed === undefined) {
        return;
    }
    if (now - pressed > GROUND_JUMP_BUFFER) {
        kart.bufferedGroundJumpTime = undefined;
        return;
    }
    if (!BufferedGroundJump({ now, pressTime: pressed, grounded, lastGroundedTime: kart.lastGroundedTime, lastJumpTime: kart.lastJumpTime })) {
        return;
    }
    kart.bufferedGroundJumpTime = undefined;
    kart.bufferedWallJumpTime = undefined; // the press is used up
    v.z = JUMP_SPEED * PhysicsFactor("jump"); // scaled by the physics page (dev/physics-tuning.js)
    kart.lastJumpTime = now;
    if (kart.lastIdleJumpPressTime === pressed) {
        kart.lastIdleJumpPressTime = undefined; // that press did something after all — not mashing
    }
    Debug(`ground jump: slot ${slot} from a press ${(now - pressed).toFixed(3)}s before touching down`);
}

/**
 * A jump pressed shortly *before* a wall jump is possible (within
 * WALL_JUMP_BUFFER — before touching the next wall, or still at the one it
 * last jumped off) fires the wall jump as soon as it is.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} now @param {boolean} grounded
 * @param {{ x: number, y: number, z: number }} v @param {import("../../zones/lift/logic.js").WallRules} rules
 */
function FireBufferedWallJump(slot, kart, now, grounded, v, rules) {
    const pressed = kart.bufferedWallJumpTime;
    if (pressed === undefined) {
        return;
    }
    if (now - pressed > WALL_JUMP_BUFFER) {
        kart.bufferedWallJumpTime = undefined; // too long ago
        return;
    }
    const wallContact = kart.lastWallContact;
    if (wallContact && wallContact.time > pressed && TryWallJump(slot, kart, now, grounded, v, rules) === null) {
        kart.bufferedWallJumpTime = undefined;
        kart.bufferedGroundJumpTime = undefined; // the press is used up
        if (kart.lastIdleJumpPressTime === pressed) {
            kart.lastIdleJumpPressTime = undefined; // that press did something after all — not mashing
        }
        Debug(`wall jump: slot ${slot} from a press ${(now - pressed).toFixed(2)}s before touching the wall`);
    }
}

/**
 * Wall jump, if allowed right now: in the air, at (or just off) a wall, push
 * away from it and up at full strength, using up one of the
 * WALL_JUMP_CHARGES (none left: no wall jump). WallJumpVelocity keeps whichever
 * push away from the wall is stronger. Rated by the angle it came at the
 * wall like a bounce (WallJumpAngle, WALL_JUMP_RATING_SPEED_MULTIPLIER): only
 * (rules.ratedWallJumps — not in a lift or side-view zone) a PERFECT/GOOD one leaves with the speed it came in with times the
 * multiplier, like a bounce (WallJumpBoostedVelocity) — that raises kart.speedCap — a plain wall jump
 * doesn't, chained wall jumps used to ratchet the melon ever faster.
 * Never lowers the melon's upward speed (a jump just after a ground jump,
 * a bounce's kick or a jump pad launch keeps the faster one).
 * While a wall bounce's jump-timing window is open (kart.pendingBounce),
 * the press is that bounce's timing and no wall jump — otherwise every
 * well-timed bounce also used up charge. Not in lift and side-view zones
 * (rules.freeWallJumps): there it costs no charge (none needed either),
 * may follow a bounce at once. No cooldown: the next wall jump needs a new
 * wall contact (WallJumpBlockReason).
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} now @param {boolean} grounded
 * @param {{ x: number, y: number, z: number }} v modified in place @param {import("../../zones/lift/logic.js").WallRules} rules
 * @returns {string | null} why it didn't happen, or null if it did
 */
function TryWallJump(slot, kart, now, grounded, v, rules) {
    const wallContact = kart.lastWallContact;
    const charge = rules.freeWallJumps ? WALL_JUMP_CHARGES : kart.wallJumpCharge;
    const blockedBy = WallJumpBlockReason({
        now,
        grounded,
        wallContact,
        lastWallJump: kart.lastWallJump,
        lastGroundedTime: kart.lastGroundedTime,
        charge,
        window: rules.wallJumpWindow,
        bounceTiming: !rules.freeWallJumps && kart.pendingBounce !== undefined,
    });
    if (!wallContact || blockedBy !== null) {
        return blockedBy;
    }
    const jump = WallJumpVelocity({ x: v.x, y: v.y }, wallContact.normal, rules.wallJumpPushSpeed, rules.wallJumpUpSpeed);
    // In a lift zone the angle doesn't matter — the shaft is climbed, not
    // raced — nor in a side-view zone (2D jump & run): a plain wall jump, no
    // rating, boost or feedback.
    /** @type {ReturnType<typeof WallJumpAngle> | undefined} */
    let rated = undefined;
    let bonus = { speed: 1, up: 1 };
    if (!rules.ratedWallJumps) {
        v.x = jump.x;
        v.y = jump.y;
        v.z = Math.max(v.z, jump.z);
    } else {
        // The approach remembered at the contact's start counts too: a press a
        // tick or two after the touch would otherwise only see the slide along
        // the wall (WALL_JUMP_APPROACH_MEMORY).
        rated = WallJumpAngle([v, kart.lastVelocity, kart.prevLastVelocity, FreshApproach(wallContact, now)], wallContact.normal);
        bonus = WallJumpRatingMultipliers(rated.rating);
        const boosted = WallJumpBoostedVelocity(jump, rated.incomingSpeed, bonus.speed);
        v.x = boosted.x;
        v.y = boosted.y;
        v.z = Math.max(v.z, jump.z * bonus.up);
        if (bonus.speed > 1) {
            kart.speedCap = Math.max(kart.speedCap ?? KartMaxSpeed(kart), Math.hypot(v.x, v.y));
        }
        // Same feedback as a bounce: the bounce panel and speedometer flash
        // (jump timing full — it was jumped), a PERFECT's spark instead of the
        // boost trail.
        kart.lastBounceTime = now;
        kart.lastBounceInfo = { angle: rated.angle, angleFactor: rated.angleFactor, jumpFactor: 1 };
        kart.perfectBounceBoost = rated.rating === BOUNCE_RATINGS[0];
        if (kart.perfectBounceBoost) {
            PlayPerfectSpark(kart);
        }
    }
    kart.lastWallJump = { time: now, normal: wallContact.normal };
    if (!rules.freeWallJumps) {
        kart.wallJumpCharge = WallJumpChargeAfter(charge);
    }
    Debug(`wall jump: slot ${slot}, ${rated ? `${rated.rating.label} ${rated.angle.toFixed(0)}° (×${bonus.speed})` : "not rated"}, charges ${charge.toFixed(2)}${rules.freeWallJumps ? " (lift/side-view zone, free)" : ""}, off wall normal (${wallContact.normal.x.toFixed(2)}, ${wallContact.normal.y.toFixed(2)})`);
    return null;
}
