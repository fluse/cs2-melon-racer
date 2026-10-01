// Camera zones: zoom in or out while the melon is in a camera_enter/_leave
// trigger (CAMERA_ZONE_* — the math is in ../logic/camera-zone.js).
import { NO_CAMERA_ZONE, StepZoneCamera } from "../zones/camera-zone/logic.js";
// Straight from zones.js, not ../physics/index.js: physics imports this
// folder, and the folder index would close an import cycle.
import { CurrentCameraZone } from "../zones/registry.js";
import { ApplyZonedFollowOffset } from "./follow.js";

/**
 * Per tick: eases the chase camera towards the zoom of the camera zone the
 * melon is in, and back to normal after it leaves. Only touches the camera
 * while the zoom is actually changing. Left alone while the melon is
 * breaking — the break camera owns it then, and the respawn re-applies it.
 * @param {import("../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function UpdateZoneCamera(kart, dt) {
    if (kart.breaking) {
        return;
    }
    const before = kart.zoneCamera;
    const after = StepZoneCamera(before, CurrentCameraZone(kart) ?? NO_CAMERA_ZONE, dt);
    if (after === before) {
        return;
    }
    kart.zoneCamera = after;
    ApplyZonedFollowOffset(kart);
}
