// Pure rules of the free-look drone (no engine calls) — see free-look.js.
import { DRONE_RESPONSE, DRONE_MAX_TILT, DRONE_CRUISE_TILT, DRONE_TILT_RATE } from "./constants.js";

/** @typedef {{ x: number, y: number, z: number }} Vec */

/**
 * The velocity the pilot asks for: `forward` (W +1, S -1) along the view —
 * pitch included, so looking down and holding W dives —, `strafe` (D +1,
 * A -1) sideways and level, `lift` (jump +1, duck -1) straight up or down;
 * `speed` long whichever way, zero without input.
 * @param {{ forward: number, strafe: number, lift: number }} input
 * @param {{ pitch: number, yaw: number }} view @param {number} speed
 * @returns {Vec}
 */
export function DroneWishVelocity(input, view, speed) {
    const p = (view.pitch * Math.PI) / 180, y = (view.yaw * Math.PI) / 180;
    const forward = { x: Math.cos(p) * Math.cos(y), y: Math.cos(p) * Math.sin(y), z: -Math.sin(p) }; // Source pitch: + looks down
    const right = { x: Math.sin(y), y: -Math.cos(y), z: 0 };
    const wish = {
        x: forward.x * input.forward + right.x * input.strafe,
        y: forward.y * input.forward + right.y * input.strafe,
        z: forward.z * input.forward + input.lift,
    };
    const length = Math.hypot(wish.x, wish.y, wish.z);
    if (length < 1e-6) {
        return { x: 0, y: 0, z: 0 };
    }
    return { x: (wish.x / length) * speed, y: (wish.y / length) * speed, z: (wish.z / length) * speed };
}

/**
 * `velocity` after `dt` of the rotors pulling it towards `wish`: the gap
 * shrinks by a factor of e every 1/DRONE_RESPONSE seconds (the same for any
 * tick length). That's the drone's inertia — it carries its momentum into a
 * turn and coasts on after letting go, instead of changing course at once.
 * @param {Vec} velocity @param {Vec} wish @param {number} dt @returns {Vec}
 */
export function StepDroneVelocity(velocity, wish, dt) {
    const keep = Math.exp(-DRONE_RESPONSE * dt);
    return {
        x: wish.x + (velocity.x - wish.x) * keep,
        y: wish.y + (velocity.y - wish.y) * keep,
        z: wish.z + (velocity.z - wish.z) * keep,
    };
}

/**
 * `velocity` with its part into a surface (`normal`, pointing out of it)
 * taken away — what's left slides along it.
 * @param {Vec} velocity @param {Vec} normal @returns {Vec}
 */
export function ClipVelocity(velocity, normal) {
    const into = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
    if (into >= 0) {
        return { ...velocity };
    }
    return { x: velocity.x - normal.x * into, y: velocity.y - normal.y * into, z: velocity.z - normal.z * into };
}

/**
 * The tilt the drone wants (degrees, pitch + = nose down, roll + = right
 * side down): into the horizontal way it's speeding up (`accel`, full tilt
 * at DRONE_RESPONSE × `fullSpeed` — pulling away from a standstill), plus
 * DRONE_CRUISE_TILT into the way it's flying at `fullSpeed`; at most
 * DRONE_MAX_TILT each, relative to the view's `yaw` it faces.
 * @param {Vec} velocity @param {Vec} accel @param {number} yaw @param {number} fullSpeed
 * @returns {{ pitch: number, roll: number }}
 */
export function DroneTargetTilt(velocity, accel, yaw, fullSpeed) {
    const y = (yaw * Math.PI) / 180;
    const Ahead = (/** @type {Vec} */ v) => v.x * Math.cos(y) + v.y * Math.sin(y);
    const Right = (/** @type {Vec} */ v) => v.x * Math.sin(y) - v.y * Math.cos(y);
    const fullAccel = DRONE_RESPONSE * fullSpeed;
    const Tilt = (/** @type {number} */ a, /** @type {number} */ v) =>
        Math.max(-1, Math.min(1, a / fullAccel + (DRONE_CRUISE_TILT * v) / fullSpeed)) * DRONE_MAX_TILT;
    return { pitch: Tilt(Ahead(accel), Ahead(velocity)), roll: Tilt(Right(accel), Right(velocity)) };
}

/**
 * `tilt` turned towards `target` by at most DRONE_TILT_RATE × `dt` degrees
 * on each axis.
 * @param {{ pitch: number, roll: number }} tilt @param {{ pitch: number, roll: number }} target @param {number} dt
 */
export function StepDroneTilt(tilt, target, dt) {
    const step = DRONE_TILT_RATE * dt;
    const Toward = (/** @type {number} */ from, /** @type {number} */ to) => from + Math.max(-step, Math.min(step, to - from));
    return { pitch: Toward(tilt.pitch, target.pitch), roll: Toward(tilt.roll, target.roll) };
}
