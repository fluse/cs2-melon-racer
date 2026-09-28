// The third-person chase camera: attaching it to the melon, the player's
// distance/height presets from the user menu, and the one place that writes
// the follow config (SetFollowOffset) — the break and lift zooms in this
// folder go through it too, and so do the lift and camera-zone zooms.
import { CustomCameraMode } from "cs_script/point_script";
import { Debug } from "../debug.js";
import { UpdateCameraPresetHud } from "../hud.js";
import { CameraDistanceForStep, CameraHeightForStep } from "../logic/camera-steps.js";
import { LiftCameraOffset } from "../logic/lift-camera.js";
import { ZoneCameraClips, ZoneCameraOffset } from "../logic/camera-zone.js";
import { CAMERA_LATERAL, FOLLOW_OFFSET } from "../constants/index.js";

// The preset buttons' labels and "Selected" mark: UpdateCameraPresetHud in
// hud.js (which also runs every time the user menu opens).
/** @param {import("../kart-registry.js").Kart} kart */
export function UpdateCameraDistanceHud(kart) {
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        UpdateCameraPresetHud(slot, kart);
    }
}

/** Applies a new camera distance (picked in the user menu) immediately, without waiting for a respawn. @param {import("../kart-registry.js").Kart} kart @param {number} step */
export function SetCameraDistance(kart, step) {
    kart.cameraDistance = CameraDistanceForStep(step);
    ApplyCameraFollow(kart);
    UpdateCameraDistanceHud(kart);
}

/** @param {import("../kart-registry.js").Kart} kart */
export function UpdateCameraHeightHud(kart) {
    UpdateCameraDistanceHud(kart); // one update covers both rows
}

/** Applies a new camera height (picked in the user menu) immediately, without waiting for a respawn. @param {import("../kart-registry.js").Kart} kart @param {number} step */
export function SetCameraHeight(kart, step) {
    kart.cameraHeight = CameraHeightForStep(step);
    ApplyCameraFollow(kart);
    UpdateCameraHeightHud(kart);
}

/** The player's own chase offset (distance/height presets), before any zoom. @param {import("../kart-registry.js").Kart} kart */
export function GetCameraOffsetFor(kart) {
    return { x: -kart.cameraDistance, y: CAMERA_LATERAL, z: kart.cameraHeight };
}

/**
 * (Re-)applies the third-person follow camera from a kart's current
 * pawn/melon/cameraDistance. Called both when the camera first needs
 * attaching (CustomPlayerCamera lives on the pawn instance, so this must be
 * re-called every time the player gets a fresh pawn, i.e. each respawn) and
 * whenever the user menu's distance control changes cameraDistance, so the
 * new distance takes effect immediately instead of waiting for a respawn.
 * Keeps a lift zone's or camera zone's zoom if one is on (see ApplyZonedFollowOffset).
 * @param {import("../kart-registry.js").Kart} kart
 */
export function ApplyCameraFollow(kart) {
    const camera = kart.pawn.GetCustomCamera();
    camera.SetMode(CustomCameraMode.FOLLOW_POSITION);
    ApplyZonedFollowOffset(kart);
    Debug(`ApplyCameraFollow: mode=${camera.GetMode()} distance=${kart.cameraDistance} for slot=${kart.pawn.GetPlayerController()?.GetPlayerSlot()}`);
}

/**
 * The player's own offset with both zone zooms on top — the lift zoom
 * (kart.liftCameraBlend, lift-zoom.js) and the camera-zone zoom
 * (kart.zoneCamera, zone-zoom.js); they add up. Walls pull the camera in
 * only while neither turns that off.
 * @param {import("../kart-registry.js").Kart} kart
 */
export function ApplyZonedFollowOffset(kart) {
    const liftBlend = kart.liftCameraBlend ?? 0;
    const offset = ZoneCameraOffset(LiftCameraOffset(GetCameraOffsetFor(kart), liftBlend), kart.zoneCamera);
    SetFollowOffset(kart, offset, liftBlend === 0 && ZoneCameraClips(kart.zoneCamera));
}

/**
 * Points the chase camera at the melon from `cameraOffset` (x forward,
 * negative = behind; z up — rotated by the player's eye angles).
 * @param {import("../kart-registry.js").Kart} kart @param {{ x: number, y: number, z: number }} cameraOffset
 * @param {boolean} clipToWalls pull the camera in instead of letting it clip through walls — off while
 *   zoomed out for a lift zone, where the shaft wall right behind the melon would pull it straight back in
 */
export function SetFollowOffset(kart, cameraOffset, clipToWalls) {
    kart.pawn.GetCustomCamera().SetFollowConfig({
        followEntity: kart.melon,
        followOffset: FOLLOW_OFFSET,
        cameraOffset,
        clipCameraOffset: clipToWalls,
    });
}
