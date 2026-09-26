import { Instance, CSInputs, PointTemplate } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { karts } from "./kart-registry.js";
import { SpawnMelonAt } from "./kart-spawn.js";
import { ApplyCameraFollow } from "./camera.js";
import {
    FORWARD_ACCEL,
    REVERSE_ACCEL,
    STRAFE_ACCEL,
    MAX_SPEED,
    COAST_FRICTION,
    JUMP_SPEED,
    JUMP_COOLDOWN,
    IMPACT_DAMAGE_THRESHOLD,
    IMPACT_DAMAGE_SCALE,
    MELON_MAX_HEALTH,
    BREAK_RESPAWN_DELAY,
    BREAK_TINT_FALLBACK,
    BREAK_PARTICLE_TEMPLATE_NAME,
    BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME,
    MELON_REST_SPEED,
    SETTLE_NUDGE_ANGULAR_SPEED,
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
        return;
    }

    const currentVelocity = melon.GetAbsVelocity();
    if (kart.lastVelocity) {
        const impactDelta = {
            x: currentVelocity.x - kart.lastVelocity.x,
            y: currentVelocity.y - kart.lastVelocity.y,
            z: currentVelocity.z - kart.lastVelocity.z,
        };
        const impactSpeed = Math.hypot(impactDelta.x, impactDelta.y, impactDelta.z);
        if (impactSpeed > IMPACT_DAMAGE_THRESHOLD) {
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
            const nudgeAngle = Math.random() * Math.PI * 2;
            melon.Move({
                angularVelocity: {
                    x: Math.cos(nudgeAngle) * SETTLE_NUDGE_ANGULAR_SPEED,
                    y: 0,
                    z: Math.sin(nudgeAngle) * SETTLE_NUDGE_ANGULAR_SPEED,
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

    let vx = currentVelocity.x;
    let vy = currentVelocity.y;

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

    const horizSpeed = Math.hypot(vx, vy);
    if (horizSpeed > MAX_SPEED) {
        const scale = MAX_SPEED / horizSpeed;
        vx *= scale;
        vy *= scale;
    }

    // Jump: straight-up force, always allowed (no ground check — the melon
    // wobbles too much while rolling for a ground trace to be reliable),
    // but limited to once per JUMP_COOLDOWN seconds via kart.nextJumpTime.
    let vz = currentVelocity.z;
    if (jumpPressed) {
        const now = Instance.GetGameTime();
        const ready = now >= kart.nextJumpTime;
        Debug(`Jump pressed: ready=${ready} forwardInput=${forwardInput} strafeInput=${strafeInput}`);
        if (ready) {
            vz = JUMP_SPEED;
            kart.nextJumpTime = now + JUMP_COOLDOWN;
        }
    }

    melon.Move({ velocity: { x: vx, y: vy, z: vz } });
    // What we commanded this tick — compared against the actual velocity
    // physics settles on by next tick to detect collisions (see the top of
    // this function).
    kart.lastVelocity = { x: vx, y: vy, z: vz };
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart @param {number} impactSpeed */
export function ApplyImpactDamage(slot, kart, impactSpeed) {
    const damage = (impactSpeed - IMPACT_DAMAGE_THRESHOLD) * IMPACT_DAMAGE_SCALE;
    kart.health -= damage;
    Debug(
        `slot ${slot}: impact ${impactSpeed.toFixed(0)} u/s -> ${damage.toFixed(0)} dmg, ` +
        `health ${kart.health.toFixed(0)}/${MELON_MAX_HEALTH}`
    );
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

/**
 * Spawns a single named point_template's particle effect, if it's actually
 * placed in Hammer. @param {string} templateName @param {any} position @param {any} angles
 * @returns {boolean} whether it actually spawned
 */
function SpawnParticleTemplate(templateName, position, angles) {
    const template = Instance.FindEntityByName(templateName);
    if (!template) {
        Debug(`SpawnParticleTemplate: no entity named "${templateName}" found — add a point_template in Hammer with a "Start Active" particle system to see break effects`);
        return false;
    }
    if (!(template instanceof PointTemplate)) {
        Debug(`SpawnParticleTemplate: entity "${templateName}" exists but is a ${template.GetClassName()}, not a point_template`);
        return false;
    }
    template.ForceSpawn(position, angles);
    return true;
}

/**
 * Spawns both break effects at the crash site — the main burst plus a
 * separate melon-chunks template layered on top of it. Independent of each
 * other (either can be missing from Hammer without the other failing).
 * @param {any} position @param {any} angles
 * @returns {boolean} whether at least one of them actually spawned — see
 * BreakMelon's fallback tint for why callers need to know this, not just
 * fire-and-forget.
 */
function SpawnBreakParticles(position, angles) {
    const spawnedMain = SpawnParticleTemplate(BREAK_PARTICLE_TEMPLATE_NAME, position, angles);
    const spawnedChunks = SpawnParticleTemplate(BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME, position, angles);
    return spawnedMain || spawnedChunks;
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
    ApplyCameraFollow(kart);
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart @param {{ x: number, y: number, z: number }} impactDir @param {number} impactSpeed */
export function BreakMelon(slot, kart, impactDir, impactSpeed) {
    if (kart.breaking) {
        return; // already broken and counting down to its respawn
    }
    kart.breaking = true;
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
    const particlesSpawned = SpawnBreakParticles(breakPosition, breakAngles);
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
    SpawnBreakParticles(breakPosition, breakAngles);
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
