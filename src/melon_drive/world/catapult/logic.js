// Catapults (CATAPULT_* in world/catapult/constants.js). Pure rules, no
// cs_script import; world/catapult/catapult.js applies them
// (test/world/catapult.test.mjs). The arm's swing here is the same as the
// model's animations (tools/models/make-catapult-model.mjs uses ArmAngle).
import {
    CATAPULT_BASE_MODEL,
    CATAPULT_ARM_MODEL,
    CATAPULT_NAME_PATTERN,
    CATAPULT_LAUNCH_FORWARD,
    CATAPULT_LAUNCH_UP,
    CATAPULT_PIVOT,
    CATAPULT_ARM_LENGTH,
    CATAPULT_SEAT_LIFT,
    CATAPULT_REST_ANGLE,
    CATAPULT_RELEASE_ANGLE,
    CATAPULT_FIRE_ANGLE,
    CATAPULT_FIRE_SECONDS,
    CATAPULT_FIRED_SECONDS,
    CATAPULT_RELOAD_SECONDS,
    CATAPULT_SEAT_HALF_WIDTH,
    CATAPULT_SEAT_BELOW,
    CATAPULT_SEAT_ABOVE,
} from "./constants.js";
import { SpikeSpringAxes } from "../spike-spring/logic.js";

/** @typedef {{ x: number, y: number, z: number }} Vec */
/** @typedef {{ pitch: number, yaw: number, roll: number }} Angles */
/** @typedef {"ready" | "loaded" | "firing" | "fired" | "reloading"} CatapultPhase */

const Normalized = (/** @type {string} */ model) => model.toLowerCase().replace(/\\/g, "/").replace(/_c$/, "");
/** Whether a prop with this model is a catapult's base. @param {string} model */
export const IsCatapultBaseModel = (model) => Normalized(model).endsWith(CATAPULT_BASE_MODEL);
/** Whether a prop with this model is a catapult's arm. @param {string} model */
export const IsCatapultArmModel = (model) => Normalized(model).endsWith(CATAPULT_ARM_MODEL);

/** The throw a base's name sets (catapult_<forward>_<up>), else the defaults. @param {string} name */
export function CatapultLaunchFromName(name) {
    const match = CATAPULT_NAME_PATTERN.exec(name.trim());
    return {
        forward: match ? Number(match[1]) : CATAPULT_LAUNCH_FORWARD,
        up: match ? Number(match[2]) : CATAPULT_LAUNCH_UP,
    };
}

/** How long into the throw the arm passes CATAPULT_RELEASE_ANGLE (it speeds up: angle grows with time squared). */
export const RELEASE_SECONDS = CATAPULT_FIRE_SECONDS
    * Math.sqrt((CATAPULT_RELEASE_ANGLE - CATAPULT_REST_ANGLE) / (CATAPULT_FIRE_ANGLE - CATAPULT_REST_ANGLE));

/**
 * The arm's angle (degrees up from pointing back) `t` seconds into a phase:
 * at rest when ready or loaded, swinging up ever faster while firing, up
 * when fired, easing back down while reloading.
 * @param {CatapultPhase} phase @param {number} t
 */
export function ArmAngle(phase, t) {
    if (phase === "firing") {
        const k = Math.min(1, Math.max(0, t / CATAPULT_FIRE_SECONDS));
        return CATAPULT_REST_ANGLE + (CATAPULT_FIRE_ANGLE - CATAPULT_REST_ANGLE) * k * k;
    }
    if (phase === "fired") {
        return CATAPULT_FIRE_ANGLE;
    }
    if (phase === "reloading") {
        const k = Math.min(1, Math.max(0, t / CATAPULT_RELOAD_SECONDS));
        const eased = k * k * (3 - 2 * k);
        return CATAPULT_FIRE_ANGLE + (CATAPULT_REST_ANGLE - CATAPULT_FIRE_ANGLE) * eased;
    }
    return CATAPULT_REST_ANGLE;
}

/**
 * The phase after `phase` has run `t` seconds: firing → fired → reloading →
 * ready by the clock (ready and loaded wait for the script); and how long
 * the new one has already run. @param {CatapultPhase} phase @param {number} t
 * @returns {{ phase: CatapultPhase, t: number }}
 */
export function NextPhase(phase, t) {
    if (phase === "firing" && t >= CATAPULT_FIRE_SECONDS) return NextPhase("fired", t - CATAPULT_FIRE_SECONDS);
    if (phase === "fired" && t >= CATAPULT_FIRED_SECONDS) return NextPhase("reloading", t - CATAPULT_FIRED_SECONDS);
    if (phase === "reloading" && t >= CATAPULT_RELOAD_SECONDS) return { phase: "ready", t: t - CATAPULT_RELOAD_SECONDS };
    return { phase, t };
}

/**
 * The melon's seat in model space (x forward, z up; y 0) with the arm at
 * `angle`: at the arm's end, CATAPULT_SEAT_LIFT above the bucket's floor.
 * @param {number} angle degrees @returns {Vec}
 */
export function SeatOffset(angle) {
    const a = (angle * Math.PI) / 180;
    const along = { x: -Math.cos(a), z: Math.sin(a) }; // the arm, from the pivot out
    const up = { x: Math.sin(a), z: Math.cos(a) }; // the bucket's open side
    return {
        x: CATAPULT_PIVOT.x + along.x * CATAPULT_ARM_LENGTH + up.x * CATAPULT_SEAT_LIFT,
        y: 0,
        z: CATAPULT_PIVOT.z + along.z * CATAPULT_ARM_LENGTH + up.z * CATAPULT_SEAT_LIFT,
    };
}

/** A model-space offset turned and moved into the world by the base's origin and angles. @param {Vec} origin @param {Angles} angles @param {Vec} offset @returns {Vec} */
export function ToWorld(origin, angles, offset) {
    const { forward, left, up } = SpikeSpringAxes(angles);
    return {
        x: origin.x + forward[0] * offset.x + left[0] * offset.y + up[0] * offset.z,
        y: origin.y + forward[1] * offset.x + left[1] * offset.y + up[1] * offset.z,
        z: origin.z + forward[2] * offset.x + left[2] * offset.y + up[2] * offset.z,
    };
}

/** A world point in the base's own frame (x forward, y left, z up from its origin): ToWorld undone. @param {Vec} origin @param {Angles} angles @param {Vec} point @returns {Vec} */
export function ToLocal(origin, angles, point) {
    const { forward, left, up } = SpikeSpringAxes(angles);
    const d = [point.x - origin.x, point.y - origin.y, point.z - origin.z];
    const Dot = (/** @type {number[]} */ a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
    return { x: Dot(forward), y: Dot(left), z: Dot(up) };
}

/**
 * Whether a melon's center (`local`, in the base's frame) is in the bucket at
 * rest: within CATAPULT_SEAT_HALF_WIDTH of the seat forward/back and to the
 * sides, from CATAPULT_SEAT_BELOW under it to CATAPULT_SEAT_ABOVE over it.
 * @param {Vec} local
 */
export function IsInBucket(local) {
    const seat = SeatOffset(CATAPULT_REST_ANGLE);
    const dz = local.z - seat.z;
    return Math.abs(local.x - seat.x) <= CATAPULT_SEAT_HALF_WIDTH && Math.abs(local.y - seat.y) <= CATAPULT_SEAT_HALF_WIDTH
        && dz >= -CATAPULT_SEAT_BELOW && dz <= CATAPULT_SEAT_ABOVE;
}

/**
 * The thrown melon's velocity: `launch.forward` along the way the catapult
 * faces (its yaw — a tilted base doesn't throw into the ground), `launch.up`
 * up, plus the base's own velocity (thrown from a rolling catapult).
 * @param {Angles} angles @param {{ forward: number, up: number }} launch @param {Vec} baseVelocity @returns {Vec}
 */
export function LaunchVelocity(angles, launch, baseVelocity) {
    const yaw = (angles.yaw * Math.PI) / 180;
    return {
        x: Math.cos(yaw) * launch.forward + baseVelocity.x,
        y: Math.sin(yaw) * launch.forward + baseVelocity.y,
        z: launch.up + Math.max(0, baseVelocity.z),
    };
}

/** The melon's distance to a point. @param {Vec} a @param {Vec} b */
export const Distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * The inputs that show a phase change on the arm (a prop_dynamic): the throw
 * once then held up, the wind-down once then at rest; the rest pose when it's
 * first paired (`previous` undefined).
 * @param {CatapultPhase | undefined} previous @param {CatapultPhase} phase
 * @returns {[string, string][]}
 */
export function ArmInputs(previous, phase) {
    if (previous === phase) return [];
    if (phase === "firing") return [["SetAnimationNotLooping", "fire"], ["SetIdleAnimationLooping", "fired"]];
    if (phase === "reloading") return [["SetAnimationNotLooping", "reload"], ["SetIdleAnimationLooping", "idle"]];
    if (previous === undefined) {
        const pose = phase === "fired" ? "fired" : "idle";
        return [["SetAnimationLooping", pose], ["SetIdleAnimationLooping", pose]];
    }
    return [];
}
