import { Instance, CSInputs, PointTemplate } from "cs_script/point_script";
import { Debug } from "./debug.js";
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
    BREAK_TINT,
    BREAK_PARTICLE_TEMPLATE_NAME,
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
        return;
    }

    // Broken and waiting out BREAK_RESPAWN_DELAY (see BreakMelon) — unlike
    // `locked` above, freeze completely (gravity included). It's already
    // sitting wherever it crashed, tinted dark, and should just hold still
    // until the delayed respawn teleports it away rather than keep tumbling
    // (which would also spuriously re-trigger the impact check below).
    if (kart.breaking) {
        melon.Move({ velocity: { x: 0, y: 0, z: 0 } });
        kart.lastVelocity = undefined;
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

    // Direction comes from the player's look direction (mouse), not a
    // separate turn control — this is what makes it "free-look" driving.
    const rad = (pawn.GetEyeAngles().yaw * Math.PI) / 180;
    const forwardDir = { x: Math.cos(rad), y: Math.sin(rad) };
    const rightDir = { x: Math.sin(rad), y: -Math.cos(rad) };

    const forwardInput =
        (pawn.IsInputPressed(CSInputs.FORWARD) ? 1 : 0) - (pawn.IsInputPressed(CSInputs.BACK) ? 1 : 0);
    const strafeInput =
        (pawn.IsInputPressed(CSInputs.RIGHT) ? 1 : 0) - (pawn.IsInputPressed(CSInputs.LEFT) ? 1 : 0);

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
    if (pawn.WasInputJustPressed(CSInputs.JUMP)) {
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

/** @param {any} position @param {any} angles */
function SpawnBreakParticles(position, angles) {
    const template = Instance.FindEntityByName(BREAK_PARTICLE_TEMPLATE_NAME);
    if (!template) {
        Debug(`SpawnBreakParticles: no entity named "${BREAK_PARTICLE_TEMPLATE_NAME}" found — add a point_template in Hammer with a "Start Active" particle system to see break effects`);
        return;
    }
    if (!(template instanceof PointTemplate)) {
        Debug(`SpawnBreakParticles: entity "${BREAK_PARTICLE_TEMPLATE_NAME}" exists but is a ${template.GetClassName()}, not a point_template`);
        return;
    }
    template.ForceSpawn(position, angles);
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
}

/**
 * Sets a kart's melon color and remembers it so it survives a break/respawn
 * (BreakMelon covers the melon with BREAK_TINT temporarily, without losing
 * track of the color underneath). Used by both the melon_paint map trigger
 * and the user menu's color swatches.
 * @param {import("./kart-registry.js").Kart} kart @param {{ r: number, g: number, b: number, a: number }} color
 */
export function SetKartPaintColor(kart, color) {
    kart.paintColor = color;
    if (!kart.breaking) {
        kart.melon.SetColor(color);
    }
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
    kart.melon.SetColor(BREAK_TINT); // kart.paintColor itself is untouched, restored below
    SpawnBreakParticles(breakPosition, breakAngles);

    Instance.Delay(BREAK_RESPAWN_DELAY).then(() => {
        kart.breaking = false;
        if (!kart.melon.IsValid()) {
            return; // pruned meanwhile (e.g. the player disconnected)
        }
        kart.melon.SetColor(kart.paintColor);
        if (kart.locked) {
            // The race flow moved on while this melon was mid-break (heat
            // aborted, or a fresh BeginHeat/ReturnAllToHub already placed
            // it) — that already-current teleport wins, don't stomp it with
            // our now-stale checkpointPosition.
            kart.health = MELON_MAX_HEALTH;
            return;
        }
        RespawnKartAtCheckpoint(kart);
    });
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
