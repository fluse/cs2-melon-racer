// Spike springs (SPIKE_SPRING_* in world/spike-spring/constants.js). Pure
// rules, no cs_script import; world/spike-spring/spike-spring.js applies them
// (test/world/spike-spring.test.mjs).
import {
    SPIKE_SPRING_NAME_PATTERN, SPIKE_SPRING_DOWN_SECONDS, SPIKE_SPRING_UP_SECONDS,
    SPIKE_SPRING_RISE_SECONDS, SPIKE_SPRING_POP_SECONDS, SPIKE_SPRING_SINK_SECONDS, SPIKE_SPRING_SINK_LETHAL_SHARE,
    SPIKE_SPRING_HALF_SIZE, SPIKE_SPRING_HEIGHT, SPIKE_SPRING_DEPTH,
} from "./constants.js";

/** @typedef {{ down: number, up: number, offset: number }} SpikeSpringConfig */
/** @typedef {"down" | "rise" | "up" | "sink"} SpikeSpringPhase */

/**
 * A spike spring's config from its entity name, or undefined if the name
 * doesn't make it one.
 * @param {string} name
 * @returns {SpikeSpringConfig | undefined} seconds down and up, clock offset
 */
export function ParseSpikeSpringName(name) {
    if (!SPIKE_SPRING_NAME_PATTERN.test(name)) {
        return undefined;
    }
    const parts = name.split("_").slice(2); // after "spike" and "spring"
    const IsNumber = (/** @type {string | undefined} */ part) => part !== undefined && /^\d+(?:\.\d+)?$/.test(part);
    const at = parts.findIndex((part, i) => IsNumber(part) && IsNumber(parts[i + 1]));
    const offset = parts.map((part) => /^offset(\d+(?:\.\d+)?)$/.exec(part)).find(Boolean);
    return {
        down: at < 0 ? SPIKE_SPRING_DOWN_SECONDS : Number(parts[at]),
        up: at < 0 ? SPIKE_SPRING_UP_SECONDS : Number(parts[at + 1]),
        offset: offset ? Number(offset[1]) : 0,
    };
}

/** One full round: down, rise, up, sink. @param {SpikeSpringConfig} config */
export const SpikeSpringPeriod = (config) => config.down + SPIKE_SPRING_RISE_SECONDS + config.up + SPIKE_SPRING_SINK_SECONDS;

/**
 * Where a spike spring is in its round at game time `time` — every one runs
 * on the same clock (shifted by its offset), so springs with the same
 * timing go up together — and whether its spikes hurt: from the pop out of
 * the floor until partway into the sink.
 * @param {number} time
 * @param {SpikeSpringConfig} config
 * @returns {{ phase: SpikeSpringPhase, lethal: boolean }}
 */
export function SpikeSpringState(time, config) {
    const period = SpikeSpringPeriod(config);
    let t = (((time + config.offset) % period) + period) % period;
    if (t < config.down) return { phase: "down", lethal: false };
    t -= config.down;
    if (t < SPIKE_SPRING_RISE_SECONDS) return { phase: "rise", lethal: t >= SPIKE_SPRING_POP_SECONDS };
    t -= SPIKE_SPRING_RISE_SECONDS;
    if (t < config.up) return { phase: "up", lethal: true };
    t -= config.up;
    return { phase: "sink", lethal: t < SPIKE_SPRING_SINK_SECONDS * SPIKE_SPRING_SINK_LETHAL_SHARE };
}

/**
 * The prop_dynamic inputs to fire when a spike spring goes from `previous`
 * to `phase` ([input, animation] pairs). Rise and sink play once, the idle
 * animation set with them holds the end pose afterwards; any other jump (the
 * first update, a hot reload, a skipped phase) puts it straight in the pose.
 * @param {SpikeSpringPhase | undefined} previous
 * @param {SpikeSpringPhase} phase
 * @returns {[string, string][]}
 */
export function SpikeSpringInputs(previous, phase) {
    if (previous === phase) return [];
    if (phase === "rise" && previous === "down") return [["SetAnimationNotLooping", "rise"], ["SetIdleAnimationLooping", "up"]];
    if (phase === "sink" && previous === "up") return [["SetAnimationNotLooping", "sink"], ["SetIdleAnimationLooping", "down"]];
    if ((phase === "up" && previous === "rise") || (phase === "down" && previous === "sink")) return [];
    const pose = phase === "rise" || phase === "up" ? "up" : "down";
    return [["SetAnimationLooping", pose], ["SetIdleAnimationLooping", pose]];
}

/**
 * A spring's own axes from its angles (degrees, Source's pitch/yaw/roll):
 * forward (x), left (y) and up (z, the way the spikes come out).
 * @param {{ pitch: number, yaw: number, roll: number }} angles
 */
export function SpikeSpringAxes({ pitch, yaw, roll }) {
    const r = Math.PI / 180;
    const sp = Math.sin(pitch * r), cp = Math.cos(pitch * r);
    const sy = Math.sin(yaw * r), cy = Math.cos(yaw * r);
    const sr = Math.sin(roll * r), cr = Math.cos(roll * r);
    return {
        forward: [cp * cy, cp * sy, -sp],
        left: [sr * sp * cy - cr * sy, sr * sp * sy + cr * cy, sr * cp],
        up: [cr * sp * cy + sr * sy, cr * sp * sy - sr * cy, cr * cp],
    };
}

/**
 * Whether a melon center `offset` from a spike spring's origin is on it, in
 * the spring's own frame (any rotation — floor, wall, ceiling): inside its
 * square, and between SPIKE_SPRING_DEPTH behind its surface and
 * SPIKE_SPRING_HEIGHT out of it.
 * @param {{ x: number, y: number, z: number }} offset
 * @param {{ pitch: number, yaw: number, roll: number }} angles
 */
export function IsOverSpikeSpring(offset, angles) {
    const { forward, left, up } = SpikeSpringAxes(angles);
    const d = [offset.x, offset.y, offset.z];
    const Along = (/** @type {number[]} */ axis) => d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
    const height = Along(up);
    if (height < -SPIKE_SPRING_DEPTH || height > SPIKE_SPRING_HEIGHT) return false;
    return Math.abs(Along(forward)) <= SPIKE_SPRING_HALF_SIZE && Math.abs(Along(left)) <= SPIKE_SPRING_HALF_SIZE;
}
