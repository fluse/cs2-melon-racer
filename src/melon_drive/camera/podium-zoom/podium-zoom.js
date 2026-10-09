// Podium camera: zooms out while the melon is held on the hub's podium
// (PODIUM_CAMERA_* in constants.js, the math in logic.js).
import { Instance } from "cs_script/point_script";
import { PodiumCameraBlend } from "./logic.js";
import { PodiumHoldActive } from "../../race/podium/logic.js";

/**
 * Per tick: eases the chase camera out while the melon stands on the podium
 * and back in after (UpdateFollowCamera in follow.js applies the zoom right
 * after). Left alone while the melon is breaking — the break camera owns it.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function UpdatePodiumCamera(kart, dt) {
    if (kart.breaking) {
        return;
    }
    kart.podiumCameraBlend = PodiumCameraBlend(kart.podiumCameraBlend ?? 0, PodiumHoldActive(kart.podium, Instance.GetGameTime()), dt);
}
