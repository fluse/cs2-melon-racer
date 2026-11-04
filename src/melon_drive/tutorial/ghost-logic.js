// A ghost melon's place on its path (tutorial/ghost.js): along the points at
// a steady speed, a pause at the end, then from the start again.

/** @typedef {{ x: number, y: number, z: number }} Vec */

/** The path's length. @param {Vec[]} path */
export function GhostPathLength(path) {
    let length = 0;
    for (let i = 1; i < path.length; i++) {
        length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y, path[i].z - path[i - 1].z);
    }
    return length;
}

/**
 * Where the ghost is at `time`, and which way it's heading (a unit vector).
 * @param {Vec[]} path at least two points @param {number} length GhostPathLength(path)
 * @param {number} time @param {number} speed units/s @param {number} pause seconds at the end
 */
export function GhostPositionAt(path, length, time, speed, pause) {
    const lap = length / speed + pause;
    let distance = Math.min(((time % lap) + lap) % lap, length / speed) * speed;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const segment = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        if (distance <= segment || i === path.length - 1) {
            const t = segment > 0 ? Math.min(1, distance / segment) : 0;
            const direction = segment > 0 ? { x: (b.x - a.x) / segment, y: (b.y - a.y) / segment, z: (b.z - a.z) / segment } : { x: 1, y: 0, z: 0 };
            return { position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, direction };
        }
        distance -= segment;
    }
    return { position: path[0], direction: { x: 1, y: 0, z: 0 } };
}
