// Side-view camera: while the melon is in a side-view zone
// (zones/side-view/), the camera stops chasing it along the mouse and looks
// at it from one side, like a 2D jump & run. The camera is switched to
// CONTROLLED mode and placed by script every tick; it swings over from the
// chase camera and back (SIDE_VIEW_EASE_SECONDS, the math in logic.js). It
// follows the melon on a damped spring (SIDE_VIEW_CAMERA_SMOOTH_SECONDS):
// stuck to it, it stopped dead at walls and jerked at wall jumps.
import { Instance, CustomCameraMode } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { ApplyCameraFollow, ZonedFollowOffset } from "../follow/follow.js";
import { StepSideViewBlend, SideViewPose, StepSideViewFocus, ChaseCameraPose, BlendPose, IsTeleportJump, CutsSideViewExit } from "./logic.js";
import { SideViewAxes } from "../../zones/side-view/logic.js";
import { ViewAnglesFacing } from "../../zones/teleport/logic.js";
// Straight from zones/registry.js, not zones/index.js: that one also loads
// zones/inputs.js, which reaches kart/ and health/ — and both import camera/.
import { CurrentSideView } from "../../zones/registry.js";
import { FOLLOW_OFFSET } from "../../constants/index.js";

/** Whether the side-view camera has the camera (also while swinging in or out). @param {import("../../core/kart-registry.js").Kart} kart */
export function SideViewCameraOn(kart) {
    return (kart.sideViewBlend ?? 0) > 0;
}

/**
 * Per tick: swings the camera to the side while the melon is in a side-view
 * zone and back to the chase camera after it leaves. Left alone while the
 * melon is breaking — the camera just stays where it was, watching the crash
 * site — and in free look (dev/free-look.js).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function UpdateSideViewCamera(kart, dt) {
    if (kart.breaking || kart.freeLook) {
        return;
    }
    const origin = kart.melon.GetAbsOrigin();
    const now = Instance.GetGameTime();
    const jumped = IsTeleportJump(kart.sideViewOrigin, origin);
    kart.sideViewOrigin = origin;
    if (jumped) {
        kart.sideViewTeleportTime = now;
    }
    const zone = CurrentSideView(kart);
    if (!zone && (kart.sideViewBlend ?? 0) > 0 && CutsSideViewExit(kart.sideViewTeleportTime, now)) {
        // Teleported out (hub, a checkpoint, a teleporter): straight back to
        // the chase camera, the view left facing the way the teleport set it.
        kart.sideViewBlend = 0;
        kart.sideViewZone = undefined;
        kart.sideViewLast = undefined;
        ApplyCameraFollow(kart);
        Debug(`side view: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} teleported out, camera cut back`);
        return;
    }
    if (!zone && kart.sideViewZone) {
        LookAlongTravel(kart, kart.sideViewZone);
    }
    if (zone) {
        kart.sideViewZone = zone;
    }
    const before = kart.sideViewBlend ?? 0;
    const blend = StepSideViewBlend(before, Boolean(zone), dt);
    kart.sideViewBlend = blend;
    if (!zone) {
        kart.sideViewZone = undefined;
    }
    if (blend === 0) {
        kart.sideViewFocus = undefined;
        if (before > 0) {
            kart.sideViewLast = undefined;
            ApplyCameraFollow(kart); // back to the chase camera
        }
        return;
    }
    const sideView = kart.sideViewZone ?? kart.sideViewLast;
    if (!sideView) {
        return;
    }
    kart.sideViewLast = sideView; // swinging back out: from the zone just left
    const camera = kart.pawn.GetCustomCamera();
    if (camera.GetMode() !== CustomCameraMode.CONTROLLED) {
        camera.SetMode(CustomCameraMode.CONTROLLED);
        Debug(`side view: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} camera to the side (yaw ${sideView.yaw})`);
    }
    // Aimed on a damped spring (logic.js StepSideViewFocus) — straight at
    // the melon again after a teleport.
    kart.sideViewFocus = StepSideViewFocus(jumped ? undefined : kart.sideViewFocus, origin, kart.melon.GetAbsVelocity(), dt);
    const side = SideViewPose(kart.sideViewFocus.point, sideView);
    const pose =
        blend >= 1
            ? side
            : BlendPose(
                  ChaseCameraPose(
                      { x: origin.x + FOLLOW_OFFSET.x, y: origin.y + FOLLOW_OFFSET.y, z: origin.z + FOLLOW_OFFSET.z },
                      ZonedFollowOffset(kart),
                      kart.pawn.GetEyeAngles()
                  ),
                  side,
                  blend
              );
    // Teleport after a jump (e.g. a respawn inside the zone): Move would
    // interpolate the camera across the map.
    if (jumped) {
        camera.Teleport({ position: pose.position, angles: pose.angles });
    } else {
        camera.Move({ position: pose.position, angles: pose.angles });
    }
}

/**
 * Leaving a side view: turns the player's view the way the melon goes on
 * screen — steering follows the view again, and the mouse may have pointed
 * anywhere meanwhile. The chase camera then swings in behind it.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {import("../../zones/side-view/logic.js").SideView} sideView
 */
function LookAlongTravel(kart, sideView) {
    if (!kart.pawn.IsValid()) {
        return;
    }
    const { right } = SideViewAxes(sideView.yaw);
    const facing = kart.sideViewDrive?.facing ?? 1;
    const yaw = (Math.atan2(right.y * facing, right.x * facing) * 180) / Math.PI;
    kart.pawn.Teleport({ angles: ViewAnglesFacing(kart.pawn.GetEyeAngles(), yaw) });
}
