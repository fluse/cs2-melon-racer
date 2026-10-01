// The third-person chase camera: attaching it to the melon, its normal
// offset (CAMERA_DISTANCE/CAMERA_HEIGHT), and the one place that writes
// the follow config (SetFollowOffset) — the break and lift zooms in this
// folder go through it too, and so do the lift and camera-zone zooms.
import { CustomCameraMode } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { LiftCameraOffset } from "./lift-zoom-logic.js";
import { ZoneCameraClips, ZoneCameraOffset } from "../zones/camera-zone/logic.js";
import { CAMERA_LATERAL, CAMERA_DISTANCE, CAMERA_HEIGHT, FOLLOW_OFFSET } from "../constants/index.js";

/** The normal chase offset, before any zoom. @param {import("../core/kart-registry.js").Kart} kart */
export function GetCameraOffsetFor(kart) {
    return { x: -CAMERA_DISTANCE, y: CAMERA_LATERAL, z: CAMERA_HEIGHT };
}

/**
 * (Re-)applies the third-person follow camera from a kart's current
 * pawn/melon. Called whenever the camera needs attaching
 * (CustomPlayerCamera lives on the pawn instance, so this must be
 * re-called every time the player gets a fresh pawn, i.e. each respawn).
 * Keeps a lift zone's or camera zone's zoom if one is on (see ApplyZonedFollowOffset).
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function ApplyCameraFollow(kart) {
    const camera = kart.pawn.GetCustomCamera();
    camera.SetMode(CustomCameraMode.FOLLOW_POSITION);
    ApplyZonedFollowOffset(kart);
    Debug(`ApplyCameraFollow: mode=${camera.GetMode()} for slot=${kart.pawn.GetPlayerController()?.GetPlayerSlot()}`);
}

/**
 * The normal offset with both zone zooms on top — the lift zoom
 * (kart.liftCameraBlend, lift-zoom.js) and the camera-zone zoom
 * (kart.zoneCamera, zone-zoom.js); they add up. Walls pull the camera in
 * only while neither turns that off.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function ApplyZonedFollowOffset(kart) {
    const liftBlend = kart.liftCameraBlend ?? 0;
    const offset = ZoneCameraOffset(LiftCameraOffset(GetCameraOffsetFor(kart), liftBlend), kart.zoneCamera);
    SetFollowOffset(kart, offset, liftBlend === 0 && ZoneCameraClips(kart.zoneCamera));
}

/**
 * Points the chase camera at the melon from `cameraOffset` (x forward,
 * negative = behind; z up — rotated by the player's eye angles).
 * @param {import("../core/kart-registry.js").Kart} kart @param {{ x: number, y: number, z: number }} cameraOffset
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
