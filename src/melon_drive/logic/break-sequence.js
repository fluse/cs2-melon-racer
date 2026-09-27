// Pure rules for the melon-break sequence — no cs_script import, so it's
// unit-testable in Node (see test/break-sequence.test.mjs). physics/break-effects.js
// and camera.js apply the results (camera config, entity removal).
import {
    BREAK_CAMERA_ZOOM_SECONDS,
    BREAK_CAMERA_EXTRA_DISTANCE,
    BREAK_CAMERA_EXTRA_HEIGHT,
    BREAK_EFFECT_LIFETIME,
    BREAK_EFFECT_MAX_ACTIVE,
    BREAK_PIECE_SPEED,
    BREAK_PIECE_UP_SPEED,
} from "../constants.js";

/**
 * Moves a group of points so their centroid lands on `target`, keeping
 * their layout relative to each other. ForceSpawn keeps each templated
 * entity's Hammer offset from its point_template — break pieces placed
 * next to (not on) the template would otherwise appear that far away from
 * the crash site, possibly inside a wall.
 * @param {Array<{ x: number, y: number, z: number }>} points @param {{ x: number, y: number, z: number }} target
 */
export function RecenterOnto(points, target) {
    if (points.length === 0) {
        return [];
    }
    const c = { x: 0, y: 0, z: 0 };
    for (const p of points) {
        c.x += p.x / points.length;
        c.y += p.y / points.length;
        c.z += p.z / points.length;
    }
    return points.map((p) => ({ x: p.x - c.x + target.x, y: p.y - c.y + target.y, z: p.z - c.z + target.z }));
}

/**
 * Launch velocity for one break piece: away from the crash site (the
 * direction from `center` to where the piece spawned, flattened so the
 * pieces spread along the ground), plus an upward pop. A piece that spawned
 * right at the center has no direction of its own, so it uses `fallbackAngle`
 * (radians; the caller passes a random one).
 * @param {{ x: number, y: number, z: number }} center @param {{ x: number, y: number, z: number }} piecePosition @param {number} fallbackAngle
 */
export function BreakPieceVelocity(center, piecePosition, fallbackAngle) {
    let dx = piecePosition.x - center.x;
    let dy = piecePosition.y - center.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-3) {
        dx = Math.cos(fallbackAngle);
        dy = Math.sin(fallbackAngle);
    } else {
        dx /= length;
        dy /= length;
    }
    return { x: dx * BREAK_PIECE_SPEED, y: dy * BREAK_PIECE_SPEED, z: BREAK_PIECE_UP_SPEED };
}

/**
 * How far the break camera has zoomed out, 0 (normal chase offset) to 1
 * (fully pulled back), `elapsed` seconds after the break. Eases out, so the
 * pull-back starts fast and settles gently.
 * @param {number} elapsed
 */
export function BreakCameraZoomFraction(elapsed) {
    if (!(elapsed > 0)) {
        return 0;
    }
    const t = Math.min(1, elapsed / BREAK_CAMERA_ZOOM_SECONDS);
    return 1 - (1 - t) * (1 - t);
}

/**
 * The chase camera's cameraOffset `elapsed` seconds after a break, starting
 * from the player's normal offset (x is forward, so "further back" is more
 * negative x; z is up).
 * @param {{ x: number, y: number, z: number }} baseOffset @param {number} elapsed
 */
export function BreakCameraOffset(baseOffset, elapsed) {
    const f = BreakCameraZoomFraction(elapsed);
    return {
        x: baseOffset.x - f * BREAK_CAMERA_EXTRA_DISTANCE,
        y: baseOffset.y,
        z: baseOffset.z + f * BREAK_CAMERA_EXTRA_HEIGHT,
    };
}

/**
 * Splits the live break effects into ones to remove now and ones to keep:
 * anything older than BREAK_EFFECT_LIFETIME goes, and beyond that the oldest
 * ones go until at most BREAK_EFFECT_MAX_ACTIVE remain. Order of `effects`
 * doesn't matter; `kept` comes back oldest first.
 * @template {{ spawnTime: number }} T
 * @param {T[]} effects @param {number} now
 * @returns {{ expired: T[], kept: T[] }}
 */
export function PruneBreakEffects(effects, now) {
    const sorted = [...effects].sort((a, b) => a.spawnTime - b.spawnTime);
    const expired = [];
    const kept = [];
    for (const effect of sorted) {
        (now - effect.spawnTime >= BREAK_EFFECT_LIFETIME ? expired : kept).push(effect);
    }
    const overflow = Math.max(0, kept.length - BREAK_EFFECT_MAX_ACTIVE);
    expired.push(...kept.splice(0, overflow));
    return { expired, kept };
}
