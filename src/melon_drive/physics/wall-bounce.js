// Engine side of the wall bounce: finding the wall's normal on impact
// (traces + IsWallContact), computing the bounce, DEBUG logging, and
// charging its damage once the jump-timing window closes. The math is in
// ../logic/wall-bounce.js.
import { Instance, PointTemplate } from "cs_script/point_script";
import { DEBUG, Debug } from "../debug.js";
import { TraceLine, TraceSphere } from "../trace.js";
import {
    JumpTimingFactor,
    PickIncomingVelocity,
    ReflectOffWall,
    WallBounceDamage,
    IsWallContact,
    GetBounceRating,
} from "../logic/wall-bounce.js";
import {
    WALL_NORMAL_MAX_Z,
    WALL_BOUNCE_TRACE_RADIUS,
    WALL_BOUNCE_TRACE_DISTANCE,
    WALL_BOUNCE_SPHERE_TRACE_DISTANCE,
    BOUNCE_RATINGS,
    PERFECT_SPARK_TEMPLATE_NAME,
    PERFECT_SPARK_LIFETIME,
} from "../constants/index.js";
import { DamageKart } from "./damage.js";
import { BreakMelon } from "./breaking.js";

/**
 * Whether the impact this tick was against a wall, and if so that wall's
 * (horizontal, unit-length) normal — see the trace order inside. Floors/
 * ceilings (mostly vertical normal) and other physics props (other karts'
 * melons, loose melons in the map) don't count — only walls bounce.
 * @param {import("../kart-registry.js").Kart} kart @param {{ x: number, y: number, z: number }} impactDelta
 * @returns {{ x: number, y: number, method: string, hitPoint?: any } | null}
 */
export function DetectWallNormal(kart, impactDelta) {
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
 * DEBUG only: logs the velocity-based bounce angle next to the look-based
 * one, so a "that felt like 45°" mismatch can be told apart from a
 * measuring bug.
 * @param {import("../kart-registry.js").Kart} kart
 * @param {{ x: number, y: number, method: string }} n @param {number} angle
 */
function DebugLogBounce(kart, n, angle) {
    if (!DEBUG) {
        return;
    }
    const yaw = (kart.pawn.GetEyeAngles().yaw * Math.PI) / 180;
    const lookDir = { x: Math.cos(yaw), y: Math.sin(yaw) };
    const lookInto = -(lookDir.x * n.x + lookDir.y * n.y);
    const lookAngle = lookInto > 0 ? (Math.acos(Math.min(1, lookInto)) * 180) / Math.PI : NaN;
    Debug(
        `bounce angle: velocity ${angle.toFixed(1)}°, look ${Number.isNaN(lookAngle) ? "away from wall" : lookAngle.toFixed(1) + "°"}, ` +
        `normal via ${n.method}`
    );
}

/**
 * Reflects the melon's pre-impact horizontal velocity off a wall and scales
 * it by how well the hit was angled (see WALL_BOUNCE_* in constants/wall-bounce.js).
 * Vertical velocity is left to physics — a bounce never launches upward.
 * @param {import("../kart-registry.js").Kart} kart @param {{ x: number, y: number, method: string, hitPoint?: any }} n @param {number} now
 * @returns {{ velocity: { x: number, y: number }, angle: number, angleFactor: number, jumpFactor: number, speedGain: number } | null}
 *   null if the melon wasn't actually moving into the wall
 */
export function ComputeWallBounce(kart, n, now) {
    const v = PickIncomingVelocity(/** @type {{ x: number, y: number, z: number }} */ (kart.lastVelocity), kart.prevLastVelocity, n);
    // A timing press just *before* the hit counts here; one just after is
    // handled by UpdateKart's jump code upgrading kart.pendingBounce.
    const jumpFactor = kart.wallTimingPressTime !== undefined ? JumpTimingFactor(now - kart.wallTimingPressTime) : 0;
    const bounce = ReflectOffWall(v, n, jumpFactor);
    if (!bounce) {
        return null;
    }
    DebugLogBounce(kart, n, bounce.angle);
    if (GetBounceRating(bounce.angleFactor) === BOUNCE_RATINGS[0]) {
        PlayPerfectSpark(kart);
    }
    return { ...bounce, jumpFactor };
}

/**
 * Spawns two fresh copies of the perfect_hit_particle_template and starts
 * them, removed again after PERFECT_SPARK_LIFETIME: one left at the hit spot
 * on the wall, and one parented to the melon so it rides along — the melon
 * is off the wall so fast that the player would otherwise never see the
 * spark behind them. Fresh copies per hit, so several karts' perfect hits
 * at the same moment each show their own.
 * @param {import("../kart-registry.js").Kart} kart
 */
function PlayPerfectSpark(kart) {
    const template = Instance.FindEntityByName(PERFECT_SPARK_TEMPLATE_NAME);
    if (!(template instanceof PointTemplate)) {
        Debug(`PlayPerfectSpark: no point_template named "${PERFECT_SPARK_TEMPLATE_NAME}" in the map`);
        return;
    }
    const position = kart.melon.GetAbsOrigin();
    /** @type {import("cs_script/point_script").Entity[]} */
    const spawned = [];
    for (const followMelon of [false, true]) {
        const copy = template.ForceSpawn(position) ?? [];
        for (const entity of copy) {
            // ForceSpawn keeps the entity's Hammer offset from its template — put
            // it exactly on the melon, and start it explicitly (see
            // SpawnParticleTemplate in break-effects.js for why).
            entity.Teleport({ position });
            if (followMelon) {
                entity.SetParent(kart.melon);
            }
            if (entity.GetClassName() === "info_particle_system") {
                Instance.EntFireAtTarget({ target: entity, input: "Start" });
            }
        }
        spawned.push(...copy);
    }
    Instance.Delay(PERFECT_SPARK_LIFETIME).then(() => {
        for (const entity of spawned) {
            // The melon's copy goes with the melon if that's removed first.
            if (entity.IsValid()) {
                entity.Remove();
            }
        }
    });
}

/**
 * Charges kart.pendingBounce's damage now that its jump window is over (a
 * late jump can still have raised its speed gain): the wall's usual impact +
 * speed-gain damage, reduced by angle closeness — a perfect 45° hit is free.
 * @param {number} slot @param {import("../kart-registry.js").Kart} kart
 * @returns {boolean} whether the melon broke from it
 */
export function SettleWallBounceDamage(slot, kart) {
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
