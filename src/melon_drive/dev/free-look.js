// Free look: fly through the map with the player's own pawn instead of
// driving. Toggled per player from the user menu (kart.freeLook, see
// SetFreeLook); off by default. The pawn is NOCLIP anyway (FreezePawn), so
// while this is on HoldPawn just stops pulling it back to its anchor, WASD
// flies it along the view, and the camera shows its eyes (DISABLED mode)
// instead of chasing the melon. The melon waits where it was, frozen
// (UpdateKart skips it; physics motion off), and switching back puts the
// pawn back on its anchor and the chase camera back on the melon. While
// it's on, a ghost avatar (SPECTATOR_HAT_TEMPLATE_NAME) hangs on the flying
// pawn so the others see who it is.
import { Instance, CustomCameraMode } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { ApplyCameraFollow } from "../camera/index.js";
import { SpawnFromTemplate } from "../fx/particles.js";
import { CAMERA_DISTANCE, CAMERA_HEIGHT, FOLLOW_OFFSET, FREE_LOOK_EYE_HEIGHT, SPECTATOR_HAT_TEMPLATE_NAME, SPECTATOR_HAT_HEIGHT, SPECTATOR_HAT_BACK } from "../constants/index.js";

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
    RemoveSpectatorHat(kart);
    if (!kart.pawn.IsValid()) {
        return on;
    }
    if (on) {
        kart.pawn.Teleport({ position: ChaseCameraFeet(kart), velocity: { x: 0, y: 0, z: 0 } });
        kart.pawn.GetCustomCamera().SetMode(CustomCameraMode.DISABLED);
        AttachSpectatorHat(kart);
    } else {
        kart.pawn.Teleport({ position: kart.pawnAnchor, velocity: { x: 0, y: 0, z: 0 } });
        ApplyCameraFollow(kart);
    }
    Debug(`SetFreeLook: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} free look ${on ? "on" : "off"}`);
    return on;
}

/**
 * Hangs a fresh copy of the SPECTATOR_HAT_TEMPLATE_NAME template on the
 * free-looking pawn (see SpectatorHatPose). Nothing if the map has no such
 * template.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
function AttachSpectatorHat(kart) {
    const { position, angles } = SpectatorHatPose(kart);
    const hat = SpawnFromTemplate(SPECTATOR_HAT_TEMPLATE_NAME, position, angles);
    for (const entity of hat) {
        entity.Teleport({ position, angles }); // ForceSpawn keeps its Hammer offset from the template
        // In case it's left solid in Hammer: the melons' traces and other
        // melons mustn't bump into a flying hat.
        Instance.EntFireAtTarget({ target: entity, input: "DisableCollision" });
    }
    kart.spectatorHat = hat;
}

/**
 * Keeps the ghost avatar on the flying pawn, every tick while free look is
 * on. Moved by script, not parented: parented to the pawn it ended up right
 * in the player's own camera, whatever offset it was given.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function UpdateSpectatorHat(kart) {
    if (!kart.spectatorHat || !kart.pawn.IsValid()) {
        return;
    }
    const pose = SpectatorHatPose(kart);
    for (const entity of kart.spectatorHat) {
        if (entity.IsValid()) {
            entity.Move(pose);
        }
    }
}

/**
 * Where the ghost avatar hangs: SPECTATOR_HAT_BACK behind the pawn's eyes
 * (SPECTATOR_HAT_HEIGHT above its feet) against the view (so the player's
 * own camera doesn't look out through it), turned and tilted with the view —
 * looking down, it tips forward and rises behind the eyes, like a head nodding.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
function SpectatorHatPose(kart) {
    const feet = kart.pawn.GetAbsOrigin();
    const { pitch, yaw } = kart.pawn.GetEyeAngles();
    const p = pitch * Math.PI / 180, y = yaw * Math.PI / 180;
    // The view's forward direction (Source pitch: positive looks down).
    const forward = { x: Math.cos(p) * Math.cos(y), y: Math.cos(p) * Math.sin(y), z: -Math.sin(p) };
    return {
        position: {
            x: feet.x - forward.x * SPECTATOR_HAT_BACK,
            y: feet.y - forward.y * SPECTATOR_HAT_BACK,
            z: feet.z + SPECTATOR_HAT_HEIGHT - forward.z * SPECTATOR_HAT_BACK,
        },
        angles: { pitch, yaw, roll: 0 },
    };
}

/**
 * Removes the free-look ghost avatar, if any — free look off, a new pawn
 * (SetFreeLook), or the player leaving (DropKart does the same).
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function RemoveSpectatorHat(kart) {
    for (const entity of kart.spectatorHat ?? []) {
        if (entity.IsValid()) {
            entity.Remove();
        }
    }
    kart.spectatorHat = undefined;
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
