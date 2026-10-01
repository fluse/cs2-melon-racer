// Lift camera: zooms out while the melon is in a lift zone (LIFT_CAMERA_* —
// the math is in ../logic/lift-camera.js).
import { LiftCameraBlend } from "./lift-zoom-logic.js";
// Straight from zones.js, not ../physics/index.js: physics imports this
// folder, and the folder index would close an import cycle.
import { InLiftZone } from "../zones/registry.js";

/**
 * Per tick: eases the chase camera out while the melon is in a lift zone and
 * back in after it leaves (UpdateFollowCamera in follow.js applies the
 * zoom right after). Wall clipping is off for as long as it's zoomed out at
 * all (it looks through the shaft walls instead). Left alone while the melon
 * is breaking — the break camera owns it then, and the respawn re-applies it.
 * @param {import("../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function UpdateLiftCamera(kart, dt) {
    if (kart.breaking) {
        return;
    }
    kart.liftCameraBlend = LiftCameraBlend(kart.liftCameraBlend ?? 0, InLiftZone(kart), dt);
}
