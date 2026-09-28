// Lift camera: zooms out while the melon is in a lift zone (LIFT_CAMERA_* —
// the math is in ../logic/lift-camera.js).
import { LiftCameraBlend } from "../logic/lift-camera.js";
// Straight from zones.js, not ../physics/index.js: physics imports this
// folder, and the folder index would close an import cycle.
import { InLiftZone } from "../physics/zones.js";
import { ApplyZonedFollowOffset } from "./follow.js";

/**
 * Per tick: eases the chase camera out while the melon is in a lift zone and
 * back in after it leaves. Only touches the camera while the zoom is
 * actually changing. Wall clipping is off for as long as it's zoomed out at
 * all (it looks through the shaft walls instead). Left alone while the melon
 * is breaking — the break camera owns it then, and the respawn re-applies it.
 * @param {import("../kart-registry.js").Kart} kart @param {number} dt
 */
export function UpdateLiftCamera(kart, dt) {
    if (kart.breaking) {
        return;
    }
    const before = kart.liftCameraBlend ?? 0;
    const after = LiftCameraBlend(before, InLiftZone(kart), dt);
    if (after === before) {
        return;
    }
    kart.liftCameraBlend = after;
    ApplyZonedFollowOffset(kart);
}
