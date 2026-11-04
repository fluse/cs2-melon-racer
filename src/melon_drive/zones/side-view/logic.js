// Pure rules for side-view zones — no cs_script import, so it's unit-testable
// in Node (see test/zones/side-view.test.mjs). movement/driving/drive.js
// applies the driving part, camera/side-view/ the camera.
import {
    SIDE_VIEW_NAME_PATTERN,
    SIDE_VIEW_CORNER_NAME_PATTERN,
    SIDE_VIEW_DEFAULT_YAW,
    SIDE_VIEW_DISTANCE,
    SIDE_VIEW_HEIGHT,
    SIDE_VIEW_PLANE_PULL,
    SIDE_VIEW_PLANE_MAX_SPEED,
} from "../../constants/index.js";

/** @typedef {{ x: number, y: number, from: number, to: number }} SideViewCorner a corner zone's corner (the trigger's origin) and the yaws either side */
/** @typedef {{ yaw: number, distance: number, height: number, corner?: SideViewCorner }} SideView where the camera looks from; a corner zone's `yaw` is resolved by ResolveSideView */
/** @typedef {{ x: number, y: number }} Dir2 a horizontal unit direction */

/**
 * The side view a trigger sets up, from its name (see SIDE_VIEW_NAME_PATTERN
 * and SIDE_VIEW_CORNER_NAME_PATTERN), else the SIDE_VIEW_* defaults. A corner
 * zone turns round `origin`, the trigger's own origin.
 * @param {string} triggerName @param {{ x: number, y: number }} [origin] @returns {SideView}
 */
export function SideViewFromName(triggerName, origin) {
    const name = triggerName.trim();
    const corner = SIDE_VIEW_CORNER_NAME_PATTERN.exec(name);
    if (corner) {
        const from = Number(corner[1]);
        return {
            yaw: from,
            distance: corner[3] === undefined ? SIDE_VIEW_DISTANCE : Number(corner[3]),
            height: corner[4] === undefined ? SIDE_VIEW_HEIGHT : Number(corner[4]),
            corner: { x: origin?.x ?? 0, y: origin?.y ?? 0, from, to: Number(corner[2]) },
        };
    }
    const match = SIDE_VIEW_NAME_PATTERN.exec(name);
    if (!match) {
        return { yaw: SIDE_VIEW_DEFAULT_YAW, distance: SIDE_VIEW_DISTANCE, height: SIDE_VIEW_HEIGHT };
    }
    return {
        yaw: Number(match[1]),
        distance: match[2] === undefined ? SIDE_VIEW_DISTANCE : Number(match[2]),
        height: match[3] === undefined ? SIDE_VIEW_HEIGHT : Number(match[3]),
    };
}

/** `degrees` wrapped into -180..180. @param {number} degrees */
function WrapYaw(degrees) {
    return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/**
 * A corner zone's yaw where the melon is: looking at the corner from the
 * melon (so the camera, out beyond the melon, sees it in front of the
 * building), kept within the arc from `from` to `to` the short way round —
 * outside it, the nearer end. On the line from the corner along either
 * side's face it's exactly that side's yaw, so the camera turns on smoothly
 * from the side view before and into the one after.
 * @param {SideViewCorner} corner @param {{ x: number, y: number }} origin
 */
export function CornerYaw(corner, origin) {
    const arc = WrapYaw(corner.to - corner.from);
    const toCorner = (Math.atan2(corner.y - origin.y, corner.x - origin.x) * 180) / Math.PI;
    const along = WrapYaw(toCorner - corner.from); // how far round from `from`, the arc's way
    const lo = Math.min(0, arc);
    const hi = Math.max(0, arc);
    if (along >= lo && along <= hi) {
        return corner.from + along;
    }
    const pastLo = Math.abs(WrapYaw(along - lo));
    const pastHi = Math.abs(WrapYaw(along - hi));
    return corner.from + (pastLo <= pastHi ? lo : hi);
}

/**
 * The side view to drive and look in with the melon at `origin`: a corner
 * zone's yaw resolved (CornerYaw), any other one as it is.
 * @param {SideView} sideView @param {{ x: number, y: number }} origin @returns {SideView}
 */
export function ResolveSideView(sideView, origin) {
    if (!sideView.corner) {
        return sideView;
    }
    return { yaw: CornerYaw(sideView.corner, origin), distance: sideView.distance, height: sideView.height };
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
 * it's moving along the screen axis, else `still` (right, or the facing it
 * had in the side view just before).
 * @param {{ x: number, y: number }} velocity @param {Dir2} right @param {1 | -1} [still] @returns {1 | -1}
 */
export function InitialFacing(velocity, right, still = 1) {
    const along = velocity.x * right.x + velocity.y * right.y;
    return along < 0 ? -1 : along > 0 ? 1 : still;
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
 * The melon's depth in a side view, `view` its (resolved) view: along the
 * view (PlaneDepth), measured from the corner in a corner zone — there the
 * view points at the corner, so this is minus the melon's distance from it,
 * and holding it steady holds the melon on a circle round the corner.
 * @param {SideView} sideView @param {{ x: number, y: number }} origin @param {Dir2} view
 */
export function SideViewDepth(sideView, origin, view) {
    const corner = sideView.corner;
    return corner ? PlaneDepth({ x: origin.x - corner.x, y: origin.y - corner.y }, view) : PlaneDepth(origin, view);
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
