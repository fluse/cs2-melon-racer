import { Instance, CSInputs, PointTemplate } from "cs_script/point_script";
import { DEBUG, Debug } from "./debug.js";
import { karts } from "./kart-registry.js";
import { SpawnMelonAt } from "./kart-spawn.js";
import { ApplyCameraFollow, ApplyBreakCameraZoom } from "./camera.js";
import { PruneBreakEffects, BreakPieceVelocity } from "./logic/break-sequence.js";
import { TraceLine, TraceSphere } from "./trace.js";
import { JumpTimingFactor, JumpMultiplier, PickIncomingVelocity, ReflectOffWall, WallBounceDamage, IsWallContact } from "./logic/wall-bounce.js";
import {
    FORWARD_ACCEL,
    REVERSE_ACCEL,
    STRAFE_ACCEL,
    MAX_SPEED,
    COAST_FRICTION,
    JUMP_SPEED,
    JUMP_COOLDOWN,
    GROUND_CHECK_DISTANCE,
    GROUND_NORMAL_MIN_Z,
    GROUND_COYOTE_TIME,
    LANDING_MIN_IMPACT_Z,
    IMPACT_DAMAGE_THRESHOLD,
    IMPACT_DAMAGE_SCALE,
    MELON_MAX_HEALTH,
    BREAK_RESPAWN_DELAY,
    BREAK_TINT_FALLBACK,
    BREAK_EFFECT_LIFETIME,
    BREAK_PARTICLE_TEMPLATE_NAME,
    BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME,
    BREAK_PIECES_TEMPLATE_NAME,
    BREAK_PIECE_SPIN,
    MELON_REST_SPEED,
    SETTLE_NUDGE_ANGULAR_SPEED,
    WALL_BOUNCE_MIN_IMPACT,
    WALL_NORMAL_MAX_Z,
    WALL_BOUNCE_TRACE_RADIUS,
    WALL_BOUNCE_TRACE_DISTANCE,
    WALL_BOUNCE_SPHERE_TRACE_DISTANCE,
    WALL_BOUNCE_DEBUG_SECONDS,
    WALL_BOUNCE_DEBUG_LINE_LENGTH,
    WALL_TIMING_SPAM_LOCKOUT,
    WALL_BOUNCE_COOLDOWN,
    WALL_BOUNCE_PERFECT_JUMP_WINDOW,
    BOOST_DECAY,
} from "./constants.js";

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart @param {number} dt */
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
    // A wall bounce's jump-timing window has closed — its quality is final,
    // so charge (or waive) its damage now.
    if (kart.pendingBounce && now - kart.pendingBounce.time > WALL_BOUNCE_PERFECT_JUMP_WINDOW) {
        if (SettleWallBounceDamage(slot, kart)) {
            return; // broke
        }
    }
    const origin = melon.GetAbsOrigin();
    const currentVelocity = melon.GetAbsVelocity();
    /** @type {{ x: number, y: number } | undefined} */
    let bounceVelocity = undefined;
    if (kart.lastVelocity) {
        const impactDelta = {
            x: currentVelocity.x - kart.lastVelocity.x,
            y: currentVelocity.y - kart.lastVelocity.y,
            z: currentVelocity.z - kart.lastVelocity.z,
        };
        const impactSpeed = Math.hypot(impactDelta.x, impactDelta.y, impactDelta.z);
        // Was falling, and something below just stopped it — a landing,
        // counts as ground contact for the jump check below.
        if (kart.lastVelocity.z < 0 && impactDelta.z > LANDING_MIN_IMPACT_Z) {
            kart.lastGroundedTime = now;
        }
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
            bounceVelocity = bounce.velocity;
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

    // Jump: straight-up force, only with ground contact (tolerant — see
    // UpdateGrounded/GROUND_COYOTE_TIME) and at most once per JUMP_COOLDOWN
    // seconds via kart.nextJumpTime.
    // Only jumps that actually fire count towards wall-bounce timing, so the
    // cooldown also keeps jump-spamming along a wall from being "perfect".
    let vz = currentVelocity.z;
    const grounded = UpdateGrounded(kart, origin, now);
    if (jumpPressed) {
        const ready = now >= kart.nextJumpTime;
        const timingPress = RegisterWallTimingPress(kart, now);
        Debug(`Jump pressed: ready=${ready} grounded=${grounded} wallTiming=${timingPress} forwardInput=${forwardInput} strafeInput=${strafeInput}`);
        // The normal jump — ground + cooldown gated, gives the upward push.
        if (ready && grounded) {
            vz = JUMP_SPEED;
            kart.nextJumpTime = now + JUMP_COOLDOWN;
        }
        // Wall timing — independent of the normal jump above (works in the
        // air and during its cooldown), purely about *when* it's pressed.
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
                    const before = Math.hypot(vx, vy);
                    vx *= ratio;
                    vy *= ratio;
                    const after = Math.hypot(vx, vy);
                    pending.speedGain += after - before;
                    pending.jumpFactor = lateFactor;
                    if (kart.lastBounceInfo) {
                        kart.lastBounceInfo.jumpFactor = lateFactor;
                    }
                    kart.speedCap = Math.max(kart.speedCap ?? MAX_SPEED, after);
                }
            }
        }
    }

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

/**
 * Records a jump-button press for wall-bounce timing, separately from the
 * normal (ground/cooldown gated) jump. Anti-spam: a press less than
 * WALL_TIMING_SPAM_LOCKOUT after the previous one locks timing credit for
 * that long, so mashing jump along a wall never counts — only a single,
 * deliberately timed press does.
 * @param {import("./kart-registry.js").Kart} kart @param {number} now
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

/**
 * Refreshes kart.lastGroundedTime if there's floor within
 * GROUND_CHECK_DISTANCE below the melon, and reports whether it has had
 * ground contact (this trace, or a landing detected in UpdateKart) within the
 * last GROUND_COYOTE_TIME seconds.
 * @param {import("./kart-registry.js").Kart} kart @param {any} origin @param {number} now
 */
function UpdateGrounded(kart, origin, now) {
    const trace = TraceLine({
        start: origin,
        end: { x: origin.x, y: origin.y, z: origin.z - GROUND_CHECK_DISTANCE },
        ignoreEntity: [kart.melon, kart.pawn],
        ignorePlayers: true,
    });
    if (trace.didHit && !trace.startedInSolid && trace.normal.z >= GROUND_NORMAL_MIN_Z) {
        kart.lastGroundedTime = now;
    }
    return kart.lastGroundedTime !== undefined && now - kart.lastGroundedTime <= GROUND_COYOTE_TIME;
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart @param {number} impactSpeed */
export function ApplyImpactDamage(slot, kart, impactSpeed) {
    const damage = (impactSpeed - IMPACT_DAMAGE_THRESHOLD) * IMPACT_DAMAGE_SCALE;
    DamageKart(slot, kart, damage, `impact ${impactSpeed.toFixed(0)} u/s`);
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart @param {number} damage @param {string} reason */
function DamageKart(slot, kart, damage, reason) {
    kart.health -= damage;
    Debug(`slot ${slot}: ${reason} -> ${damage.toFixed(0)} dmg, health ${kart.health.toFixed(0)}/${MELON_MAX_HEALTH}`);
}

/**
 * Whether the impact this tick was against a wall, and if so that wall's
 * (horizontal, unit-length) normal — see the trace order inside. Floors/
 * ceilings (mostly vertical normal) and other physics props (other karts'
 * melons, loose melons in the map) don't count — only walls bounce.
 * @param {import("./kart-registry.js").Kart} kart @param {{ x: number, y: number, z: number }} impactDelta
 * @returns {{ x: number, y: number, method: string, hitPoint?: any } | null}
 */
function DetectWallNormal(kart, impactDelta) {
    const v = kart.lastVelocity;
    if (!v) {
        return null;
    }
    const horizSpeed = Math.hypot(v.x, v.y);
    if (horizSpeed < 1) {
        return null; // purely vertical motion — a landing, never a wall
    }
    const dir = { x: v.x / horizSpeed, y: v.y / horizSpeed };
    const ignoreEntity = [kart.melon, kart.pawn];

    // 1st choice: a thin ray from where the melon was *last* tick (before
    // contact) along its incoming direction — gives the wall's real face
    // normal, independent of how vphysics resolved the collision. Long
    // enough to still reach the wall at grazing angles, where the distance
    // along the travel direction grows with 1/cos(angle).
    // 2nd: a sphere sweep from the current position (catches thin posts or
    // edges the center ray slips past).
    // Neither finds a wall -> no bounce. (There used to be a last resort
    // that took the impact direction itself as the normal, but with no wall
    // found that bounced the melon off thin air.)
    // Whatever they find must then pass IsWallContact: the ray reaches far
    // ahead, and in a small room it finds some wall on nearly every hard
    // landing or bump, even though the melon isn't touching it.
    const from = kart.prevOrigin ?? kart.melon.GetAbsOrigin();
    const ray = TraceLine({
        start: from,
        end: {
            x: from.x + dir.x * WALL_BOUNCE_TRACE_DISTANCE,
            y: from.y + dir.y * WALL_BOUNCE_TRACE_DISTANCE,
            z: from.z,
        },
        ignoreEntity,
        ignorePlayers: true,
    });
    /** @type {any} */
    let trace = ray.didHit && !ray.startedInSolid ? ray : null;
    let method = "ray";
    if (!trace) {
        const start = kart.melon.GetAbsOrigin();
        const sphere = TraceSphere({
            radius: WALL_BOUNCE_TRACE_RADIUS,
            start,
            end: {
                x: start.x + dir.x * WALL_BOUNCE_SPHERE_TRACE_DISTANCE,
                y: start.y + dir.y * WALL_BOUNCE_SPHERE_TRACE_DISTANCE,
                z: start.z,
            },
            ignoreEntity,
            ignorePlayers: true,
        });
        trace = sphere.didHit && !sphere.startedInSolid ? sphere : null;
        method = "sphere";
    }

    if (!trace) {
        return null;
    }
    const hit = trace.hitEntity;
    if (hit && !hit.IsWorld() && hit.GetClassName().startsWith("prop_physics")) {
        return null;
    }
    const { x: nx, y: ny, z: nz } = trace.normal;
    if (Math.abs(nz) > WALL_NORMAL_MAX_Z) {
        return null;
    }
    const h = Math.hypot(nx, ny);
    if (h <= 0) {
        return null;
    }
    const n = { x: nx / h, y: ny / h };
    const hitPoint = trace.end;
    const incoming = PickIncomingVelocity(v, kart.prevLastVelocity, n);
    if (!IsWallContact(kart.melon.GetAbsOrigin(), hitPoint, n, incoming, kart.melon.GetAbsVelocity())) {
        Debug(`wall bounce rejected: wall found via ${method} isn't actually being touched (impact ${Math.hypot(impactDelta.x, impactDelta.y, impactDelta.z).toFixed(0)} u/s)`);
        return null;
    }
    return { ...n, method, hitPoint };
}

/**
 * DEBUG only: draws the bounce in the world for a few seconds — wall normal
 * (green), measured incoming direction (red), outgoing direction (blue),
 * and where the player was *looking* (yellow) — and logs the velocity-based
 * angle next to the look-based one, so a "that felt like 45°" mismatch can
 * be told apart from a measuring bug.
 * @param {import("./kart-registry.js").Kart} kart
 * @param {{ x: number, y: number, method: string, hitPoint?: any }} n
 * @param {{ x: number, y: number }} incoming @param {{ x: number, y: number }} outgoing @param {number} angle
 */
function DebugDrawBounce(kart, n, incoming, outgoing, angle) {
    if (!DEBUG) {
        return;
    }
    const origin = kart.melon.GetAbsOrigin();
    const at = n.hitPoint ?? origin;
    const len = WALL_BOUNCE_DEBUG_LINE_LENGTH;
    const duration = WALL_BOUNCE_DEBUG_SECONDS;
    /** @param {{ x: number, y: number }} d */
    const unit = (d) => {
        const l = Math.hypot(d.x, d.y) || 1;
        return { x: d.x / l, y: d.y / l };
    };
    const inDir = unit(incoming);
    const outDir = unit(outgoing);
    const yaw = (kart.pawn.GetEyeAngles().yaw * Math.PI) / 180;
    const lookDir = { x: Math.cos(yaw), y: Math.sin(yaw) };

    Instance.DebugLine({ start: at, end: { x: at.x + n.x * len, y: at.y + n.y * len, z: at.z }, duration, color: { r: 0, g: 255, b: 0 } });
    Instance.DebugLine({ start: { x: at.x - inDir.x * len, y: at.y - inDir.y * len, z: at.z }, end: at, duration, color: { r: 255, g: 60, b: 60 } });
    Instance.DebugLine({ start: at, end: { x: at.x + outDir.x * len, y: at.y + outDir.y * len, z: at.z }, duration, color: { r: 80, g: 140, b: 255 } });
    Instance.DebugLine({ start: origin, end: { x: origin.x + lookDir.x * len, y: origin.y + lookDir.y * len, z: origin.z }, duration, color: { r: 255, g: 224, b: 102 } });

    const lookInto = -(lookDir.x * n.x + lookDir.y * n.y);
    const lookAngle = lookInto > 0 ? (Math.acos(Math.min(1, lookInto)) * 180) / Math.PI : NaN;
    Debug(
        `bounce angle: velocity ${angle.toFixed(1)}°, look ${Number.isNaN(lookAngle) ? "away from wall" : lookAngle.toFixed(1) + "°"}, ` +
        `normal via ${n.method}`
    );
}

/**
 * Reflects the melon's pre-impact horizontal velocity off a wall and scales
 * it by how well the hit was angled (see WALL_BOUNCE_* in constants.js).
 * Vertical velocity is left to physics — a bounce never launches upward.
 * @param {import("./kart-registry.js").Kart} kart @param {{ x: number, y: number, method: string, hitPoint?: any }} n @param {number} now
 * @returns {{ velocity: { x: number, y: number }, angle: number, angleFactor: number, jumpFactor: number, speedGain: number } | null}
 *   null if the melon wasn't actually moving into the wall
 */
function ComputeWallBounce(kart, n, now) {
    const v = PickIncomingVelocity(/** @type {{ x: number, y: number, z: number }} */ (kart.lastVelocity), kart.prevLastVelocity, n);
    // A timing press just *before* the hit counts here; one just after is
    // handled by UpdateKart's jump code upgrading kart.pendingBounce.
    const jumpFactor = kart.wallTimingPressTime !== undefined ? JumpTimingFactor(now - kart.wallTimingPressTime) : 0;
    const bounce = ReflectOffWall(v, n, jumpFactor);
    if (!bounce) {
        return null;
    }
    DebugDrawBounce(kart, n, v, bounce.velocity, bounce.angle);
    return { ...bounce, jumpFactor };
}

/**
 * Charges kart.pendingBounce's damage now that its jump window is over (a
 * late jump can still have raised its speed gain): the wall's usual impact +
 * speed-gain damage, reduced by angle closeness — a perfect 45° hit is free.
 * @param {number} slot @param {import("./kart-registry.js").Kart} kart
 * @returns {boolean} whether the melon broke from it
 */
function SettleWallBounceDamage(slot, kart) {
    const p = kart.pendingBounce;
    kart.pendingBounce = undefined;
    if (!p) {
        return false;
    }
    const damage = WallBounceDamage(p.impactSpeed, p.speedGain, p.angleFactor);
    DamageKart(
        slot,
        kart,
        damage,
        `wall bounce ${p.angle.toFixed(0)}° (angle ${p.angleFactor.toFixed(2)}, jump ${p.jumpFactor.toFixed(2)}), ` +
        `impact ${p.impactSpeed.toFixed(0)} u/s, gained ${p.speedGain.toFixed(0)} u/s`
    );
    if (kart.health <= 0) {
        BreakMelon(slot, kart, p.impactDir, p.impactSpeed);
        return true;
    }
    return false;
}

/**
 * Converts a direction vector into the pitch/yaw/roll a particle template
 * should spawn with to visually point along it (Source's angle convention:
 * yaw rotates around Z, pitch is negative-up/positive-down from horizontal).
 * @param {{ x: number, y: number, z: number }} dir @param {number} length
 */
function DirectionToAngles(dir, length) {
    const yaw = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    const pitch = -(Math.asin(Math.min(1, Math.max(-1, dir.z / length))) * 180) / Math.PI;
    return { pitch, yaw, roll: 0 };
}

// Every break's spawned effect entities, kept so they can stay at the crash
// site for a long time (BREAK_EFFECT_LIFETIME) and still get cleaned up —
// see PruneBreakEffects.
/** @type {Array<{ spawnTime: number, entities: any[] }>} */
let breakEffects = [];

/** Removes break effects that are too old, or too many. */
function CleanUpBreakEffects() {
    const { expired, kept } = PruneBreakEffects(breakEffects, Instance.GetGameTime());
    breakEffects = kept;
    for (const effect of expired) {
        for (const entity of effect.entities) {
            if (entity.IsValid()) {
                entity.Remove();
            }
        }
    }
}

/**
 * Spawns a single named point_template's particle effect, if it's actually
 * placed in Hammer. @param {string} templateName @param {any} position @param {any} angles
 * @returns {any[]} the spawned entities (empty if nothing spawned)
 */
function SpawnParticleTemplate(templateName, position, angles) {
    const template = Instance.FindEntityByName(templateName);
    // Msg, not Debug: a missing/broken break template must be visible in the
    // console even with DEBUG off — silently spawning nothing is the bug.
    if (!template) {
        Instance.Msg(`[melon_drive] SpawnParticleTemplate: no entity named "${templateName}" found — add a point_template in Hammer with a particle system to see break effects`);
        return [];
    }
    if (!(template instanceof PointTemplate)) {
        Instance.Msg(`[melon_drive] SpawnParticleTemplate: entity "${templateName}" exists but is a ${template.GetClassName()}, not a point_template`);
        return [];
    }
    const spawned = template.ForceSpawn(position, angles) ?? [];
    if (spawned.length === 0) {
        Instance.Msg(`[melon_drive] SpawnParticleTemplate: ForceSpawn of "${templateName}" returned nothing — check its Template01.. entries in Hammer`);
        return [];
    }
    for (const entity of spawned) {
        // "Start Active" alone doesn't reliably play a particle system spawned
        // later from a point_template — start it explicitly.
        if (entity.GetClassName() === "info_particle_system") {
            Instance.EntFireAtTarget({ target: entity, input: "Start" });
        }
    }
    Debug(`SpawnParticleTemplate: "${templateName}" spawned ${spawned.map((e) => e.GetClassName()).join(", ")} at ${JSON.stringify(position)}`);
    return spawned;
}

/**
 * Spawns the melon's real break pieces (see BREAK_PIECES_TEMPLATE_NAME) at
 * the crash site and flings them outward. Randomly turned around the
 * vertical axis so every break scatters differently.
 * @param {any} position @param {{ r: number, g: number, b: number, a: number }} color
 * @returns {any[]} the spawned pieces
 */
function SpawnBreakPieces(position, color) {
    const angles = { pitch: 0, yaw: Math.random() * 360, roll: 0 };
    const pieces = SpawnParticleTemplate(BREAK_PIECES_TEMPLATE_NAME, position, angles);
    for (const piece of pieces) {
        // Same tint as the melon was painted, so the chunks match it.
        piece.SetColor(color);
        const spin = () => (Math.random() * 2 - 1) * BREAK_PIECE_SPIN;
        piece.Teleport({
            velocity: BreakPieceVelocity(position, piece.GetAbsOrigin(), Math.random() * Math.PI * 2),
            angularVelocity: { x: spin(), y: spin(), z: spin() },
        });
    }
    return pieces;
}

/**
 * Spawns all break effects at the crash site — the main burst, the chunks
 * particle layered on top of it, and the real pieces that stay lying on the
 * ground. Independent of each other (any can be missing from Hammer without
 * the others failing).
 * @param {any} position @param {any} angles @param {{ r: number, g: number, b: number, a: number }} color the melon's paint, for the pieces
 * @returns {boolean} whether at least one of them actually spawned — see
 * BreakMelon's fallback tint for why callers need to know this, not just
 * fire-and-forget.
 */
function SpawnBreakParticles(position, angles, color) {
    const entities = [
        ...SpawnParticleTemplate(BREAK_PARTICLE_TEMPLATE_NAME, position, angles),
        ...SpawnParticleTemplate(BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME, position, angles),
        ...SpawnBreakPieces(position, color),
    ];
    if (entities.length === 0) {
        return false;
    }
    // Deliberately not removed on respawn — the chunks should keep lying at
    // the crash site long after the melon is back on the track.
    breakEffects.push({ spawnTime: Instance.GetGameTime(), entities });
    CleanUpBreakEffects();
    Instance.Delay(BREAK_EFFECT_LIFETIME).then(CleanUpBreakEffects);
    return true;
}

/**
 * Teleports a kart's melon back to its last checkpoint and resets it to a
 * fresh, undamaged state — the shared final step of both the automatic
 * post-break respawn and the manual "Respawn at last checkpoint" user menu
 * button.
 * @param {import("./kart-registry.js").Kart} kart
 */
export function RespawnKartAtCheckpoint(kart) {
    kart.melon.Teleport({
        position: kart.checkpointPosition,
        angles: kart.checkpointAngles,
        velocity: { x: 0, y: 0, z: 0 },
    });
    kart.health = MELON_MAX_HEALTH;
    // Cleared, not measured against zero: this is our own intentional
    // velocity reset, not a physical impact to react to.
    kart.lastVelocity = undefined;
    kart.settled = false;
    kart.speedCap = undefined;
    kart.pendingBounce = undefined;
}

/**
 * Sets a kart's melon color and remembers it so it survives a break/respawn
 * (BreakMelon hides the melon entirely while broken, without losing track of
 * the color underneath — see ScheduleRespawnAfterBreak). Used by both the
 * melon_paint map trigger and the user menu's color swatches.
 * @param {import("./kart-registry.js").Kart} kart @param {{ r: number, g: number, b: number, a: number }} color
 */
export function SetKartPaintColor(kart, color) {
    kart.paintColor = color;
    if (!kart.breaking) {
        kart.melon.SetColor(color);
    }
}

/**
 * Common tail end of every break, whether it was caught by our own
 * kart.health tracking (BreakMelon) or discovered after the fact because the
 * melon vanished on its own (HandleMelonLost): wait out BREAK_RESPAWN_DELAY,
 * then bring the kart back — reusing the same (hidden) melon where possible,
 * or spawning a brand new one at the checkpoint if the original is actually
 * gone.
 * @param {number} slot @param {import("./kart-registry.js").Kart} kart
 */
function ScheduleRespawnAfterBreak(slot, kart) {
    // Which race-flow teleport this break happened after — see
    // Kart.teleportGen. Compared against, rather than checking
    // kart.racing/locked: those also describe perfectly ordinary states
    // (free-roaming the hub, parked after finishing) in which a broken melon
    // still needs to go back to its checkpoint.
    const teleportGen = kart.teleportGen;
    Instance.Delay(BREAK_RESPAWN_DELAY).then(() => {
        kart.breaking = false;
        kart.breakTime = undefined;
        if (!kart.pawn.IsValid() || karts.get(slot) !== kart) {
            return; // player disconnected, or a fresh kart already replaced this one
        }
        if (!kart.melon.IsValid()) {
            // The melon wasn't just hidden by us — it's genuinely gone (the
            // engine's own physics broke the prop_physics_multiplayer for
            // real on a hard enough hit, see HandleMelonLost) — spawn a fresh
            // one instead of teleporting an entity that no longer exists.
            // Checked before the teleportGen case below, and regardless of
            // racing/locked: otherwise a melon lost outside a heat would never
            // come back, and Think would re-run HandleMelonLost on it forever.
            // checkpointPosition is correct even if the race flow moved on
            // meanwhile — BeginHeat/ReturnAllToHub set it to their own
            // (skipped, since the melon was dead) teleport target.
            RespawnDestroyedMelon(slot, kart);
            return;
        }
        kart.melon.SetColor(kart.paintColor);
        // Back from the pulled-out break camera (ApplyBreakCameraZoom) to the
        // player's normal chase offset.
        ApplyCameraFollow(kart);
        if (kart.teleportGen !== teleportGen) {
            // The race flow moved this kart while it was mid-break (next
            // heat's BeginHeat, or ReturnAllToHub via finish/moderator
            // abort/the player's own "Return to hub" button). That
            // already-current teleport wins — don't stomp it a second later
            // with a now-stale checkpoint.
            kart.health = MELON_MAX_HEALTH;
            return;
        }
        RespawnKartAtCheckpoint(kart);
    });
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart */
function RespawnDestroyedMelon(slot, kart) {
    const melon = SpawnMelonAt(kart.checkpointPosition, kart.checkpointAngles);
    if (!melon) {
        // kart.breaking is already cleared, so Think's invalid-melon check
        // runs HandleMelonLost again next tick — that's the retry.
        Debug(`slot ${slot}: could not respawn a melon after it was destroyed, will keep retrying`);
        return;
    }
    kart.melon = melon;
    kart.melon.SetColor(kart.paintColor);
    kart.health = MELON_MAX_HEALTH;
    kart.lastVelocity = undefined;
    kart.settled = false;
    kart.speedCap = undefined;
    kart.pendingBounce = undefined;
    ApplyCameraFollow(kart);
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart @param {{ x: number, y: number, z: number }} impactDir @param {number} impactSpeed */
export function BreakMelon(slot, kart, impactDir, impactSpeed) {
    if (kart.breaking) {
        return; // already broken and counting down to its respawn
    }
    kart.breaking = true;
    kart.breakTime = Instance.GetGameTime();
    const breakPosition = kart.melon.GetAbsOrigin();
    // Oriented along the velocity change the impact caused, not the melon's
    // own orientation — while rolling, that's an essentially random tumble
    // unrelated to which way it just got hit.
    const breakAngles = DirectionToAngles(impactDir, impactSpeed);
    Debug(`slot ${slot}: melon broke at ${JSON.stringify(breakPosition)} — respawning at checkpoint ${kart.checkpointIndex} in ${BREAK_RESPAWN_DELAY}s`);

    kart.melon.Move({ velocity: { x: 0, y: 0, z: 0 } });
    kart.lastVelocity = undefined;
    kart.settled = false;
    // Hidden entirely when the break particle actually spawned — it reads as
    // the melon shredding apart, which a dark husk just sitting there in one
    // piece doesn't. But without a "melon_break_template" placed in Hammer
    // there's nothing else marking the crash site: the melon would just
    // vanish and silently reappear at the checkpoint BREAK_RESPAWN_DELAY
    // later, which looks like the camera instantly cut to the respawn. Tint
    // it dark and leave it visible instead, so there's always something at
    // the crash site to see while it waits out the respawn delay.
    // kart.paintColor itself is untouched either way, restored in
    // ScheduleRespawnAfterBreak.
    const particlesSpawned = SpawnBreakParticles(breakPosition, breakAngles, kart.paintColor);
    kart.melon.SetColor(particlesSpawned ? { r: 255, g: 255, b: 255, a: 0 } : BREAK_TINT_FALLBACK);

    ScheduleRespawnAfterBreak(slot, kart);
}

/**
 * Recovery path for a melon that broke for real instead of just being hidden
 * by BreakMelon above — the engine's own physics can destroy a
 * prop_physics_multiplayer outright on a hard enough impact, sometimes
 * before our own kart.health tracking even gets a chance to react. Without
 * this, that kart would silently lose its melon with no break particle, no
 * delay, and (since nothing else re-creates it while the player's pawn stays
 * alive — see gamemode/index.js) no way back at all. Runs the same
 * particle + delay + checkpoint-respawn sequence as a script-detected break,
 * using the last position/angles Think() saw the melon at (it's already gone
 * by the time this runs, so it can't be asked directly).
 * @param {number} slot @param {import("./kart-registry.js").Kart} kart
 */
export function HandleMelonLost(slot, kart) {
    if (kart.breaking) {
        return; // already mid-break/respawn over this same loss
    }
    kart.breaking = true;
    kart.health = 0;
    const breakPosition = kart.lastKnownPosition ?? kart.checkpointPosition;
    const breakAngles = kart.lastKnownAngles ?? kart.checkpointAngles;
    Debug(`slot ${slot}: melon was destroyed at ${JSON.stringify(breakPosition)} — respawning at checkpoint ${kart.checkpointIndex} in ${BREAK_RESPAWN_DELAY}s`);
    SpawnBreakParticles(breakPosition, breakAngles, kart.paintColor);
    ScheduleRespawnAfterBreak(slot, kart);
}

/** Fraction of the jump cooldown that has recharged, 0 (just used) to 1 (ready). */
/** @param {{ nextJumpTime: number }} kart */
export function GetJumpChargeFraction(kart) {
    const remaining = kart.nextJumpTime - Instance.GetGameTime();
    if (remaining <= 0) {
        return 1;
    }
    return 1 - remaining / JUMP_COOLDOWN;
}
