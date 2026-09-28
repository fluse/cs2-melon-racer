// Pure rules for camera zones — no cs_script import, so it's unit-testable in
// Node (see test/camera-zone.test.mjs). camera/zone-zoom.js applies the
// resulting offset.
import {
    CAMERA_ZONE_NAME_PATTERN,
    CAMERA_ZONE_EXTRA_DISTANCE,
    CAMERA_ZONE_EXTRA_HEIGHT,
    CAMERA_ZONE_EASE_SECONDS,
    CAMERA_ZONE_MIN_DISTANCE,
} from "../constants/index.js";

/** @typedef {{ distance: number, height: number, clip: boolean }} CameraZone what a zone adds to the chase camera */

/**
 * @typedef {{
 *   from: CameraZone, to: CameraZone, // easing from -> to
 *   t: number, // 0..1, how far along
 * }} ZoneCameraState
 */

/** Outside every camera zone: nothing added, walls pull the camera in as usual. @type {CameraZone} */
export const NO_CAMERA_ZONE = { distance: 0, height: 0, clip: true };

/**
 * What a camera trigger adds, from its name (see CAMERA_ZONE_NAME_PATTERN),
 * else CAMERA_ZONE_EXTRA_DISTANCE/_HEIGHT.
 * @param {string} triggerName @returns {CameraZone}
 */
export function CameraZoneFromName(triggerName) {
    const match = CAMERA_ZONE_NAME_PATTERN.exec(triggerName.trim());
    if (!match) {
        return { distance: CAMERA_ZONE_EXTRA_DISTANCE, height: CAMERA_ZONE_EXTRA_HEIGHT, clip: true };
    }
    return { distance: Number(match[2]), height: match[3] === undefined ? 0 : Number(match[3]), clip: !match[1] };
}

/** How much the zone zoom adds right now (smoothstep-eased). @param {ZoneCameraState | undefined} state */
export function ZoneCameraExtra(state) {
    if (!state) {
        return { distance: 0, height: 0 };
    }
    const t = Math.max(0, Math.min(1, state.t));
    const eased = t * t * (3 - 2 * t);
    return {
        distance: state.from.distance + (state.to.distance - state.from.distance) * eased,
        height: state.from.height + (state.to.height - state.from.height) * eased,
    };
}

/**
 * Whether walls may pull the camera in: not while a noclip zone's zoom is on,
 * including while easing away from one (it would snap in mid-ease).
 * @param {ZoneCameraState | undefined} state
 */
export function ZoneCameraClips(state) {
    return !state || (state.to.clip && (state.from.clip || state.t >= 1));
}

/**
 * The zone zoom after `dt` more seconds, easing towards `target` (the zone
 * the melon is in, or NO_CAMERA_ZONE). A new target starts a fresh ease from
 * wherever the camera is now, so switching zones mid-ease doesn't jump.
 * Returns the same object when nothing changes, so callers can skip the camera update.
 * @param {ZoneCameraState | undefined} state @param {CameraZone} target @param {number} dt
 * @returns {ZoneCameraState | undefined}
 */
export function StepZoneCamera(state, target, dt) {
    const current = state ?? { from: NO_CAMERA_ZONE, to: NO_CAMERA_ZONE, t: 1 };
    let next = current;
    const to = current.to;
    if (to.distance !== target.distance || to.height !== target.height || to.clip !== target.clip) {
        const extra = ZoneCameraExtra(current);
        next = { from: { ...extra, clip: ZoneCameraClips(current) }, to: target, t: 0 };
    }
    if (next.t < 1) {
        const step = CAMERA_ZONE_EASE_SECONDS > 0 ? Math.max(0, dt) / CAMERA_ZONE_EASE_SECONDS : 1;
        next = { ...next, t: Math.min(1, next.t + step) };
    }
    if (next === current) {
        return state;
    }
    // Fully back to normal: forget the state, same as never having been in a zone.
    return next.t >= 1 && next.to === NO_CAMERA_ZONE ? undefined : next;
}

/**
 * The chase camera offset with the zone zoom applied: x is forward (negative
 * = behind), z up. Zooming in stops CAMERA_ZONE_MIN_DISTANCE behind the melon.
 * @param {{ x: number, y: number, z: number }} base @param {ZoneCameraState | undefined} state
 */
export function ZoneCameraOffset(base, state) {
    const extra = ZoneCameraExtra(state);
    return {
        x: Math.min(base.x - extra.distance, Math.max(base.x, -CAMERA_ZONE_MIN_DISTANCE)),
        y: base.y,
        z: base.z + extra.height,
    };
}
