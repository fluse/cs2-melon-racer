// Pure rules for camera zones — no cs_script import, so it's unit-testable in
// Node (see test/zones/camera-zone.test.mjs). camera/zone-zoom.js applies the
// resulting offset.
import {
    CAMERA_ZONE_NAME_PATTERN,
    CAMERA_CLOSEUP_NAME_PATTERN,
    CAMERA_CLOSEUP_DISTANCE,
    CAMERA_CLOSEUP_HEIGHT,
    CAMERA_CLOSEUP_EASE_SECONDS,
    CAMERA_ZONE_EXTRA_DISTANCE,
    CAMERA_ZONE_EXTRA_HEIGHT,
    CAMERA_ZONE_EASE_SECONDS,
    CAMERA_ZONE_MIN_DISTANCE,
    CAMERA_ZONE_FRONT_HEIGHT,
    CAMERA_DISTANCE,
    CAMERA_HEIGHT,
    FOLLOW_OFFSET,
} from "../../constants/index.js";

/**
 * @typedef {{ distance: number, height: number, clip: boolean, front: boolean, ease?: number }} CameraZone
 * what a zone adds to the chase camera; `front` = no CAMERA_ZONE_MIN_DISTANCE
 * stop (front and close-up zones); `ease` = its own seconds to zoom in and
 * back out (close-up zones), else CAMERA_ZONE_EASE_SECONDS
 */

/**
 * @typedef {{
 *   from: CameraZone, to: CameraZone, // easing from -> to
 *   t: number, // 0..1, how far along
 *   ease?: number, // seconds for this ease, see EaseSeconds
 * }} ZoneCameraState
 */

/** Outside every camera zone: nothing added, walls pull the camera in as usual. @type {CameraZone} */
export const NO_CAMERA_ZONE = { distance: 0, height: 0, clip: true, front: false };

/**
 * What a camera trigger adds, from its name (see CAMERA_ZONE_NAME_PATTERN),
 * else CAMERA_ZONE_EXTRA_DISTANCE/_HEIGHT.
 * @param {string} triggerName @returns {CameraZone}
 */
export function CameraZoneFromName(triggerName) {
    const closeup = CAMERA_CLOSEUP_NAME_PATTERN.exec(triggerName.trim());
    if (closeup) {
        // Close-up: like a front zone, the name gives the camera's spot
        // (behind / above the melon's center), stored as what it adds to the
        // normal offset — and no min-distance stop, so it can get this close.
        const behind = closeup[2] === undefined ? CAMERA_CLOSEUP_DISTANCE : Number(closeup[2]);
        const above = closeup[3] === undefined ? CAMERA_CLOSEUP_HEIGHT : Number(closeup[3]);
        return {
            distance: behind - CAMERA_DISTANCE,
            height: above - FOLLOW_OFFSET.z - CAMERA_HEIGHT,
            clip: !closeup[1],
            front: true,
            ease: CAMERA_CLOSEUP_EASE_SECONDS,
        };
    }
    const match = CAMERA_ZONE_NAME_PATTERN.exec(triggerName.trim());
    if (!match) {
        return { distance: CAMERA_ZONE_EXTRA_DISTANCE, height: CAMERA_ZONE_EXTRA_HEIGHT, clip: true, front: false };
    }
    const clip = !match[1];
    const value = Number(match[3]);
    if (match[2]) {
        // Front zone: the name gives the camera's spot (ahead of / above the
        // melon's center), stored like any zone as what it adds to the normal
        // offset, so easing in and out works the same.
        const above = match[4] === undefined ? CAMERA_ZONE_FRONT_HEIGHT : Number(match[4]);
        return {
            distance: -(CAMERA_DISTANCE + value),
            height: above - FOLLOW_OFFSET.z - CAMERA_HEIGHT,
            clip,
            front: true,
        };
    }
    return { distance: value, height: match[4] === undefined ? 0 : Number(match[4]), clip, front: false };
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
 * Whether the camera may go in front of the melon: while a front zone is on,
 * including while easing away from one (the stop would make it jump).
 * @param {ZoneCameraState | undefined} state
 */
export function ZoneCameraFront(state) {
    return !!state && (state.to.front || (state.from.front && state.t < 1));
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
    if (
        to.distance !== target.distance ||
        to.height !== target.height ||
        to.clip !== target.clip ||
        to.front !== target.front ||
        to.ease !== target.ease
    ) {
        const extra = ZoneCameraExtra(current);
        next = {
            from: { ...extra, clip: ZoneCameraClips(current), front: ZoneCameraFront(current) },
            to: target,
            t: 0,
            ease: EaseSeconds(to, target),
        };
    }
    if (next.t < 1) {
        const seconds = next.ease ?? CAMERA_ZONE_EASE_SECONDS;
        const step = seconds > 0 ? Math.max(0, dt) / seconds : 1;
        next = { ...next, t: Math.min(1, next.t + step) };
    }
    if (next === current) {
        return state;
    }
    // Fully back to normal: forget the state, same as never having been in a zone.
    return next.t >= 1 && next.to === NO_CAMERA_ZONE ? undefined : next;
}

/**
 * How long an ease from zone `from` to zone `to` takes: the zone being
 * entered sets it, or — leaving one for no zone — the zone being left, so a
 * close-up pulls back out as slowly as it went in.
 * @param {CameraZone} from @param {CameraZone} to
 */
export function EaseSeconds(from, to) {
    return to.ease ?? (to === NO_CAMERA_ZONE ? from.ease : undefined) ?? CAMERA_ZONE_EASE_SECONDS;
}

/**
 * The chase camera offset with the zone zoom applied: x is forward (negative
 * = behind), z up. Zooming in stops CAMERA_ZONE_MIN_DISTANCE behind the melon,
 * except in a front zone (ZoneCameraFront).
 * @param {{ x: number, y: number, z: number }} base @param {ZoneCameraState | undefined} state
 */
export function ZoneCameraOffset(base, state) {
    const extra = ZoneCameraExtra(state);
    if (ZoneCameraFront(state)) {
        return { x: base.x - extra.distance, y: base.y, z: base.z + extra.height };
    }
    return {
        x: Math.min(base.x - extra.distance, Math.max(base.x, -CAMERA_ZONE_MIN_DISTANCE)),
        y: base.y,
        z: base.z + extra.height,
    };
}
