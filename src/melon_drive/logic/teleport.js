// Pure rules for generic teleporters — no cs_script import, so it's
// unit-testable in Node (see test/teleport.test.mjs). index.js's
// melon_teleport handler does the entity lookups and the actual teleport.
import { TELEPORT_TRIGGER_NAME_PATTERN, TELEPORT_KEEP_SPEED } from "../constants/index.js";

/**
 * What a teleport trigger's own name encodes (teleport_[stop_|keep_]to_<destination>):
 * the destination entity's name and whether the melon keeps its speed
 * (stop/keep, else TELEPORT_KEEP_SPEED) — or undefined if the name doesn't
 * follow that convention. Surrounding whitespace is ignored — Hammer keeps
 * stray spaces.
 * @param {string} triggerName
 * @returns {{ destination: string, keepSpeed: boolean } | undefined}
 */
export function ParseTeleportTrigger(triggerName) {
    const match = TELEPORT_TRIGGER_NAME_PATTERN.exec(triggerName.trim());
    if (!match) {
        return undefined;
    }
    const keepSpeed = match[1] === "stop" ? false : match[1] === "keep" ? true : TELEPORT_KEEP_SPEED;
    return { destination: match[2], keepSpeed };
}

/**
 * Just the destination entity's name from a teleport trigger's name (see
 * ParseTeleportTrigger), or undefined.
 * @param {string} triggerName
 */
export function ParseTeleportTarget(triggerName) {
    return ParseTeleportTrigger(triggerName)?.destination;
}

/**
 * The player's view right after any teleport: turned to face `yaw` (the
 * destination's facing), keeping how far up/down they were looking so the
 * camera doesn't jerk vertically. Steering follows the view's yaw (see
 * UpdateKart), so without this a teleported player kept driving in their
 * old direction.
 * @param {{ pitch: number }} currentEye @param {number} yaw
 */
export function ViewAnglesFacing(currentEye, yaw) {
    return { pitch: currentEye.pitch, yaw, roll: 0 };
}

/**
 * The melon's velocity right after the teleport: its horizontal speed
 * carried over but pointed along the destination's facing (so a teleporter
 * keeps the race's flow instead of dead-stopping the melon), or zero with
 * keepSpeed off (the trigger's stop/keep mode, default TELEPORT_KEEP_SPEED).
 * Vertical speed is always dropped — a melon teleported mid-fall would
 * otherwise slam into the floor on arrival.
 * @param {{ x: number, y: number, z: number }} velocity @param {number} destinationYaw degrees
 * @param {boolean} [keepSpeed]
 */
export function TeleportExitVelocity(velocity, destinationYaw, keepSpeed = TELEPORT_KEEP_SPEED) {
    if (!keepSpeed) {
        return { x: 0, y: 0, z: 0 };
    }
    const speed = Math.hypot(velocity.x, velocity.y);
    const rad = (destinationYaw * Math.PI) / 180;
    return { x: Math.cos(rad) * speed, y: Math.sin(rad) * speed, z: 0 };
}
