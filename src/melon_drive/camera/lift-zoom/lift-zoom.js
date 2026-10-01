// Lift camera: zooms out while the melon is in a lift zone (LIFT_CAMERA_* in
// constants.js, the math in logic.js).
import { LiftCameraBlend } from "./logic.js";
// Straight from zones/registry.js, not zones/index.js: that one also loads
// zones/inputs.js, which reaches kart/ and health/ — and both import camera/.
import { InLiftZone } from "../../zones/registry.js";

/**
 * Per tick: eases the chase camera out while the melon is in a lift zone and
 * back in after it leaves (UpdateFollowCamera in follow.js applies the
 * zoom right after). Wall clipping is off for as long as it's zoomed out at
 * all (it looks through the shaft walls instead). Left alone while the melon
 * is breaking — the break camera owns it then, and the respawn re-applies it.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function UpdateLiftCamera(kart, dt) {
    if (kart.breaking) {
        return;
    }
    kart.liftCameraBlend = LiftCameraBlend(kart.liftCameraBlend ?? 0, InLiftZone(kart), dt);
}
