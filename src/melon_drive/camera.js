import { CustomCameraMode } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { GetSpeedHud } from "./hud.js";
import { BreakCameraOffset } from "./logic/break-sequence.js";
import {
    CAMERA_LATERAL,
    CAMERA_DISTANCE_MIN,
    CAMERA_DISTANCE_MAX,
    CAMERA_DISTANCE_STEPS,
    CAMERA_HEIGHT_MIN,
    CAMERA_HEIGHT_MAX,
    CAMERA_HEIGHT_STEPS,
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

// Same notch-slider trick as the distance controls above (camheight_seg_0 ..
// camheight_seg_{CAMERA_HEIGHT_STEPS-1} in speedometer.xml), for how high
// above the melon the chase camera sits — lets a player pull it down close
// to the ground or push it up for more of an overview.
/** @param {number} height */
export function CameraHeightStepFor(height) {
    const fraction = (height - CAMERA_HEIGHT_MIN) / (CAMERA_HEIGHT_MAX - CAMERA_HEIGHT_MIN);
    return Math.round(fraction * (CAMERA_HEIGHT_STEPS - 1));
}

/** @param {number} step */
export function CameraHeightForStep(step) {
    const fraction = CAMERA_HEIGHT_STEPS > 1 ? step / (CAMERA_HEIGHT_STEPS - 1) : 0;
    return CAMERA_HEIGHT_MIN + fraction * (CAMERA_HEIGHT_MAX - CAMERA_HEIGHT_MIN);
}

/** @param {import("./kart-registry.js").Kart} kart */
export function UpdateCameraHeightHud(kart) {
    const hud = GetSpeedHud();
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (!hud || slot === undefined) {
        return;
    }
    const filledSegments = CameraHeightStepFor(kart.cameraHeight) + 1;
    for (let i = 0; i < CAMERA_HEIGHT_STEPS; i++) {
        hud.SetHasClassForPlayer(slot, `camheight_seg_${i}`, "Filled", i < filledSegments);
    }
}

/** Applies a new camera height (picked via the user menu's slider) immediately, without waiting for a respawn. @param {import("./kart-registry.js").Kart} kart @param {number} step */
export function SetCameraHeight(kart, step) {
    kart.cameraHeight = CameraHeightForStep(step);
    ApplyCameraFollow(kart);
    UpdateCameraHeightHud(kart);
}

/** @param {import("./kart-registry.js").Kart} kart */
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
 * @param {import("./kart-registry.js").Kart} kart
 */
export function ApplyCameraFollow(kart) {
    const camera = kart.pawn.GetCustomCamera();
    camera.SetMode(CustomCameraMode.FOLLOW_POSITION);
    camera.SetFollowConfig({
        followEntity: kart.melon,
        followOffset: FOLLOW_OFFSET,
        cameraOffset: GetCameraOffsetFor(kart),
        clipCameraOffset: true, // pull the camera in instead of letting it clip through walls
    });
    Debug(`ApplyCameraFollow: mode=${camera.GetMode()} distance=${kart.cameraDistance} for slot=${kart.pawn.GetPlayerController()?.GetPlayerSlot()}`);
}

/**
 * Pulls the chase camera back from a broken melon (still frozen, hidden, at
 * the crash site) so the burst is visible — called every tick while
 * kart.breaking; ApplyCameraFollow restores the normal offset on respawn.
 * @param {import("./kart-registry.js").Kart} kart @param {number} elapsed seconds since the break
 */
export function ApplyBreakCameraZoom(kart, elapsed) {
    kart.pawn.GetCustomCamera().SetFollowConfig({
        followEntity: kart.melon,
        followOffset: FOLLOW_OFFSET,
        cameraOffset: BreakCameraOffset(GetCameraOffsetFor(kart), elapsed),
        clipCameraOffset: true,
    });
}
