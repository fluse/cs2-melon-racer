import { Instance, PointTemplate, CSMoveType } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { karts, moderatorSlot, SetModeratorSlot } from "./kart-registry.js";
import { ApplyCameraFollow, UpdateCameraDistanceHud, UpdateCameraHeightHud } from "./camera.js";
import { FacePlayerView } from "./spawn-points.js";
import {
    MELON_TEMPLATE_NAME,
    PAWN_PARK_HEIGHT,
    MELON_MAX_HEALTH,
    MELON_ENGINE_HEALTH,
    CAMERA_DISTANCE_DEFAULT,
    CAMERA_HEIGHT_DEFAULT,
} from "./constants.js";

// Spawn flow, in one sentence: a player without a kart gets a new one at the
// spawn point the caller picks (the intro on join); a player who already has
// one keeps it as-is — a lost melon is brought back by the break/respawn
// logic in kart-physics.js, never here, so the two can't race each other.

/**
 * Spawns a fresh melon from the melon_template point_template — shared by
 * CreateKart below and kart-physics.js's respawn of a destroyed melon.
 * @param {{ x: number, y: number, z: number }} position @param {{ pitch: number, yaw: number, roll: number }} angles
 */
export function SpawnMelonAt(position, angles) {
    const template = Instance.FindEntityByName(MELON_TEMPLATE_NAME);
    if (!(template instanceof PointTemplate)) {
        Debug(`SpawnMelonAt: no point_template named "${MELON_TEMPLATE_NAME}" found`);
        return undefined;
    }
    const spawned = template.ForceSpawn(position, angles);
    if (!spawned || spawned.length === 0) {
        Debug(`SpawnMelonAt: ForceSpawn() returned nothing — check the point_template's Template entries in Hammer`);
        return undefined;
    }
    // ForceSpawn keeps the melon's offset from the template's own origin in
    // Hammer, so it lands somewhere near `position`, not on it — put it
    // exactly there.
    const melon = spawned[0];
    melon.Teleport({ position, angles, velocity: { x: 0, y: 0, z: 0 } });
    Debug(`SpawnMelonAt: spawned ${melon.GetClassName()} at ${JSON.stringify(position)}, engine health was ${melon.GetHealth()}/${melon.GetMaxHealth()}`);
    MakeUnbreakableByEngine(melon);
    return melon;
}

/**
 * Gives the melon so much engine health that the engine's own physics
 * damage can never break it — whatever its Hammer health/damage settings
 * are. Breaking is our job: kart.health, see kart-physics.js.
 * @param {any} melon
 */
function MakeUnbreakableByEngine(melon) {
    melon.SetMaxHealth(MELON_ENGINE_HEALTH);
    melon.SetHealth(MELON_ENGINE_HEALTH);
}

/**
 * Takes the player's own body out of the game: non-solid (NOCLIP — NONE
 * would leave its hitbox solid for the melon to crash into), invisible, and
 * parked high above `anchor`. Safe to call repeatedly: it always parks at the
 * same spot for the same anchor.
 * @param {any} pawn @param {{ x: number, y: number, z: number }} anchor
 */
function FreezePawn(pawn, anchor) {
    pawn.SetMoveType(CSMoveType.NOCLIP);
    pawn.SetColor({ r: 255, g: 255, b: 255, a: 0 });
    pawn.Teleport({ position: { x: anchor.x, y: anchor.y, z: anchor.z + PAWN_PARK_HEIGHT } });
}

/**
 * A fresh kart record whose respawn point is where its melon just appeared.
 * @param {any} pawn @param {any} melon @param {import("./spawn-points.js").SpawnPoint} spawnPoint
 * @returns {import("./kart-registry.js").Kart}
 */
function NewKartRecord(pawn, melon, spawnPoint) {
    return {
        pawn,
        melon,
        nextJumpTime: 0,
        health: MELON_MAX_HEALTH,
        lastVelocity: undefined,
        trackId: undefined,
        checkpointIndex: 0,
        checkpointPosition: spawnPoint.position,
        checkpointAngles: spawnPoint.angles,
        lapsCompleted: 0,
        inHub: false,
        racing: false,
        finished: false,
        locked: false,
        breaking: false,
        settled: false,
        teleportGen: 0,
        paintColor: { r: 255, g: 255, b: 255, a: 255 },
        userMenuOpen: false,
        hubModalOpen: false,
        cameraDistance: CAMERA_DISTANCE_DEFAULT,
        cameraHeight: CAMERA_HEIGHT_DEFAULT,
        lastKnownPosition: undefined,
        lastKnownAngles: undefined,
    };
}

/**
 * New kart for `slot`, its melon spawned at `spawnPoint`. The pawn is
 * frozen and moved away first, so the melon never appears inside it.
 * @param {any} pawn @param {number} slot @param {import("./spawn-points.js").SpawnPoint} spawnPoint
 */
function CreateKart(pawn, slot, spawnPoint) {
    FreezePawn(pawn, spawnPoint.position);
    const melon = SpawnMelonAt(spawnPoint.position, spawnPoint.angles);
    if (!melon) {
        return undefined;
    }
    FacePlayerView(pawn, spawnPoint.angles.yaw);
    const kart = NewKartRecord(pawn, melon, spawnPoint);
    karts.set(slot, kart);
    if (moderatorSlot === undefined) {
        SetModeratorSlot(slot);
        Debug(`CreateKart: slot ${slot} is the first player on the map, assigned as moderator`);
    }
    Debug(`CreateKart: slot ${slot} got a new kart`);
    return kart;
}

/**
 * Everything a (re)spawned player pawn needs: its kart — created at
 * `newKartSpawnPoint` only if the player has none yet — plus a frozen,
 * hidden pawn and the chase camera on the melon.
 * @param {any} pawn @param {import("./spawn-points.js").SpawnPoint | undefined} newKartSpawnPoint
 */
export function SetUpPlayerKart(pawn, newKartSpawnPoint) {
    const slot = pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot === undefined) {
        Debug("SetUpPlayerKart: pawn has no player controller/slot, aborting");
        return undefined;
    }
    let kart = karts.get(slot);
    if (!kart) {
        if (!newKartSpawnPoint) {
            return undefined; // already logged by the spawn point lookup
        }
        kart = CreateKart(pawn, slot, newKartSpawnPoint);
        if (!kart) {
            return undefined;
        }
    }
    kart.pawn = pawn;
    FreezePawn(pawn, kart.checkpointPosition);
    if (kart.melon.IsValid()) {
        ApplyCameraFollow(kart); // a lost melon gets the camera once kart-physics.js respawns it
    }
    UpdateCameraDistanceHud(kart);
    UpdateCameraHeightHud(kart);
    return kart;
}
