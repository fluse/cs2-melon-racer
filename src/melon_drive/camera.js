import { CustomCameraMode } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { UpdateCameraPresetHud } from "./hud.js";
import { BreakCameraOffset } from "./logic/break-sequence.js";
import { CameraDistanceForStep, CameraHeightForStep } from "./logic/camera-steps.js";
import {
    CAMERA_LATERAL,
    FOLLOW_OFFSET,
} from "./constants/index.js";

// The preset buttons' labels and "Selected" mark: UpdateCameraPresetHud in
// hud.js (which also runs every time the user menu opens).
/** @param {import("./kart-registry.js").Kart} kart */
export function UpdateCameraDistanceHud(kart) {
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        UpdateCameraPresetHud(slot, kart);
    }
}

/** Applies a new camera distance (picked in the user menu) immediately, without waiting for a respawn. @param {import("./kart-registry.js").Kart} kart @param {number} step */
export function SetCameraDistance(kart, step) {
    kart.cameraDistance = CameraDistanceForStep(step);
    ApplyCameraFollow(kart);
    UpdateCameraDistanceHud(kart);
}

/** @param {import("./kart-registry.js").Kart} kart */
export function UpdateCameraHeightHud(kart) {
    UpdateCameraDistanceHud(kart); // one update covers both rows
}

/** Applies a new camera height (picked in the user menu) immediately, without waiting for a respawn. @param {import("./kart-registry.js").Kart} kart @param {number} step */
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
