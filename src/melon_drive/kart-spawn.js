import { Instance, PointTemplate } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { karts, moderatorSlot, SetModeratorSlot } from "./kart-registry.js";
import { ApplyCameraFollow, UpdateCameraDistanceHud } from "./camera.js";
import {
    MELON_TEMPLATE_NAME,
    SPAWN_FORWARD_OFFSET,
    SPAWN_UP_OFFSET,
    HUB_SPAWN_FACING_NAME,
    PAWN_PARK_HEIGHT,
    MELON_MAX_HEALTH,
    CAMERA_DISTANCE_DEFAULT,
} from "./constants.js";

/**
 * Yaw a freshly spawned melon should face: the hub_spawn_facing pivot's
 * angle if the mapper placed one, otherwise the player's own eye yaw (the
 * old behavior, and a reasonable fallback for a solo/dev map with no hub).
 * @param {any} pawn
 */
export function GetSpawnFacingYaw(pawn) {
    const pivot = Instance.FindEntityByName(HUB_SPAWN_FACING_NAME);
    if (pivot) {
        return pivot.GetAbsAngles().yaw;
    }
    return pawn.GetEyeAngles().yaw;
}

export function SpawnMelonFor(pawn) {
    const template = Instance.FindEntityByName(MELON_TEMPLATE_NAME);
    if (!template) {
        Debug(`SpawnMelonFor: no entity named "${MELON_TEMPLATE_NAME}" found at all`);
        return undefined;
    }
    if (!(template instanceof PointTemplate)) {
        Debug(`SpawnMelonFor: entity "${MELON_TEMPLATE_NAME}" exists but is a ${template.GetClassName()}, not a point_template`);
        return undefined;
    }
    const origin = pawn.GetAbsOrigin();
    const yaw = GetSpawnFacingYaw(pawn);
    // Spawn a bit in front of the player, not exactly on top of them —
    // spawning overlapping the player's own hitbox causes the physics
    // engine to violently shove the melon away the instant it appears.
    // Offset along the same yaw it'll face, not the player's own facing, so
    // it consistently appears "ahead, toward the track" regardless of which
    // way the player happens to be looking when they connect.
    const rad = (yaw * Math.PI) / 180;
    const spawnPos = {
        x: origin.x + Math.cos(rad) * SPAWN_FORWARD_OFFSET,
        y: origin.y + Math.sin(rad) * SPAWN_FORWARD_OFFSET,
        z: origin.z + SPAWN_UP_OFFSET,
    };
    const spawned = template.ForceSpawn(spawnPos, { pitch: 0, yaw, roll: 0 });
    if (!spawned || spawned.length === 0) {
        Debug(`SpawnMelonFor: ForceSpawn() returned nothing — check the point_template's Template entries in Hammer`);
        return undefined;
    }
    Debug(`SpawnMelonFor: spawned ${spawned.length} entity(s) at ${JSON.stringify(spawnPos)}, using [0] = ${spawned[0].GetClassName()}`);
    return spawned[0];
}

/** @param {any} pawn */
function HidePawnModel(pawn) {
    // There's no direct "hide" call — alpha 0 is the standard trick to make
    // the model invisible while keeping the entity (and its camera) alive.
    pawn.SetColor({ r: 255, g: 255, b: 255, a: 0 });
}

/** @param {any} pawn @param {any} melon */
export function ParkPawn(pawn, melon) {
    // Anchored to the melon's own (always ground-level) position, not the
    // pawn's current origin. OnPlayerReset can fire more than once for the
    // same life (e.g. a retry after GetOrCreateKart failed because the
    // template entity wasn't ready yet), and anchoring to the pawn's own
    // origin would stack PAWN_PARK_HEIGHT on top of itself each time,
    // eventually parking it absurdly high. Anchoring to the melon makes
    // re-parking idempotent, and also keeps this from ever running before a
    // melon exists (see the call site's `if (kart)` guard) — a pawn parked
    // with no melon yet would otherwise leave its real spawn origin
    // unrecoverable, which is exactly what corrupted checkpointPosition
    // (the parked pawn's own position) into a valid-looking respawn target.
    const origin = melon.GetAbsOrigin();
    pawn.Teleport({ position: { x: origin.x, y: origin.y, z: origin.z + PAWN_PARK_HEIGHT } });
}

export function GetOrCreateKart(pawn) {
    const controller = pawn.GetPlayerController();
    const slot = controller?.GetPlayerSlot();
    if (slot === undefined) {
        Debug("GetOrCreateKart: pawn has no player controller/slot, aborting");
        return undefined;
    }

    let kart = karts.get(slot);
    if (!kart || !kart.melon.IsValid()) {
        Debug(`GetOrCreateKart: slot ${slot} has no valid kart yet, spawning a new melon`);
        const melon = SpawnMelonFor(pawn);
        if (!melon) {
            Debug(`GetOrCreateKart: slot ${slot} — melon spawn failed, no kart created`);
            return undefined;
        }
        if (moderatorSlot === undefined) {
            SetModeratorSlot(slot);
            Debug(`GetOrCreateKart: slot ${slot} is the first player on the map, assigned as moderator`);
        }
        if (kart) {
            // The old kart's melon went invalid (e.g. it tunneled out of the
            // world after a hard crash) but the kart itself already had race
            // progress — keep checkpoint/track/lap state instead of
            // resetting it from the pawn's current position. The pawn may
            // already be parked (invisible, high above the map) by this
            // point, and falling back to its position here is exactly what
            // used to make a broken melon respawn at the invisible player's
            // spot.
            kart.pawn = pawn;
            kart.melon = melon;
            kart.nextJumpTime = 0;
            kart.health = MELON_MAX_HEALTH;
            kart.lastVelocity = undefined;
            kart.breaking = false;
            kart.melon.SetColor(kart.paintColor); // the fresh melon starts undyed — re-apply the kept paint job
        } else {
            // Truly new — no prior checkpoint, so fall back to the player's
            // own current spawn point/facing as the "respawn here" location.
            kart = {
                pawn,
                melon,
                nextJumpTime: 0,
                health: MELON_MAX_HEALTH,
                lastVelocity: undefined,
                trackId: undefined,
                checkpointIndex: 0,
                checkpointPosition: pawn.GetAbsOrigin(),
                checkpointAngles: { pitch: 0, yaw: GetSpawnFacingYaw(pawn), roll: 0 },
                lapsCompleted: 0,
                inHub: false,
                racing: false,
                finished: false,
                locked: false,
                breaking: false,
                paintColor: { r: 255, g: 255, b: 255, a: 255 },
                userMenuOpen: false,
                cameraDistance: CAMERA_DISTANCE_DEFAULT,
            };
        }
        karts.set(slot, kart);
    } else {
        kart.pawn = pawn;
        Debug(`GetOrCreateKart: slot ${slot} reusing existing melon`);
    }

    HidePawnModel(pawn);
    ApplyCameraFollow(kart);
    UpdateCameraDistanceHud(kart);
    return kart;
}
