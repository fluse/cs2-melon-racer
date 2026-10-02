// Free look: fly through the map with the player's own pawn instead of
// driving. Toggled per player from the user menu (kart.freeLook, see
// SetFreeLook); off by default. The pawn is NOCLIP anyway (FreezePawn), so
// while this is on HoldPawn just stops pulling it back to its anchor, WASD
// flies it along the view, and the camera shows its eyes (DISABLED mode)
// instead of chasing the melon. The melon waits where it was, frozen
// (UpdateKart skips it; physics motion off), and switching back puts the
// pawn back on its anchor and the chase camera back on the melon.
import { Instance, CustomCameraMode } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { ApplyCameraFollow } from "../camera/index.js";
import { CAMERA_DISTANCE, CAMERA_HEIGHT, FOLLOW_OFFSET, FREE_LOOK_EYE_HEIGHT } from "../constants/index.js";

/** @param {import("../core/kart-registry.js").Kart} kart */
export function IsFreeLookOn(kart) {
    return Boolean(kart.freeLook);
}

/**
 * Turns free look on/off for this kart's player. Not while the melon is
 * breaking: the respawn would switch its motion and the chase camera back on
 * mid-flight. Returns whether it's on now.
 * @param {import("../core/kart-registry.js").Kart} kart @param {boolean} on
 */
export function SetFreeLook(kart, on) {
    if (on === IsFreeLookOn(kart)) {
        return on;
    }
    if (on && (kart.breaking || !kart.melon.IsValid())) {
        Debug("SetFreeLook: melon is breaking/gone, not switching free look on");
        return false;
    }
    kart.freeLook = on;
    if (kart.melon.IsValid()) {
        kart.melon.Move({ velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } });
        Instance.EntFireAtTarget({ target: kart.melon, input: on ? "DisableMotion" : "EnableMotion" });
    }
    // Driving starts over from rest — the frozen ticks aren't an impact.
    kart.lastVelocity = undefined;
    kart.prevLastVelocity = undefined;
    kart.settled = false;
    if (!kart.pawn.IsValid()) {
        return on;
    }
    if (on) {
        kart.pawn.Teleport({ position: ChaseCameraFeet(kart), velocity: { x: 0, y: 0, z: 0 } });
        kart.pawn.GetCustomCamera().SetMode(CustomCameraMode.DISABLED);
    } else {
        kart.pawn.Teleport({ position: kart.pawnAnchor, velocity: { x: 0, y: 0, z: 0 } });
        ApplyCameraFollow(kart);
    }
    Debug(`SetFreeLook: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} free look ${on ? "on" : "off"}`);
    return on;
}

/**
 * Roughly where the chase camera sits (behind the melon along the view's
 * yaw), as a pawn origin — so the view doesn't jump when free look starts.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
function ChaseCameraFeet(kart) {
    const melon = kart.melon.GetAbsOrigin();
    const yaw = (kart.pawn.GetEyeAngles().yaw * Math.PI) / 180;
    return {
        x: melon.x - Math.cos(yaw) * CAMERA_DISTANCE,
        y: melon.y - Math.sin(yaw) * CAMERA_DISTANCE,
        z: melon.z + FOLLOW_OFFSET.z + CAMERA_HEIGHT - FREE_LOOK_EYE_HEIGHT,
    };
}
