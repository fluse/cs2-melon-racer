// Camera zones: zoom in or out while the melon is in a camera_enter/_leave
// trigger (CAMERA_ZONE_* and the math are in zones/camera-zone/).
import { NO_CAMERA_ZONE, StepZoneCamera } from "../../zones/camera-zone/logic.js";
// Straight from zones/registry.js, not zones/index.js: that one also loads
// zones/inputs.js, which reaches kart/ and health/ — and both import camera/.
import { CurrentCameraZone } from "../../zones/registry.js";

/**
 * Per tick: eases the chase camera towards the zoom of the camera zone the
 * melon is in, and back to normal after it leaves (UpdateFollowCamera in
 * follow.js applies the zoom right after). Left alone while the melon is
 * breaking — the break camera owns it then, and the respawn re-applies it.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function UpdateZoneCamera(kart, dt) {
    if (kart.breaking) {
        return;
    }
    kart.zoneCamera = StepZoneCamera(kart.zoneCamera, CurrentCameraZone(kart) ?? NO_CAMERA_ZONE, dt);
}
