// Steering grip (see STEER_GRIP_* in constants/driving.js): turning the
// melon's velocity towards where the player looks. Pure math, no engine.

/**
 * Turns horizontal velocity `v` towards unit direction `dir` by at most
 * `maxTurn` degrees, keeping its length. Unchanged if it's standing still or
 * more than `maxAngle` degrees away from `dir`.
 * @param {{ x: number, y: number }} v @param {{ x: number, y: number }} dir
 * @param {number} maxTurn @param {number} maxAngle
 * @returns {{ x: number, y: number }}
 */
export function SteerTowards(v, dir, maxTurn, maxAngle) {
    const speed = Math.hypot(v.x, v.y);
    if (speed === 0 || maxTurn <= 0) {
        return { x: v.x, y: v.y };
    }
    const current = Math.atan2(v.y, v.x);
    const target = Math.atan2(dir.y, dir.x);
    // Signed difference in -PI..PI.
    const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    if (Math.abs(diff) > (maxAngle * Math.PI) / 180) {
        return { x: v.x, y: v.y };
    }
    const limit = (maxTurn * Math.PI) / 180;
    const angle = current + Math.max(-limit, Math.min(limit, diff));
    return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}
