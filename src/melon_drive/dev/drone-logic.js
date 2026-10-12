// Pure rules of the free-look drone (no engine calls) — see free-look.js.
import { DRONE_RESPONSE, DRONE_GROUND_NORMAL_Z, DRONE_LAND_SECONDS, DRONE_LAND_MAX_SPEED, DRONE_YAW_RATE, DRONE_MAX_TILT, DRONE_CRUISE_TILT, DRONE_TILT_RATE, DRONE_LASER_FORWARD, DRONE_LASER_UP, DRONE_LASER_LENGTH, DRONE_LASER_SEGMENT } from "./constants.js";

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
 * Whether the drone is on the floor: the trace down from it
 * (DRONE_GROUND_DISTANCE under its skids) hit floor — a normal pointing up
 * at least DRONE_GROUND_NORMAL_Z, not a wall or a ceiling's edge — and it
 * isn't `takingOff` (jump pressed on the ground, DRONE_TAKEOFF_SECONDS ago at
 * most).
 * @param {{ didHit: boolean, normal: Vec } | undefined} floor @param {boolean} takingOff
 */
export function IsDroneOnFloor(floor, takingOff) {
    return Boolean(floor?.didHit) && floor.normal.z >= DRONE_GROUND_NORMAL_Z && !takingOff;
}

/**
 * How long the drone has stood still on the floor after `dt` more: on it
 * (`onFloor`) and slower than DRONE_LAND_MAX_SPEED it counts up, anything
 * else starts over at 0. Landed (IsDroneLanded) once it reaches
 * DRONE_LAND_SECONDS — touching down alone doesn't park it.
 * @param {number} seconds @param {boolean} onFloor @param {Vec} velocity @param {number} dt
 */
export function StepDroneStillSeconds(seconds, onFloor, velocity, dt) {
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    return onFloor && speed < DRONE_LAND_MAX_SPEED ? seconds + dt : 0;
}

/**
 * Whether the drone has landed: still on the floor for DRONE_LAND_SECONDS
 * (StepDroneStillSeconds).
 * @param {number} stillSeconds
 */
export function IsDroneLanded(stillSeconds) {
    return stillSeconds >= DRONE_LAND_SECONDS;
}

/**
 * The drone's yaw after `dt`: landed it keeps `yaw` (looking around with
 * the mouse doesn't turn it), in the air it turns the shorter way round
 * towards the pilot's `viewYaw`, at most DRONE_YAW_RATE × `dt` degrees.
 * @param {number} yaw @param {number} viewYaw @param {boolean} landed @param {number} dt
 */
export function StepDroneYaw(yaw, viewYaw, landed, dt) {
    if (landed) {
        return yaw;
    }
    const gap = ((((viewYaw - yaw) % 360) + 540) % 360) - 180; // -180..180
    const step = DRONE_YAW_RATE * dt;
    return Math.abs(gap) <= step ? viewYaw : yaw + Math.sign(gap) * step;
}

/**
 * The inputs for the drone's prop_dynamic when it touches down
 * (`landed`) or takes off again: the rotors run down to a stop and stay
 * still, or run up and spin on. None while nothing changed.
 * @param {boolean} landed @param {boolean} wasLanded
 * @returns {[string, string][]}
 */
export function DroneRotorInputs(landed, wasLanded) {
    if (landed === wasLanded) {
        return [];
    }
    return landed
        ? [["SetAnimationNotLooping", "spindown"], ["SetIdleAnimationLooping", "landed"]]
        : [["SetAnimationNotLooping", "spinup"], ["SetIdleAnimationLooping", "spin"]];
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

/** The unit vector a view (pitch + = down, yaw) looks along. @param {{ pitch: number, yaw: number }} view @returns {Vec} */
export function ViewForward(view) {
    const p = (view.pitch * Math.PI) / 180, y = (view.yaw * Math.PI) / 180;
    return { x: Math.cos(p) * Math.cos(y), y: Math.cos(p) * Math.sin(y), z: -Math.sin(p) };
}

/**
 * Where the drone's laser starts and the farthest it reaches: from the
 * camera's recording light (DRONE_LASER_FORWARD ahead, DRONE_LASER_UP up in
 * the drone's frame — turned and tipped with it) along the pilot's view,
 * DRONE_LASER_LENGTH long.
 * @param {Vec} position the drone @param {{ pitch: number, yaw: number }} angles the drone's
 * @param {{ pitch: number, yaw: number }} view the pilot's
 * @returns {{ start: Vec, end: Vec }}
 */
export function DroneLaserRay(position, angles, view) {
    const ahead = ViewForward(angles);
    const p = (angles.pitch * Math.PI) / 180, y = (angles.yaw * Math.PI) / 180;
    const up = { x: Math.sin(p) * Math.cos(y), y: Math.sin(p) * Math.sin(y), z: Math.cos(p) };
    const start = {
        x: position.x + ahead.x * DRONE_LASER_FORWARD + up.x * DRONE_LASER_UP,
        y: position.y + ahead.y * DRONE_LASER_FORWARD + up.y * DRONE_LASER_UP,
        z: position.z + ahead.z * DRONE_LASER_FORWARD + up.z * DRONE_LASER_UP,
    };
    const dir = ViewForward(view);
    return { start, end: { x: start.x + dir.x * DRONE_LASER_LENGTH, y: start.y + dir.y * DRONE_LASER_LENGTH, z: start.z + dir.z * DRONE_LASER_LENGTH } };
}

/** How many laser segments a drone needs for a full-length beam. */
export const DRONE_LASER_SEGMENTS = Math.ceil(DRONE_LASER_LENGTH / DRONE_LASER_SEGMENT);

/**
 * Where each laser segment (DRONE_LASER_SEGMENT long, from its origin along
 * its +X) starts, for a beam `length` long from `start` along unit `dir`:
 * end to end, the last one pushed back to end exactly at `length` (it
 * overlaps the one before, so every segment stays full width); the unused
 * ones on top of the first. Shorter than one segment, they're all scaled
 * down to `length` (`scale`).
 * @param {Vec} start @param {Vec} dir @param {number} length
 * @returns {{ positions: Vec[], scale: number }}
 */
export function LaserSegments(start, dir, length) {
    const scale = Math.min(1, length / DRONE_LASER_SEGMENT);
    const used = Math.max(1, Math.ceil(length / DRONE_LASER_SEGMENT));
    const positions = Array.from({ length: DRONE_LASER_SEGMENTS }, (_, i) => {
        const along = i < used ? Math.max(0, Math.min(i * DRONE_LASER_SEGMENT, length - DRONE_LASER_SEGMENT)) : 0;
        return { x: start.x + dir.x * along, y: start.y + dir.y * along, z: start.z + dir.z * along };
    });
    return { positions, scale };
}
