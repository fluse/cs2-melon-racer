// Per-tick melon driving (UpdateKart): the order everything happens in each
// tick — break/lock handling, contact measurement, impact and wall-bounce
// detection, steering, friction, jump, speed cap. The individual parts live
// in the sibling files; this one wires them together.
import { Instance, CSInputs } from "cs_script/point_script";
import { ApplyBreakCameraZoom } from "../../camera/index.js";
import { VerticalAccel, IsSupported } from "../contact/logic.js";
import { SteerTowards } from "./logic.js";
import { BounceUpVelocity, WithMinSpeed } from "../wall-bounce/logic.js";
import {
    FORWARD_ACCEL,
    REVERSE_ACCEL,
    STRAFE_ACCEL,
    MAX_SPEED,
    COAST_FRICTION,
    STEER_GRIP_RATE,
    STEER_AIR_GRIP_RATE,
    STEER_GRIP_MAX_ANGLE,
    IMPACT_DAMAGE_THRESHOLD,
    MELON_REST_SPEED,
    SETTLE_NUDGE_ANGULAR_SPEED,
    WALL_BOUNCE_ENABLED,
    WALL_BOUNCE_MIN_IMPACT,
    WALL_BOUNCE_COOLDOWN,
    WALL_BOUNCE_PERFECT_JUMP_WINDOW,
    BOOST_DECAY,
    ATTACK_BOOST_ACCEL,
    ATTACK_BOOST_MAX_SPEED,
    ATTACK_PUSH_GUARD_SECONDS,
    GRAVITY,
} from "../../constants/index.js";
import { PhysicsFactor, ExtraGravityDelta, BoostMaxSpeed } from "../../dev/physics-tuning-logic.js";
import { AttackBoost, WithoutEnginePush } from "../attack-boost/logic.js";
import { KnifeGuardActive } from "../attack-boost/knife-guard.js";
import { BaseMaxSpeed, KartMaxSpeed, UpdateMomentum } from "../momentum/logic.js";
import { LogAttackHeld } from "../../dev/attack-debug.js";
import { Debug } from "../../core/debug.js";
import { ApplyJump, RechargeWallJumpCharge, GetWallJumpCharges } from "../jump/jump.js";
import { UpdatePadFlight, TryPadLaunch } from "../../zones/jump-pad/jump-pad.js";
import { UpdateGrounded, UpdateWallContact } from "../contact/contact.js";
import { DrawCollisionDebug } from "../../dev/collision-debug.js";
import { UpdateSpectatorHat } from "../../dev/free-look.js";
import { ApplyImpactDamage } from "../../health/damage/damage.js";
import { DetectWallNormal, ComputeWallBounce, SettleWallBounceDamage, WallBounceBreaksAtImpact } from "../wall-bounce/wall-bounce.js";
import { BreakMelon } from "../../health/breaking/breaking.js";
import { ApplyHealing } from "../../health/heal/index.js";
import { CurrentWallRules, CurrentSideView, InWater, InJumpRechargeZone } from "../../zones/registry.js";
import { ChargeInRechargeZone } from "../../zones/jump-recharge/logic.js";
import { SideViewAxes, InitialFacing, SideViewInput, PlaneDepth, KeepOnPlane } from "../../zones/side-view/logic.js";
import { PodiumHoldActive, PodiumHoldVelocity } from "../../race/podium/logic.js";

/** @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt */
export function UpdateKart(slot, kart, dt) {
    const { pawn, melon } = kart;
    // Before every early return below: the charge refills standing still,
    // race-locked or broken too.
    RechargeWallJumpCharge(kart, dt);
    kart.wallJumpCharge = ChargeInRechargeZone(GetWallJumpCharges(kart), InJumpRechargeZone(kart));

    // Locked during the pre-race countdown, and again once a kart has
    // finished its heat (parked so it stops re-triggering checkpoints).
    // Vertical velocity is left alone so gravity still settles it normally —
    // only driving input is suppressed.
    if (kart.locked) {
        const vel = melon.GetAbsVelocity();
        melon.Move({ velocity: { x: 0, y: 0, z: vel.z } });
        kart.lastVelocity = undefined;
        kart.settled = false;
        kart.speedCap = BaseMaxSpeed();
        kart.momentum = undefined; // standing still — the momentum run is over
        kart.attackBoosting = false;
        kart.pendingBounce = undefined; // parked/finished — a bounce's leftover damage no longer matters
        kart.padFlight = undefined;
        return;
    }

    // Free look (dev/free-look.js): the player is flying their pawn around,
    // the melon waits where it was, motion off — no driving, no impacts.
    if (kart.freeLook) {
        kart.lastVelocity = undefined;
        kart.settled = false;
        kart.attackBoosting = false;
        UpdateSpectatorHat(kart);
        return;
    }

    // Broken and waiting out BREAK_RESPAWN_DELAY (see BreakMelon) — unlike
    // `locked` above, freeze completely (gravity included). It's already
    // hidden at the crash site, and should just hold still until the delayed
    // respawn teleports it away rather than keep tumbling invisibly (which
    // would also spuriously re-trigger the impact check below).
    if (kart.breaking) {
        melon.Move({ velocity: { x: 0, y: 0, z: 0 } });
        kart.lastVelocity = undefined;
        kart.settled = false;
        kart.momentum = undefined;
        kart.attackBoosting = false;
        kart.pendingBounce = undefined;
        // Pull the chase camera back from the crash site so the burst is
        // actually visible; restored by ScheduleRespawnAfterBreak.
        ApplyBreakCameraZoom(kart, Instance.GetGameTime() - (kart.breakTime ?? Instance.GetGameTime()));
        return;
    }

    const now = Instance.GetGameTime();
    // A jump pad launch's damage protection ends a moment after landing.
    UpdatePadFlight(kart, now);
    // Heal zones (heal_enter/heal_leave) — before this tick's damage, so a
    // hit inside a zone still breaks the melon if it's big enough.
    ApplyHealing(kart, dt);
    // A wall bounce's jump-timing window has closed — its quality is final,
    // so charge (or waive) its damage now.
    if (kart.pendingBounce && now - kart.pendingBounce.time > WALL_BOUNCE_PERFECT_JUMP_WINDOW) {
        if (SettleWallBounceDamage(slot, kart)) {
            return; // broke
        }
    }
    const origin = melon.GetAbsOrigin();
    // Someone's knife swing (movement/attack-boost/knife-guard.js) may have
    // shoved this melon — not an impact, and no speed from it either.
    const knifeGuard = KnifeGuardActive(now);
    if (knifeGuard) {
        kart.attackGuardUntil = Math.max(kart.attackGuardUntil ?? -Infinity, now + ATTACK_PUSH_GUARD_SECONDS);
    }
    const rawVelocity = melon.GetAbsVelocity();
    const currentVelocity = knifeGuard && kart.lastVelocity ? WithoutEnginePush(rawVelocity, kart.lastVelocity) : rawVelocity;
    // Ground contact from physics (see IsSupported): the vertical velocity we
    // commanded last tick vs. what it is now. No command to compare against
    // (first tick after a teleport/respawn, or coming out of rest): a melon
    // that was lying still is on something, anything else counts as not.
    const verticalAccel = kart.lastVelocity ? VerticalAccel(kart.lastVelocity.z, currentVelocity.z, dt) : undefined;
    const supported = verticalAccel !== undefined ? IsSupported(verticalAccel) : kart.settled;
    const grounded = UpdateGrounded(kart, origin, now, supported, verticalAccel);
    const wallNormalNow = UpdateWallContact(kart, origin, now, currentVelocity, dt, grounded);
    // Wall bounce / wall jump tuning for where the melon is (lift zone or not).
    const wallRules = CurrentWallRules(kart);
    DrawCollisionDebug(slot, kart, grounded, wallNormalNow, wallRules.wallJumpWindow);
    /** @type {{ x: number, y: number } | undefined} */
    let bounceVelocity = undefined;
    let bounceAngleFactor = 0;
    // In water (water_enter/water_leave) the water's drag and buoyancy keep
    // pulling the velocity away from what we commanded — that's no impact
    // and no wall, so neither damage nor a bounce comes from it.
    if (kart.lastVelocity && !InWater(kart)) {
        const impactDelta = {
            x: currentVelocity.x - kart.lastVelocity.x,
            y: currentVelocity.y - kart.lastVelocity.y,
            z: currentVelocity.z - kart.lastVelocity.z,
        };
        const impactSpeed = Math.hypot(impactDelta.x, impactDelta.y, impactDelta.z);
        // (A landing needs no special case here any more: the floor stopping
        // the fall is exactly the support IsSupported measures above.)
        // Right after a bounce the same wall contact often keeps shoving the
        // melon for another tick or two — that's still the bounce (already
        // charged via pendingBounce), not a new crash to take damage from.
        const inBounceCooldown = now < (kart.nextBounceTime ?? 0);
        const wallNormal =
            WALL_BOUNCE_ENABLED && impactSpeed > WALL_BOUNCE_MIN_IMPACT && !inBounceCooldown
                ? DetectWallNormal(kart, impactDelta)
                : null;
        const bounce = wallNormal ? ComputeWallBounce(kart, wallNormal, now) : null;
        if (bounce) {
            // Only reachable with WALL_BOUNCE_COOLDOWN tuned below the jump
            // window — settle the previous bounce's damage before starting a
            // new one.
            if (kart.pendingBounce && SettleWallBounceDamage(slot, kart)) {
                return;
            }
            // In a lift zone, never so slow that the melon can't reach the
            // opposite wall and bounce again (wallRules.minBounceSpeed) —
            // free: speedGain below stays what the bounce itself earned.
            bounceVelocity = WithMinSpeed(bounce.velocity, wallRules.minBounceSpeed);
            bounceAngleFactor = bounce.angleFactor;
            // The melon leaves the wall right away after bouncing, so the
            // probes won't see it next tick — this is its wall contact.
            kart.lastWallContact = { time: now, normal: { x: wallNormal.x, y: wallNormal.y } };
            kart.nextBounceTime = now + WALL_BOUNCE_COOLDOWN;
            kart.lastBounceTime = now;
            // Read by UpdateBounceHud for the angle/timing feedback panel.
            kart.lastBounceInfo = { angle: bounce.angle, angleFactor: bounce.angleFactor, jumpFactor: bounce.jumpFactor };
            kart.speedCap = Math.max(kart.speedCap ?? KartMaxSpeed(kart), Math.hypot(bounceVelocity.x, bounceVelocity.y));
            // Damage waits until the jump-timing window has closed (see the
            // top of the non-locked path, and the late-jump case below) —
            // a jump just *after* the hit can still improve its quality.
            kart.pendingBounce = {
                time: now,
                impactSpeed,
                impactDir: impactDelta,
                angle: bounce.angle,
                angleFactor: bounce.angleFactor,
                jumpFactor: bounce.jumpFactor,
                speedGain: bounce.speedGain,
            };
            // ...unless it's lethal already: a late jump could only add
            // damage, so break right here at the wall instead of mid-air
            // once the window has closed (the bounce velocity is never applied).
            if (WallBounceBreaksAtImpact(kart) && SettleWallBounceDamage(slot, kart)) {
                return;
            }
        } else if (!inBounceCooldown && impactSpeed > IMPACT_DAMAGE_THRESHOLD) {
            ApplyImpactDamage(slot, kart, impactDelta);
            if (kart.health <= 0) {
                // impactDelta is the sudden change physics forced onto the
                // velocity we commanded — i.e. roughly the direction the
                // wall shoved the melon back in, not wherever it happened to
                // be tumbling toward. That's what the break particles should
                // point along, not the melon's own (essentially random while
                // rolling) orientation.
                BreakMelon(slot, kart, impactDelta, impactSpeed);
                return; // now broken/frozen this tick — nothing else to update
            }
        }
    }

    // On the hub's podium after a Grand Prix (race/podium/): jumping and
    // looking around only — no driving, no attack boost, held over its spot.
    if (kart.podium && !PodiumHoldActive(kart.podium, now)) {
        kart.podium = undefined;
    }
    const podium = kart.podium;
    const forwardInput = podium
        ? 0
        : (pawn.IsInputPressed(CSInputs.FORWARD) ? 1 : 0) - (pawn.IsInputPressed(CSInputs.BACK) ? 1 : 0);
    // A/D page the scoreboard while Tab is held (UpdateScoreboardInput) —
    // no strafing then.
    const strafeInput = podium || pawn.IsInputPressed(CSInputs.SHOW_SCORES)
        ? 0
        : (pawn.IsInputPressed(CSInputs.RIGHT) ? 1 : 0) - (pawn.IsInputPressed(CSInputs.LEFT) ? 1 : 0);
    const jumpPressed = pawn.WasInputJustPressed(CSInputs.JUMP);
    // Attack boost (ATTACK_BOOST_*): holding attack pushes along the look
    // direction and lifts the speed cap, paid for with health every tick —
    // no floor: boost until it's gone and the melon breaks.
    const attackHeld = !podium && pawn.IsInputPressed(CSInputs.ATTACK);
    const boost = AttackBoost(kart.health, attackHeld, dt);
    kart.health = boost.health;
    kart.attackBoosting = boost.boosting; // shows the boost trail, see fx/boost-trail/boost-trail.js
    if (attackHeld) {
        LogAttackHeld(slot, kart, currentVelocity, boost.boosting);
    }
    if (boost.boosting && kart.health <= 0) {
        Debug(`slot ${slot}: boosted until the health ran out`);
        const speed = Math.hypot(currentVelocity.x, currentVelocity.y, currentVelocity.z);
        BreakMelon(slot, kart, speed > 0 ? currentVelocity : { x: 1, y: 0, z: 0 }, Math.max(speed, 1));
        return;
    }

    if (
        !boost.boosting &&
        // A head-on wall hit can leave vphysics' own velocity at ~0 this
        // tick — that's the bounce about to be applied, not a melon at rest.
        !bounceVelocity &&
        forwardInput === 0 &&
        strafeInput === 0 &&
        !jumpPressed &&
        Math.hypot(currentVelocity.x, currentVelocity.y) < MELON_REST_SPEED &&
        Math.abs(currentVelocity.z) < MELON_REST_SPEED
    ) {
        // Fully settled: no input, not falling/jumping, negligible velocity
        // in every axis. Stop commanding it entirely and hand off to
        // vphysics completely — see MELON_REST_SPEED. lastVelocity is
        // cleared for the same reason the locked/breaking branches above
        // clear it: whatever vphysics does to it next (slide, tip, settle)
        // is real physics, not an "impact" to react to.
        if (!kart.settled) {
            // The tick it *first* comes to rest — see SETTLE_NUDGE_ANGULAR_SPEED
            // for why a one-off random spin nudge belongs here rather than
            // just leaving it alone.
            // Spin axis in the horizontal (x/y) plane, i.e. a tip over in a
            // random direction — z is the vertical axis in Source, so any z
            // component would just spin the melon in place on its resting
            // point, which can't break a knife-edge balance.
            const nudgeAngle = Math.random() * Math.PI * 2;
            melon.Move({
                angularVelocity: {
                    x: Math.cos(nudgeAngle) * SETTLE_NUDGE_ANGULAR_SPEED,
                    y: Math.sin(nudgeAngle) * SETTLE_NUDGE_ANGULAR_SPEED,
                    z: 0,
                },
            });
            kart.settled = true;
        }
        kart.lastVelocity = undefined;
        kart.momentum = undefined;
        return;
    }
    kart.settled = false;

    // Direction comes from the player's look direction (mouse), not a
    // separate turn control — this is what makes it "free-look" driving.
    // In a side-view zone (2D jump & run) it's the screen axis instead.
    const sideView = SideViewDriving(kart, origin, currentVelocity, forwardInput, strafeInput);
    const rad = (pawn.GetEyeAngles().yaw * Math.PI) / 180;
    const forwardDir = sideView ? sideView.forwardDir : { x: Math.cos(rad), y: Math.sin(rad) };
    const rightDir = { x: Math.sin(rad), y: -Math.cos(rad) };
    const driveForward = sideView ? sideView.forwardInput : forwardInput;
    const driveStrafe = sideView ? 0 : strafeInput;

    // After a wall bounce, steering/friction apply on top of the reflected
    // velocity rather than whatever vphysics left behind — so the player can
    // still steer out of the bounce the same tick.
    let vx = bounceVelocity ? bounceVelocity.x : currentVelocity.x;
    let vy = bounceVelocity ? bounceVelocity.y : currentVelocity.y;
    // Attack also makes the engine shove the melon (knife swing) — no speed
    // from that, see ATTACK_PUSH_GUARD_SECONDS.
    if (attackHeld) {
        kart.attackGuardUntil = now + ATTACK_PUSH_GUARD_SECONDS;
    }
    // Coming out of rest there's no command to compare against (settled
    // melons aren't commanded) — then it was standing still, and a swing
    // must not get it rolling either.
    if (!bounceVelocity && now <= (kart.attackGuardUntil ?? -Infinity)) {
        const guarded = WithoutEnginePush({ x: vx, y: vy, z: 0 }, kart.lastVelocity ?? { x: 0, y: 0, z: 0 });
        vx = guarded.x;
        vy = guarded.y;
    }

    // Steering grip (STEER_GRIP_*): holding forward turns the velocity itself
    // towards the look direction — on the ground and (at STEER_AIR_GRIP_RATE)
    // in the air. Not on a bounce tick — the reflected velocity is the
    // bounce's result and stays as computed.
    if (driveForward > 0 && !bounceVelocity) {
        const gripRate = grounded ? STEER_GRIP_RATE : STEER_AIR_GRIP_RATE;
        const steered = SteerTowards({ x: vx, y: vy }, forwardDir, gripRate * dt, STEER_GRIP_MAX_ANGLE);
        vx = steered.x;
        vy = steered.y;
    }

    if (driveForward !== 0 || driveStrafe !== 0) {
        // All three scaled by the physics page's "Acceleration" (dev/physics-tuning.js).
        const accelFactor = PhysicsFactor("accel");
        const forwardAccel = (driveForward > 0 ? FORWARD_ACCEL : REVERSE_ACCEL) * accelFactor;
        const strafeAccel = STRAFE_ACCEL * accelFactor;
        let ax = forwardDir.x * driveForward * forwardAccel + rightDir.x * driveStrafe * strafeAccel;
        let ay = forwardDir.y * driveForward * forwardAccel + rightDir.y * driveStrafe * strafeAccel;
        vx += ax * dt;
        vy += ay * dt;
    } else if (!boost.boosting) {
        const speed = Math.hypot(vx, vy);
        if (speed > 0) {
            const scale = Math.max(0, speed - COAST_FRICTION * dt) / speed;
            vx *= scale;
            vy *= scale;
        }
    }

    if (boost.boosting) {
        // Push and headroom above the top speed scaled by the physics page's
        // "Boost" (dev/physics-tuning.js).
        const boostFactor = PhysicsFactor("boost");
        vx += forwardDir.x * ATTACK_BOOST_ACCEL * boostFactor * dt;
        vy += forwardDir.y * ATTACK_BOOST_ACCEL * boostFactor * dt;
        const boostMax = BoostMaxSpeed(BaseMaxSpeed(), ATTACK_BOOST_MAX_SPEED - MAX_SPEED, boostFactor);
        kart.speedCap = Math.max(kart.speedCap ?? KartMaxSpeed(kart), boostMax);
    }

    // Jump press (ground jump / wall jump / wall-bounce timing) — see
    // ApplyJump in jump.js.
    // A wall bounce also kicks it upward (WALL_BOUNCE_UP_SPEED, stronger in a
    // lift zone, and PERFECT_BOUNCE_UP_MULTIPLIER stronger for a PERFECT hit).
    const vzBase = bounceVelocity
        ? BounceUpVelocity(currentVelocity.z, wallRules.bounceUpSpeed, bounceAngleFactor)
        : currentVelocity.z;
    const v = { x: vx, y: vy, z: vzBase };
    ApplyJump(slot, kart, now, grounded, jumpPressed, v, wallRules);
    // On a jump pad, a (just) pressed jump launches instead — see JUMP_PAD_*.
    // A press that launched did something, so it's no mashing press (see
    // WallTimingPress).
    if (TryPadLaunch(slot, kart, now, jumpPressed, v, forwardDir) && kart.lastIdleJumpPressTime === now) {
        kart.lastIdleJumpPressTime = undefined;
    }
    vx = v.x;
    vy = v.y;
    // The physics page's "Gravity" (dev/physics-tuning.js): the engine pulls
    // with GRAVITY regardless, the script adds the difference. Ground
    // contact still reads right — it compares against this command.
    const vz = v.z + ExtraGravityDelta(PhysicsFactor("gravity"), GRAVITY, dt);
    // On the podium: whatever else happened, horizontally it only goes back
    // over its spot (a jump goes straight up and comes down there).
    if (podium) {
        const hold = PodiumHoldVelocity(origin, podium.spot);
        vx = hold.x;
        vy = hold.y;
    }
    // Side view: nothing moves the melon towards or away from the camera.
    if (sideView) {
        const kept = KeepOnPlane({ x: vx, y: vy }, sideView.view, sideView.depthError);
        vx = kept.x;
        vy = kept.y;
    }

    // Normally the melon's momentum top speed (MAX_SPEED plus whatever
    // repeatedly reaching it has earned, see MOMENTUM_*), but a wall bounce
    // or the attack boost can lift it (see BOOST_DECAY): decays back down
    // every tick, and never stays above the melon's actual speed so a lost
    // boost can't be re-earned just by accelerating again.
    const momentumMax = KartMaxSpeed(kart);
    const speedCap = kart.speedCap ?? momentumMax;
    let horizSpeed = Math.hypot(vx, vy);
    if (horizSpeed > speedCap) {
        const scale = speedCap / horizSpeed;
        vx *= scale;
        vy *= scale;
        horizSpeed = speedCap;
    }
    // Boosts don't count towards momentum (neither the attack boost nor a
    // cap a bounce/boost has lifted above the momentum top speed).
    const boosted = boost.boosting || speedCap > momentumMax + 1e-6;
    kart.momentum = UpdateMomentum(kart.momentum, horizSpeed, now, boosted, BaseMaxSpeed());
    kart.speedCap = Math.max(KartMaxSpeed(kart), Math.min(speedCap - BOOST_DECAY * dt, horizSpeed));

    melon.Move({ velocity: { x: vx, y: vy, z: vz } });
    // What we commanded this tick — compared against the actual velocity
    // physics settles on by next tick to detect collisions (see the top of
    // this function). The one before it and where this tick started are kept
    // too, for measuring a wall hit's true incoming direction — see
    // DetectWallNormal/ComputeWallBounce.
    kart.prevLastVelocity = kart.lastVelocity;
    kart.prevOrigin = origin;
    kart.lastVelocity = { x: vx, y: vy, z: vz };
}

/**
 * Driving in a side-view zone (zones/side-view/): the screen axis instead of
 * the look direction, A/D left/right on screen, W the way the melon faces
 * (see SideViewInput), and how far it's off the plane it entered on.
 * undefined outside one. Entering a (new) zone starts on the plane the melon
 * is on, facing the way it moves.
 * @param {import("../../core/kart-registry.js").Kart} kart
 * @param {{ x: number, y: number, z: number }} origin @param {{ x: number, y: number, z: number }} velocity
 * @param {number} forwardInput @param {number} strafeInput
 */
function SideViewDriving(kart, origin, velocity, forwardInput, strafeInput) {
    const zone = CurrentSideView(kart);
    if (!zone) {
        return undefined; // kart.sideViewDrive stays: the camera turns the view along its facing on the way out
    }
    const { view, right } = SideViewAxes(zone.yaw);
    if (kart.sideViewDrive?.zone !== zone) {
        kart.sideViewDrive = { zone, plane: PlaneDepth(origin, view), facing: InitialFacing(velocity, right) };
    }
    const input = SideViewInput(forwardInput, strafeInput, kart.sideViewDrive.facing);
    kart.sideViewDrive.facing = input.facing;
    const dir = input.axis !== 0 ? Math.sign(input.axis) : input.facing;
    return {
        forwardDir: { x: right.x * dir, y: right.y * dir },
        forwardInput: Math.abs(input.axis),
        view,
        depthError: kart.sideViewDrive.plane - PlaneDepth(origin, view),
    };
}
