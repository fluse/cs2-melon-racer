// Pure rules for side-view zones — no cs_script import, so it's unit-testable
// in Node (see test/zones/side-view.test.mjs). movement/driving/drive.js
// applies the driving part, camera/side-view/ the camera.
import {
    SIDE_VIEW_NAME_PATTERN,
    SIDE_VIEW_DEFAULT_YAW,
    SIDE_VIEW_DISTANCE,
    SIDE_VIEW_HEIGHT,
    SIDE_VIEW_PLANE_PULL,
    SIDE_VIEW_PLANE_MAX_SPEED,
} from "../../constants/index.js";

/** @typedef {{ yaw: number, distance: number, height: number }} SideView where the camera looks from */
/** @typedef {{ x: number, y: number }} Dir2 a horizontal unit direction */

/**
 * The side view a trigger sets up, from its name (see SIDE_VIEW_NAME_PATTERN),
 * else the SIDE_VIEW_* defaults.
 * @param {string} triggerName @returns {SideView}
 */
export function SideViewFromName(triggerName) {
    const match = SIDE_VIEW_NAME_PATTERN.exec(triggerName.trim());
    if (!match) {
        return { yaw: SIDE_VIEW_DEFAULT_YAW, distance: SIDE_VIEW_DISTANCE, height: SIDE_VIEW_HEIGHT };
    }
    return {
        yaw: Number(match[1]),
        distance: match[2] === undefined ? SIDE_VIEW_DISTANCE : Number(match[2]),
        height: match[3] === undefined ? SIDE_VIEW_HEIGHT : Number(match[3]),
    };
}

/**
 * The side view's two horizontal axes: `view` = the way the camera looks
 * (into the screen), `right` = screen right, the way D drives.
 * @param {number} yaw @returns {{ view: Dir2, right: Dir2 }}
 */
export function SideViewAxes(yaw) {
    const rad = (yaw * Math.PI) / 180;
    return {
        view: { x: Math.cos(rad), y: Math.sin(rad) },
        right: { x: Math.sin(rad), y: -Math.cos(rad) },
    };
}

/**
 * Which way the melon faces on screen when it enters a side view: the way
 * it's moving along the screen axis, right if it isn't.
 * @param {{ x: number, y: number }} velocity @param {Dir2} right @returns {1 | -1}
 */
export function InitialFacing(velocity, right) {
    return velocity.x * right.x + velocity.y * right.y < 0 ? -1 : 1;
}

/**
 * Driving input in a side view: only A/D, left/right on screen, turning the
 * melon that way. W/S and the mouse do nothing here (see SideViewDepthInput).
 * @param {number} strafeInput D/A, -1..1 @param {1 | -1} facing
 * @returns {{ axis: number, facing: 1 | -1 }} axis: -1..1 along screen right (0 = no input)
 */
export function SideViewInput(strafeInput, facing) {
    if (strafeInput !== 0) {
        return { axis: strafeInput, facing: strafeInput < 0 ? -1 : 1 };
    }
    return { axis: 0, facing };
}

/**
 * W/S in a side view: only inside a depth zone do they drive, W into the
 * screen (along the view, away from the camera), S out of it.
 * @param {number} forwardInput W/S, -1..1 @param {boolean} inDepthZone
 * @returns {number} -1..1 along the view (0 = none)
 */
export function SideViewDepthInput(forwardInput, inDepthZone) {
    return inDepthZone ? forwardInput : 0;
}

/** How far along `view` (towards the camera's far side) a point is. @param {{ x: number, y: number }} origin @param {Dir2} view */
export function PlaneDepth(origin, view) {
    return origin.x * view.x + origin.y * view.y;
}

/**
 * Horizontal velocity `v` kept on the side view's plane: its part towards or
 * away from the camera is dropped, replaced by a pull back onto the plane
 * (SIDE_VIEW_PLANE_PULL, at most SIDE_VIEW_PLANE_MAX_SPEED).
 * @param {{ x: number, y: number }} v @param {Dir2} view
 * @param {number} depthError plane depth minus the melon's depth (see PlaneDepth)
 * @returns {{ x: number, y: number }}
 */
export function KeepOnPlane(v, view, depthError) {
    const depth = v.x * view.x + v.y * view.y;
    const pull = Math.max(-SIDE_VIEW_PLANE_MAX_SPEED, Math.min(SIDE_VIEW_PLANE_MAX_SPEED, depthError * SIDE_VIEW_PLANE_PULL));
    return { x: v.x + view.x * (pull - depth), y: v.y + view.y * (pull - depth) };
}
