// Per-tick melon driving (UpdateKart): the order everything happens in each
// tick — break/lock handling, contact measurement, impact and wall-bounce
// detection, steering, friction, jump, speed cap. The individual parts live
// in the sibling files; this one wires them together.
import { Instance, CSInputs } from "cs_script/point_script";
import { ApplyBreakCameraZoom } from "../camera/index.js";
import { VerticalAccel, IsSupported } from "../logic/contact.js";
import { SteerTowards } from "../logic/steering.js";
import { BounceUpVelocity, WithMinSpeed } from "../logic/wall-bounce.js";
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
    WALL_BOUNCE_MIN_IMPACT,
    WALL_BOUNCE_COOLDOWN,
    WALL_BOUNCE_PERFECT_JUMP_WINDOW,
    BOOST_DECAY,
} from "../constants/index.js";
import { ApplyJump } from "./jump.js";
import { UpdateGrounded, UpdateWallContact } from "./contact.js";
import { DrawJumpDebug } from "./jump-debug.js";
import { ApplyImpactDamage } from "./damage.js";
import { DetectWallNormal, ComputeWallBounce, SettleWallBounceDamage } from "./wall-bounce.js";
import { BreakMelon } from "./breaking.js";
import { ApplyHealing } from "../heal/index.js";
import { CurrentWallRules } from "./zones.js";

/** @param {number} slot @param {import("../kart-registry.js").Kart} kart @param {number} dt */
export function UpdateKart(slot, kart, dt) {
    const { pawn, melon } = kart;

    // Locked during the pre-race countdown, and again once a kart has
    // finished its heat (parked so it stops re-triggering checkpoints).
    // Vertical velocity is left alone so gravity still settles it normally —
    // only driving input is suppressed.
    if (kart.locked) {
        const vel = melon.GetAbsVelocity();
        melon.Move({ velocity: { x: 0, y: 0, z: vel.z } });
        kart.lastVelocity = undefined;
        kart.settled = false;
        kart.speedCap = MAX_SPEED;
        kart.pendingBounce = undefined; // parked/finished — a bounce's leftover damage no longer matters
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
        kart.pendingBounce = undefined;
        // Pull the chase camera back from the crash site so the burst is
        // actually visible; restored by ScheduleRespawnAfterBreak.
        ApplyBreakCameraZoom(kart, Instance.GetGameTime() - (kart.breakTime ?? Instance.GetGameTime()));
        return;
    }

    const now = Instance.GetGameTime();
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
    const currentVelocity = melon.GetAbsVelocity();
    // Ground contact from physics (see IsSupported): the vertical velocity we
    // commanded last tick vs. what it is now. No command to compare against
    // (first tick after a teleport/respawn, or coming out of rest): a melon
    // that was lying still is on something, anything else counts as not.
    const verticalAccel = kart.lastVelocity ? VerticalAccel(kart.lastVelocity.z, currentVelocity.z, dt) : undefined;
    const supported = verticalAccel !== undefined ? IsSupported(verticalAccel) : kart.settled;
    const grounded = UpdateGrounded(kart, origin, now, supported, verticalAccel);
    const wallNormalNow = grounded ? undefined : UpdateWallContact(kart, origin, now, currentVelocity);
    DrawJumpDebug(slot, kart, grounded, wallNormalNow);
    // Wall bounce / wall jump tuning for where the melon is (lift zone or not).
    const wallRules = CurrentWallRules(kart);
    /** @type {{ x: number, y: number } | undefined} */
    let bounceVelocity = undefined;
    if (kart.lastVelocity) {
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
            impactSpeed > WALL_BOUNCE_MIN_IMPACT && !inBounceCooldown
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
            // The melon leaves the wall right away after bouncing, so the
            // probes won't see it next tick — this is its wall contact.
            kart.lastWallContact = { time: now, normal: { x: wallNormal.x, y: wallNormal.y } };
            kart.nextBounceTime = now + WALL_BOUNCE_COOLDOWN;
            kart.lastBounceTime = now;
            // Read by UpdateBounceHud for the angle/timing feedback panel.
            kart.lastBounceInfo = { angle: bounce.angle, angleFactor: bounce.angleFactor, jumpFactor: bounce.jumpFactor };
            kart.speedCap = Math.max(kart.speedCap ?? MAX_SPEED, Math.hypot(bounceVelocity.x, bounceVelocity.y));
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
        } else if (!inBounceCooldown && impactSpeed > IMPACT_DAMAGE_THRESHOLD) {
            ApplyImpactDamage(slot, kart, impactSpeed);
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

    const forwardInput =
        (pawn.IsInputPressed(CSInputs.FORWARD) ? 1 : 0) - (pawn.IsInputPressed(CSInputs.BACK) ? 1 : 0);
    const strafeInput =
        (pawn.IsInputPressed(CSInputs.RIGHT) ? 1 : 0) - (pawn.IsInputPressed(CSInputs.LEFT) ? 1 : 0);
    const jumpPressed = pawn.WasInputJustPressed(CSInputs.JUMP);

    if (
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
        return;
    }
    kart.settled = false;

    // Direction comes from the player's look direction (mouse), not a
    // separate turn control — this is what makes it "free-look" driving.
    const rad = (pawn.GetEyeAngles().yaw * Math.PI) / 180;
    const forwardDir = { x: Math.cos(rad), y: Math.sin(rad) };
    const rightDir = { x: Math.sin(rad), y: -Math.cos(rad) };

    // After a wall bounce, steering/friction apply on top of the reflected
    // velocity rather than whatever vphysics left behind — so the player can
    // still steer out of the bounce the same tick.
    let vx = bounceVelocity ? bounceVelocity.x : currentVelocity.x;
    let vy = bounceVelocity ? bounceVelocity.y : currentVelocity.y;

    // Steering grip (STEER_GRIP_*): holding forward turns the velocity itself
    // towards the look direction — on the ground and (at STEER_AIR_GRIP_RATE)
    // in the air. Not on a bounce tick — the reflected velocity is the
    // bounce's result and stays as computed.
    if (forwardInput > 0 && !bounceVelocity) {
        const gripRate = grounded ? STEER_GRIP_RATE : STEER_AIR_GRIP_RATE;
        const steered = SteerTowards({ x: vx, y: vy }, forwardDir, gripRate * dt, STEER_GRIP_MAX_ANGLE);
        vx = steered.x;
        vy = steered.y;
    }

    if (forwardInput !== 0 || strafeInput !== 0) {
        const forwardAccel = forwardInput > 0 ? FORWARD_ACCEL : REVERSE_ACCEL;
        let ax = forwardDir.x * forwardInput * forwardAccel + rightDir.x * strafeInput * STRAFE_ACCEL;
        let ay = forwardDir.y * forwardInput * forwardAccel + rightDir.y * strafeInput * STRAFE_ACCEL;
        vx += ax * dt;
        vy += ay * dt;
    } else {
        const speed = Math.hypot(vx, vy);
        if (speed > 0) {
            const scale = Math.max(0, speed - COAST_FRICTION * dt) / speed;
            vx *= scale;
            vy *= scale;
        }
    }

    // Jump press (ground jump / wall jump / wall-bounce timing) and the
    // wall-jump charge refill — see ApplyJump in jump.js.
    // A wall bounce also kicks it upward (WALL_BOUNCE_UP_SPEED, stronger in a
    // lift zone).
    const vzBase = bounceVelocity ? BounceUpVelocity(currentVelocity.z, wallRules.bounceUpSpeed) : currentVelocity.z;
    const v = { x: vx, y: vy, z: vzBase };
    ApplyJump(slot, kart, now, dt, grounded, jumpPressed, v, wallRules);
    vx = v.x;
    vy = v.y;
    const vz = v.z;

    // Normally MAX_SPEED, but a wall bounce can lift it (see BOOST_DECAY):
    // decays back down every tick, and never stays above the melon's actual
    // speed so a lost boost can't be re-earned just by accelerating again.
    const speedCap = kart.speedCap ?? MAX_SPEED;
    let horizSpeed = Math.hypot(vx, vy);
    if (horizSpeed > speedCap) {
        const scale = speedCap / horizSpeed;
        vx *= scale;
        vy *= scale;
        horizSpeed = speedCap;
    }
    kart.speedCap = Math.max(MAX_SPEED, Math.min(speedCap - BOOST_DECAY * dt, horizSpeed));

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
