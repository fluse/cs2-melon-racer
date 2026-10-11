// The third-person chase camera: attaching it to the melon, its normal
// offset (CAMERA_DISTANCE/CAMERA_HEIGHT), and the one place that writes
// the follow config (SetFollowOffset) — the break, lift, podium and
// camera-zone zooms (the other folders in camera/) all go through it. Walls pull the
// camera in through ../wall-clip/ (eased), not the engine.
import { CustomCameraMode } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { karts } from "../../core/kart-registry.js";
import { LiftCameraOffset } from "../lift-zoom/logic.js";
import { PodiumCameraOffset } from "../podium-zoom/logic.js";
import { WallClippedOffset } from "../wall-clip/wall-clip.js";
import { ZoneCameraClips, ZoneCameraOffset } from "../../zones/camera-zone/logic.js";
import { CAMERA_LATERAL, CAMERA_DISTANCE, CAMERA_HEIGHT, CAMERA_OFFSET_RETURN_STRENGTH, FOLLOW_OFFSET } from "../../constants/index.js";

/**
 * The normal chase offset, before any zoom: CAMERA_DISTANCE/CAMERA_HEIGHT,
 * or what this player set on the user menu's camera page (kart.cameraTuning,
 * dev/camera-tuning.js).
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function GetCameraOffsetFor(kart) {
    return { x: -(kart.cameraTuning?.distance ?? CAMERA_DISTANCE), y: CAMERA_LATERAL, z: kart.cameraTuning?.height ?? CAMERA_HEIGHT };
}

/**
 * (Re-)applies the third-person follow camera from a kart's current
 * pawn/melon. Called whenever the camera needs attaching
 * (CustomPlayerCamera lives on the pawn instance, so this must be
 * re-called every time the player gets a fresh pawn, i.e. each respawn).
 * Keeps a lift zone's or camera zone's zoom if one is on (see ApplyZonedFollowOffset);
 * the wall pull-in starts over, right at the distance that fits.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function ApplyCameraFollow(kart) {
    const camera = kart.pawn.GetCustomCamera();
    camera.SetMode(CustomCameraMode.FOLLOW_POSITION);
    kart.cameraWallScale = undefined;
    kart.appliedFollowKey = undefined;
    ApplyZonedFollowOffset(kart, 0);
    // In a side-view zone the side camera (../side-view/) keeps the camera —
    // the follow config above is only ready for when it hands back.
    if ((kart.sideViewBlend ?? 0) > 0) {
        camera.SetMode(CustomCameraMode.CONTROLLED);
    }
    Debug(`ApplyCameraFollow: mode=${camera.GetMode()} for slot=${kart.pawn.GetPlayerController()?.GetPlayerSlot()}`);
}

/**
 * Per tick: the chase camera with every zoom and the wall pull-in eased on.
 * Spectating (race/spectate/, kart.spectateSlot) it chases that player's
 * melon instead, with their zooms. Left alone while the melon is breaking — the break camera owns it then,
 * and the respawn re-applies it — in free look (dev/free-look.js) and while
 * the side-view camera has it (../side-view/).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt
 */
export function UpdateFollowCamera(kart, dt) {
    const watched = kart.spectateSlot !== undefined ? karts.get(kart.spectateSlot) : undefined;
    if (watched?.melon.IsValid() && !kart.freeLook) {
        ApplyZonedFollowOffset(kart, dt, watched);
        return;
    }
    if (kart.breaking || kart.freeLook || (kart.sideViewBlend ?? 0) > 0) {
        return;
    }
    ApplyZonedFollowOffset(kart, dt);
}

/**
 * The normal offset with both zone zooms on top — the lift zoom
 * (kart.liftCameraBlend, lift-zoom.js) and the camera-zone zoom
 * (kart.zoneCamera, zone-zoom.js); they add up. Walls pull the camera in
 * (wall-clip.js, eased over `dt`) only while neither turns that off.
 * `watched` is the kart whose melon (and zooms) the camera chases — the own
 * one, or the one spectated.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt
 * @param {import("../../core/kart-registry.js").Kart} [watched]
 */
export function ApplyZonedFollowOffset(kart, dt, watched = kart) {
    const liftBlend = watched.liftCameraBlend ?? 0;
    const offset = ZonedFollowOffset(kart, watched);
    const clips = liftBlend === 0 && (watched.podiumCameraBlend ?? 0) === 0 && ZoneCameraClips(watched.zoneCamera);
    if (!clips) {
        kart.cameraWallScale = undefined; // no wall pull-in out here; starts over once it's back on
    }
    const placed = clips ? WallClippedOffset(kart, offset, dt, watched.melon) : offset;
    const key = `${watched === kart ? "" : `${kart.spectateSlot}:`}${placed.x.toFixed(2)},${placed.y.toFixed(2)},${placed.z.toFixed(2)}`;
    if (key === kart.appliedFollowKey) {
        return; // unchanged since the last tick — don't rewrite the engine's config
    }
    SetFollowOffset(kart, placed, false, watched.melon);
    kart.appliedFollowKey = key;
}

/**
 * The normal offset (this player's own, see GetCameraOffsetFor) with the
 * zone zooms of `watched` on top, before the wall pull-in.
 * @param {import("../../core/kart-registry.js").Kart} kart
 * @param {import("../../core/kart-registry.js").Kart} [watched] whose zooms — the own kart's, or the spectated one's
 */
export function ZonedFollowOffset(kart, watched = kart) {
    const lifted = LiftCameraOffset(GetCameraOffsetFor(kart), watched.liftCameraBlend ?? 0);
    return ZoneCameraOffset(PodiumCameraOffset(lifted, watched.podiumCameraBlend ?? 0), watched.zoneCamera);
}

/**
 * Points the chase camera at the melon from `cameraOffset` (x forward,
 * negative = behind; z up — rotated by the player's eye angles).
 * @param {import("../../core/kart-registry.js").Kart} kart @param {{ x: number, y: number, z: number }} cameraOffset
 * @param {boolean} engineClipsToWalls let the engine pull the camera in at walls (instantly) — only the
 *   break camera does; everything else goes through ApplyZonedFollowOffset's own, eased pull-in
 * @param {any} [followEntity] the melon to chase — the own, or a spectated one
 */
export function SetFollowOffset(kart, cameraOffset, engineClipsToWalls, followEntity = kart.melon) {
    kart.pawn.GetCustomCamera().SetFollowConfig({
        followEntity,
        followOffset: FOLLOW_OFFSET,
        cameraOffset,
        clipCameraOffset: engineClipsToWalls,
        cameraOffsetReturnStrength: CAMERA_OFFSET_RETURN_STRENGTH,
    });
    kart.appliedFollowKey = undefined;
}
