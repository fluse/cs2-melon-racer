import { CustomCameraMode } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { GetSpeedHud } from "./hud.js";
import {
    CAMERA_LATERAL,
    CAMERA_HEIGHT,
    CAMERA_DISTANCE_MIN,
    CAMERA_DISTANCE_MAX,
    CAMERA_DISTANCE_STEPS,
    FOLLOW_OFFSET,
} from "./constants.js";

// "Slider" for the third-person camera distance — really a clickable row of
// notches (camdist_seg_0 .. camdist_seg_{CAMERA_DISTANCE_STEPS-1} buttons in
// speedometer.xml, handled in OnCustomHudClicked), since CustomHudLayout has
// no native drag/slider widget. Filled the same way the jump bar is, up to
// the step the current cameraDistance falls on.
/** @param {number} distance */
export function CameraDistanceStepFor(distance) {
    const fraction = (distance - CAMERA_DISTANCE_MIN) / (CAMERA_DISTANCE_MAX - CAMERA_DISTANCE_MIN);
    return Math.round(fraction * (CAMERA_DISTANCE_STEPS - 1));
}

/** @param {number} step */
export function CameraDistanceForStep(step) {
    const fraction = CAMERA_DISTANCE_STEPS > 1 ? step / (CAMERA_DISTANCE_STEPS - 1) : 0;
    return CAMERA_DISTANCE_MIN + fraction * (CAMERA_DISTANCE_MAX - CAMERA_DISTANCE_MIN);
}

/** @param {import("./kart-registry.js").Kart} kart */
export function UpdateCameraDistanceHud(kart) {
    const hud = GetSpeedHud();
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (!hud || slot === undefined) {
        return;
    }
    const filledSegments = CameraDistanceStepFor(kart.cameraDistance) + 1;
    for (let i = 0; i < CAMERA_DISTANCE_STEPS; i++) {
        hud.SetHasClassForPlayer(slot, `camdist_seg_${i}`, "Filled", i < filledSegments);
    }
}

/** Applies a new camera distance (picked via the user menu's slider) immediately, without waiting for a respawn. @param {import("./kart-registry.js").Kart} kart @param {number} step */
export function SetCameraDistance(kart, step) {
    kart.cameraDistance = CameraDistanceForStep(step);
    ApplyCameraFollow(kart);
    UpdateCameraDistanceHud(kart);
}

/** @param {import("./kart-registry.js").Kart} kart */
export function GetCameraOffsetFor(kart) {
    return { x: -kart.cameraDistance, y: CAMERA_LATERAL, z: CAMERA_HEIGHT };
}

/**
 * (Re-)applies the third-person follow camera from a kart's current
 * pawn/melon/cameraDistance. Called both when the camera first needs
 * attaching (CustomPlayerCamera lives on the pawn instance, so this must be
 * re-called every time the player gets a fresh pawn, i.e. each respawn) and
 * whenever the user menu's distance control changes cameraDistance, so the
 * new distance takes effect immediately instead of waiting for a respawn.
 * @param {import("./kart-registry.js").Kart} kart
 */
export function ApplyCameraFollow(kart) {
    const camera = kart.pawn.GetCustomCamera();
    camera.SetMode(CustomCameraMode.FOLLOW_POSITION);
    camera.SetFollowConfig({
        followEntity: kart.melon,
        followOffset: FOLLOW_OFFSET,
        cameraOffset: GetCameraOffsetFor(kart),
        clipCameraOffset: false,
    });
    Debug(`ApplyCameraFollow: mode=${camera.GetMode()} distance=${kart.cameraDistance} for slot=${kart.pawn.GetPlayerController()?.GetPlayerSlot()}`);
}
