// Free look: the player turns into a drone and flies it through the map
// instead of driving. Toggled per player from the user menu (kart.freeLook,
// see SetFreeLook); off by default. The drone is a fresh copy of the
// DRONE_TEMPLATE_NAME point_template (the quadcopter from
// tools/models/make-drone-model.mjs, its rotors spinning), moved by the
// script every tick (UpdateDrone): W/S along the view, A/D sideways, jump
// up, duck down, attack faster — with inertia, leaning into its turns
// (drone-logic.js). It runs into the world — a sphere trace
// along every move, sliding along what it hits — but flies through melons,
// players and other drones (the model has no collision at all). The chase
// camera follows the drone; the pawn stays held at its anchor as usual.
// The melon waits where it was, frozen (UpdateKart skips it; physics motion
// off), and switching back removes the drone and puts the chase camera
// back on the melon. The others see the drone — who's flying around.
import { Instance, CSInputs, CustomCameraMode } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { karts } from "../core/kart-registry.js";
import { ApplyCameraFollow } from "../camera/index.js";
import { SpawnFromTemplate } from "../fx/particles.js";
import { TraceSphere, TraceLine } from "../core/trace.js";
import { DroneWishVelocity, StepDroneVelocity, ClipVelocity, DroneTargetTilt, StepDroneTilt } from "./drone-logic.js";
import {
    DRONE_TEMPLATE_NAME, DRONE_START_HEIGHT, DRONE_SPEED, DRONE_FAST_SPEED, DRONE_RADIUS,
    DRONE_CAMERA_DISTANCE, DRONE_CAMERA_HEIGHT, CAMERA_OFFSET_RETURN_STRENGTH,
} from "../constants/index.js";

/** @typedef {import("../core/kart-registry.js").Kart} Kart */

/** Moves per tick: one, then up to this many more sliding along what it hit. */
const MAX_SLIDES = 3;
/** Traces that hit a melon are re-run without it, at most this often. */
const MAX_MELON_SKIPS = 4;
/** Kept this far off a surface it ran into, so the next trace doesn't start in it. */
const SURFACE_GAP = 0.5;

/** @param {Kart} kart */
export function IsFreeLookOn(kart) {
    return Boolean(kart.freeLook);
}

/**
 * Turns free look on/off for this kart's player. Not while the melon is
 * breaking (the respawn would switch its motion and the chase camera back
 * on mid-flight), and not without DRONE_TEMPLATE_NAME in the map. Returns
 * whether it's on now.
 * @param {Kart} kart @param {boolean} on
 */
export function SetFreeLook(kart, on) {
    if (on === IsFreeLookOn(kart)) {
        return on;
    }
    if (on && (kart.breaking || !kart.melon.IsValid())) {
        Debug("SetFreeLook: melon is breaking/gone, not switching free look on");
        return false;
    }
    if (on && !SpawnDrone(kart)) {
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
    if (!on) {
        RemoveDrone(kart);
        if (kart.pawn.IsValid()) {
            ApplyCameraFollow(kart);
        }
    }
    Debug(`SetFreeLook: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} free look ${on ? "on" : "off"}`);
    return on;
}

/**
 * A fresh drone DRONE_START_HEIGHT above the melon, facing the view, its
 * rotors spinning, the chase camera on it. False (and a console message)
 * without the template in the map.
 * @param {Kart} kart
 */
function SpawnDrone(kart) {
    const melon = kart.melon.GetAbsOrigin();
    const position = { x: melon.x, y: melon.y, z: melon.z + DRONE_START_HEIGHT };
    const angles = { pitch: 0, yaw: kart.pawn.GetEyeAngles().yaw, roll: 0 };
    const entities = SpawnFromTemplate(DRONE_TEMPLATE_NAME, position, angles, { warn: true });
    if (entities.length === 0) {
        Instance.Msg(`[melon_drive] free look needs a point_template "${DRONE_TEMPLATE_NAME}" with the drone prop_dynamic (models/melon_racer/drone/drone.vmdl) — staying off`);
        return false;
    }
    for (const entity of entities) {
        entity.Teleport({ position, angles }); // ForceSpawn keeps its Hammer offset from the template
        // In case it's left solid in Hammer: melons and their traces mustn't bump into a drone.
        Instance.EntFireAtTarget({ target: entity, input: "DisableCollision" });
        Instance.EntFireAtTarget({ target: entity, input: "SetIdleAnimationLooping", value: "spin" });
    }
    const body = entities.find((entity) => entity.GetClassName() === "prop_dynamic") ?? entities[0];
    kart.drone = { entities, body, position, velocity: { x: 0, y: 0, z: 0 }, tilt: { pitch: 0, roll: 0 } };
    const camera = kart.pawn.GetCustomCamera();
    camera.SetMode(CustomCameraMode.FOLLOW_POSITION);
    camera.SetFollowConfig({
        followEntity: body,
        followOffset: { x: 0, y: 0, z: 0 },
        cameraOffset: { x: -DRONE_CAMERA_DISTANCE, y: 0, z: DRONE_CAMERA_HEIGHT },
        clipCameraOffset: true,
        cameraOffsetReturnStrength: CAMERA_OFFSET_RETURN_STRENGTH,
    });
    kart.appliedFollowKey = undefined; // the melon's chase camera is written anew when it's back
    return true;
}

/**
 * Removes the free-look drone, if any — free look off, or the player leaving
 * (DropKart does the same).
 * @param {Kart} kart
 */
export function RemoveDrone(kart) {
    for (const entity of kart.drone?.entities ?? []) {
        if (entity.IsValid()) {
            entity.Remove();
        }
    }
    kart.drone = undefined;
}

/**
 * Per tick while free look is on (from UpdateKart): the pilot's input turned
 * into a velocity, the drone moved along it as far as the world lets it,
 * tipped into its flying direction.
 * @param {Kart} kart @param {number} dt
 */
export function UpdateDrone(kart, dt) {
    const drone = kart.drone;
    if (!drone || !kart.pawn.IsValid()) {
        return;
    }
    const pawn = kart.pawn;
    const Axis = (/** @type {any} */ plus, /** @type {any} */ minus) => (pawn.IsInputPressed(plus) ? 1 : 0) - (pawn.IsInputPressed(minus) ? 1 : 0);
    const input = {
        forward: Axis(CSInputs.FORWARD, CSInputs.BACK),
        strafe: Axis(CSInputs.RIGHT, CSInputs.LEFT),
        lift: Axis(CSInputs.JUMP, CSInputs.DUCK),
    };
    const speed = pawn.IsInputPressed(CSInputs.ATTACK) ? DRONE_FAST_SPEED : DRONE_SPEED;
    const view = pawn.GetEyeAngles();
    const before = drone.velocity;
    drone.velocity = StepDroneVelocity(before, DroneWishVelocity(input, view, speed), dt);
    // What the rotors did this tick, before the world stops any of it — that's what it leans into.
    const accel = dt > 0
        ? { x: (drone.velocity.x - before.x) / dt, y: (drone.velocity.y - before.y) / dt, z: (drone.velocity.z - before.z) / dt }
        : { x: 0, y: 0, z: 0 };
    const moved = MoveDrone(kart, drone.position, drone.velocity, dt);
    drone.position = moved.position;
    drone.velocity = moved.velocity;
    drone.tilt = StepDroneTilt(drone.tilt, DroneTargetTilt(drone.velocity, accel, view.yaw, DRONE_SPEED), dt);
    const angles = { pitch: drone.tilt.pitch, yaw: view.yaw, roll: drone.tilt.roll };
    for (const entity of drone.entities) {
        if (entity.IsValid()) {
            entity.Move({ position: drone.position, angles });
        }
    }
}

/**
 * Moves from `position` along `velocity` for `dt`, sliding along whatever it
 * runs into (MAX_SLIDES), never through it.
 * @param {Kart} kart @param {{ x: number, y: number, z: number }} position
 * @param {{ x: number, y: number, z: number }} velocity @param {number} dt
 */
function MoveDrone(kart, position, velocity, dt) {
    let left = dt;
    for (let slide = 0; slide <= MAX_SLIDES && left > 0; slide++) {
        const end = { x: position.x + velocity.x * left, y: position.y + velocity.y * left, z: position.z + velocity.z * left };
        const hit = DroneTrace(kart, position, end);
        if (!hit) {
            return { position: end, velocity };
        }
        position = {
            x: hit.end.x + hit.normal.x * SURFACE_GAP,
            y: hit.end.y + hit.normal.y * SURFACE_GAP,
            z: hit.end.z + hit.normal.z * SURFACE_GAP,
        };
        velocity = ClipVelocity(velocity, hit.normal);
        left *= 1 - hit.fraction;
    }
    return { position, velocity };
}

/**
 * The world between `start` and `end` for a drone: a DRONE_RADIUS sphere
 * trace (a line trace if the sphere starts stuck), re-run past every melon
 * it meets — drones fly through melons. Undefined if the way is clear.
 * @param {Kart} kart @param {any} start @param {any} end
 */
function DroneTrace(kart, start, end) {
    const melons = new Set([...karts.values()].map((other) => other.melon));
    /** @type {any[]} */
    const ignore = [...(kart.drone?.entities ?? [])];
    for (let skip = 0; skip <= MAX_MELON_SKIPS; skip++) {
        let result = TraceSphere({ start, end, radius: DRONE_RADIUS, ignoreEntity: ignore, ignorePlayers: true });
        if (result.startedInSolid) {
            result = TraceLine({ start, end, ignoreEntity: ignore, ignorePlayers: true });
        }
        if (!result.didHit) {
            return undefined;
        }
        if (!result.hitEntity || !melons.has(result.hitEntity)) {
            return result;
        }
        ignore.push(result.hitEntity);
    }
    return undefined;
}
