// Pure spawn-point rules — no cs_script import, so they're unit-testable in
// Node (test/kart/spawn-points-logic.test.mjs). Applied by kart/spawn-points.js.

/**
 * Index of the point in `points` nearest to `origin`, if it's within
 * `maxDistance` — undefined if there's none that close. Picks a gate
 * prefab's own shared-name spawn ("start_spawn", "checkpoint_spawn") for its
 * trigger: every copy of the gate carries one, and its own is the one right
 * next to it.
 * @param {Array<{ x: number, y: number, z: number }>} points
 * @param {{ x: number, y: number, z: number }} origin
 * @param {number} maxDistance
 * @returns {number | undefined}
 */
export function NearestWithin(points, origin, maxDistance) {
    const maxDistanceSq = maxDistance * maxDistance;
    let best;
    let bestDistanceSq = Infinity;
    points.forEach((p, i) => {
        const dx = p.x - origin.x;
        const dy = p.y - origin.y;
        const dz = p.z - origin.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (distanceSq <= maxDistanceSq && distanceSq < bestDistanceSq) {
            best = i;
            bestDistanceSq = distanceSq;
        }
    });
    return best;
}
