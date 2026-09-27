// Pure rules for generic teleporters — no cs_script import, so it's
// unit-testable in Node (see test/teleport.test.mjs). index.js's
// melon_teleport handler does the entity lookups and the actual teleport.
import { TELEPORT_TRIGGER_NAME_PATTERN, TELEPORT_KEEP_SPEED } from "../constants.js";

/**
 * The destination entity's name encoded in a teleport trigger's own name
 * (teleport_to_<destination>), or undefined if the name doesn't follow that
 * convention. Surrounding whitespace is ignored — Hammer keeps stray spaces.
 * @param {string} triggerName
 */
export function ParseTeleportTarget(triggerName) {
    const match = TELEPORT_TRIGGER_NAME_PATTERN.exec(triggerName.trim());
    return match ? match[1] : undefined;
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
 * TELEPORT_KEEP_SPEED off. Vertical speed is always dropped — a melon
 * teleported mid-fall would otherwise slam into the floor on arrival.
 * @param {{ x: number, y: number, z: number }} velocity @param {number} destinationYaw degrees
 */
export function TeleportExitVelocity(velocity, destinationYaw) {
    if (!TELEPORT_KEEP_SPEED) {
        return { x: 0, y: 0, z: 0 };
    }
    const speed = Math.hypot(velocity.x, velocity.y);
    const rad = (destinationYaw * Math.PI) / 180;
    return { x: Math.cos(rad) * speed, y: Math.sin(rad) * speed, z: 0 };
}
