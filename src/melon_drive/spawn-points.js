import { Instance } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { TraceLine } from "./trace.js";
import { HUB_SPAWN_NAME, HUB_SPAWN_FACING_NAME, INTRO_SPAWN_NAME, SPAWN_UP_OFFSET, FLOOR_TRACE_UP, FLOOR_TRACE_DOWN } from "./constants.js";

// The one place that turns a Hammer spawn entity into a melon position.
// Every caller that puts a melon at the hub or the intro goes through here,
// so they all agree on where exactly that is.

/**
 * @typedef {{ position: { x: number, y: number, z: number }, angles: { pitch: number, yaw: number, roll: number } }} SpawnPoint
 */

/**
 * `origin` lifted by `upOffset` — a melon placed exactly at a floor-level
 * entity's origin would start embedded in the floor and fall through it.
 * @param {{ x: number, y: number, z: number }} origin @param {number} upOffset
 */
export function Lifted(origin, upOffset) {
    return { x: origin.x, y: origin.y, z: origin.z + upOffset };
}

/** Level angles (no pitch/roll) facing `yaw` — a melon should never spawn tilted. @param {number} yaw */
export function LevelAngles(yaw) {
    return { pitch: 0, yaw, roll: 0 };
}

/**
 * Where a melon should appear for a spawn entity at `origin`: SPAWN_UP_OFFSET
 * above the real floor under it, found by tracing down — so it doesn't
 * matter whether the entity sits on, slightly in, or floating above the
 * floor in Hammer. The trace starts a bit above the entity in case it's
 * sunk into the floor. No floor found: just SPAWN_UP_OFFSET above the entity.
 * @param {{ x: number, y: number, z: number }} origin
 */
function PositionAboveFloor(origin) {
    const trace = TraceLine({
        start: Lifted(origin, FLOOR_TRACE_UP),
        end: Lifted(origin, -FLOOR_TRACE_DOWN),
        ignorePlayers: true,
    });
    if (!trace.didHit || trace.startedInSolid) {
        Debug(`PositionAboveFloor: no floor found below ${JSON.stringify(origin)}, spawning relative to the entity itself`);
        return Lifted(origin, SPAWN_UP_OFFSET);
    }
    return Lifted(trace.end, SPAWN_UP_OFFSET);
}

/**
 * Spawn point of the entity named `name`, facing the entity named
 * `facingName` if given and placed, otherwise the entity's own yaw.
 * @param {string} name @param {string} [facingName]
 * @returns {SpawnPoint | undefined}
 */
function FindSpawnPoint(name, facingName) {
    const entity = Instance.FindEntityByName(name);
    if (!entity) {
        return undefined;
    }
    const facing = (facingName && Instance.FindEntityByName(facingName)) || entity;
    return {
        position: PositionAboveFloor(entity.GetAbsOrigin()),
        angles: LevelAngles(facing.GetAbsAngles().yaw),
    };
}

/** Where karts go in the hub: the hub_spawn info_player_start, facing hub_spawn_facing. */
export function GetHubSpawnPoint() {
    const spawn = FindSpawnPoint(HUB_SPAWN_NAME, HUB_SPAWN_FACING_NAME);
    if (!spawn) {
        Debug(`GetHubSpawnPoint: no "${HUB_SPAWN_NAME}" in the map — nowhere to put melons`);
    }
    return spawn;
}

/** Where a player's very first melon appears: the intro_spawn tutorial spot, or the hub if there's none. */
export function GetIntroSpawnPoint() {
    const spawn = FindSpawnPoint(INTRO_SPAWN_NAME);
    if (!spawn) {
        Debug(`GetIntroSpawnPoint: no "${INTRO_SPAWN_NAME}" in the map, using the hub spawn`);
        return GetHubSpawnPoint();
    }
    return spawn;
}
