// Free look: the player turns into a drone and flies it through the map
// instead of driving. Toggled per player from the user menu (kart.freeLook,
// see SetFreeLook); off by default. The drone is a fresh copy of the
// DRONE_TEMPLATE_NAME point_template (the quadcopter from
// tools/models/make-drone-model.mjs, its rotors spinning), moved by the
// script every tick (UpdateDrone): W/S along the view, A/D sideways, jump
// up, duck down, attack faster — with inertia, leaning into its turns
// (drone-logic.js). It runs into the world — a box trace
// along every move, sliding along what it hits — but flies through melons,
// players and other drones (the model has no collision at all). The chase
// camera follows the drone; the pawn stays held at its anchor as usual.
// The melon waits where it was, frozen (UpdateKart skips it; physics motion
// off), and switching back removes the drone and puts the chase camera
// back on the melon. The others see the drone — who's flying around — and
// its laser pointer (optional, DRONE_LASER_TEMPLATE_NAME): a beam from the
// camera's recording light along the pilot's view to the first wall, at
// most DRONE_LASER_LENGTH long, laid from glowing rod segments.
import { Instance, CSInputs, CustomCameraMode } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { GetSpeedHud } from "../hud/layout.js";
import { karts } from "../core/kart-registry.js";
import { ApplyCameraFollow } from "../camera/index.js";
import { SpawnFromTemplate } from "../fx/particles.js";
import { TraceBox, TraceLine } from "../core/trace.js";
import { DroneWishVelocity, StepDroneVelocity, IsDroneOnFloor, StepDroneStillSeconds, IsDroneLanded, DroneRotorInputs, StepDroneYaw, ClipVelocity, DroneTargetTilt, StepDroneTilt, DroneLaserRay, ViewForward, LaserSegments, DRONE_LASER_SEGMENTS } from "./drone-logic.js";
import {
    DRONE_TEMPLATE_NAME, DRONE_START_HEIGHT, DRONE_SPEED, DRONE_FAST_SPEED, DRONE_RADIUS, DRONE_BOTTOM, DRONE_TOP, DRONE_GROUND_DISTANCE, DRONE_TAKEOFF_SPEED, DRONE_TAKEOFF_SECONDS,
    DRONE_CAMERA_DISTANCE, DRONE_CAMERA_HEIGHT, DRONE_CAMERA_PIVOT, CAMERA_OFFSET_RETURN_STRENGTH,
    DRONE_LASER_TEMPLATE_NAME, HUD_RESEND_SECONDS,
} from "../constants/index.js";

/** @typedef {import("../core/kart-registry.js").Kart} Kart */

/** Moves per tick: one, then up to this many more sliding along what it hit. */
const MAX_SLIDES = 3;
/** Traces that hit a melon are re-run without it, at most this often. */
const MAX_MELON_SKIPS = 4;
/** Kept this far off a surface it ran into, so the next trace doesn't start in it. */
const SURFACE_GAP = 0.5;
/** The drone against the world: DRONE_RADIUS to each side, down to its skids, up to its top. */
const DRONE_BOX = { mins: { x: -DRONE_RADIUS, y: -DRONE_RADIUS, z: -DRONE_BOTTOM }, maxs: { x: DRONE_RADIUS, y: DRONE_RADIUS, z: DRONE_TOP } };

/** @param {Kart} kart */
export function IsFreeLookOn(kart) {
    return Boolean(kart.freeLook);
}

/**
 * Turns free look on/off for this kart's player. Not while they're in a
 * Grand Prix (kart.racing — a heat starting switches it off), not while the melon is
 * breaking (the respawn would switch its motion and the chase camera back
 * on mid-flight), and not without DRONE_TEMPLATE_NAME in the map. Returns
 * whether it's on now.
 * @param {Kart} kart @param {boolean} on
 */
export function SetFreeLook(kart, on) {
    if (on === IsFreeLookOn(kart)) {
        return on;
    }
    if (on && kart.racing) {
        Debug("SetFreeLook: in a Grand Prix, not switching free look on");
        return false;
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
        SetDroneHintHud(kart, false);
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
    const parts = [...entities];
    for (const entity of parts) {
        entity.Teleport({ position, angles }); // ForceSpawn keeps its Hammer offset from the template
        // In case it's left solid in Hammer: melons and their traces mustn't bump into a drone.
        Instance.EntFireAtTarget({ target: entity, input: "DisableCollision" });
        Instance.EntFireAtTarget({ target: entity, input: "SetIdleAnimationLooping", value: "spin" });
    }
    const body = parts.find((entity) => entity.GetClassName() === "prop_dynamic") ?? parts[0];
    if (!body) {
        Instance.Msg(`[melon_drive] "${DRONE_TEMPLATE_NAME}" has no drone prop_dynamic — staying off`);
        for (const entity of entities) {
            entity.Remove();
        }
        return false;
    }
    const laser = SpawnLaser(position);
    kart.drone = { entities: [...entities, ...laser], parts, body, laser, position, velocity: { x: 0, y: 0, z: 0 }, tilt: { pitch: 0, roll: 0 }, yaw: angles.yaw, landed: false, stillSeconds: 0 };
    const camera = kart.pawn.GetCustomCamera();
    camera.SetMode(CustomCameraMode.FOLLOW_POSITION);
    camera.SetFollowConfig({
        followEntity: body,
        followOffset: { x: 0, y: 0, z: DRONE_CAMERA_PIVOT },
        cameraOffset: { x: -DRONE_CAMERA_DISTANCE, y: 0, z: DRONE_CAMERA_HEIGHT - DRONE_CAMERA_PIVOT },
        clipCameraOffset: true,
        cameraOffsetReturnStrength: CAMERA_OFFSET_RETURN_STRENGTH,
    });
    kart.appliedFollowKey = undefined; // the melon's chase camera is written anew when it's back
    return true;
}

/**
 * The hint in the bottom left corner, "R → EXIT DRONE MODE" (#drone_hint): shown
 * while flying — sent on change and again every HUD_RESEND_SECONDS —,
 * hidden at once when drone mode ends. Above it "SPACE → JUMP TO START"
 * (#drone_hint_takeoff) while the drone is parked.
 * @param {Kart} kart @param {boolean} on @param {boolean} [parked]
 */
function SetDroneHintHud(kart, on, parked = false) {
    const now = Instance.GetGameTime();
    if (on === kart.droneHintShown && parked === kart.droneHintParked && now < (kart.droneHintResendAt ?? 0)) {
        return;
    }
    kart.droneHintShown = on;
    kart.droneHintParked = parked;
    kart.droneHintResendAt = now + HUD_RESEND_SECONDS;
    const slot = kart.pawn.IsValid() ? kart.pawn.GetPlayerController()?.GetPlayerSlot() : undefined;
    if (slot !== undefined) {
        GetSpeedHud()?.SetHasClassForPlayer(slot, "drone_hint", "Hidden", !on);
        GetSpeedHud()?.SetHasClassForPlayer(slot, "drone_hint_takeoff", "Hidden", !(on && parked));
    }
}

/**
 * The laser's segments: DRONE_LASER_SEGMENTS copies of the laser template,
 * never solid. None without the template in the map (no laser).
 * @param {{ x: number, y: number, z: number }} position
 */
function SpawnLaser(position) {
    /** @type {any[]} */
    const segments = [];
    for (let i = 0; i < DRONE_LASER_SEGMENTS; i++) {
        const spawned = SpawnFromTemplate(DRONE_LASER_TEMPLATE_NAME, position, undefined);
        if (spawned.length === 0) {
            break; // no laser template — already logged (DEBUG)
        }
        for (const entity of spawned) {
            Instance.EntFireAtTarget({ target: entity, input: "DisableCollision" });
        }
        segments.push(...spawned);
    }
    return segments;
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
    // Landed it's parked: only jump takes off — a hop up, the floor ignored for a moment.
    const now = Instance.GetGameTime();
    if (drone.landed && pawn.WasInputJustPressed(CSInputs.JUMP)) {
        drone.takeoffUntil = now + DRONE_TAKEOFF_SECONDS;
        drone.velocity = { x: 0, y: 0, z: DRONE_TAKEOFF_SPEED };
    }
    const takingOff = now < (drone.takeoffUntil ?? -Infinity);
    const parked = drone.landed && !takingOff;
    const Axis = (/** @type {any} */ plus, /** @type {any} */ minus) => (pawn.IsInputPressed(plus) ? 1 : 0) - (pawn.IsInputPressed(minus) ? 1 : 0);
    const input = {
        forward: Axis(CSInputs.FORWARD, CSInputs.BACK),
        strafe: Axis(CSInputs.RIGHT, CSInputs.LEFT),
        lift: Axis(CSInputs.JUMP, CSInputs.DUCK),
    };
    const speed = pawn.IsInputPressed(CSInputs.ATTACK) ? DRONE_FAST_SPEED : DRONE_SPEED;
    const view = pawn.GetEyeAngles();
    const before = drone.velocity;
    drone.velocity = parked ? { x: 0, y: 0, z: 0 } : StepDroneVelocity(before, DroneWishVelocity(input, view, speed), dt);
    // What the rotors did this tick, before the world stops any of it — that's what it leans into.
    const accel = dt > 0 && !parked
        ? { x: (drone.velocity.x - before.x) / dt, y: (drone.velocity.y - before.y) / dt, z: (drone.velocity.z - before.z) / dt }
        : { x: 0, y: 0, z: 0 };
    const moved = MoveDrone(kart, drone.position, drone.velocity, dt);
    drone.position = moved.position;
    drone.velocity = moved.velocity;
    // On the ground it doesn't turn with the view, in the air it swings back to it.
    drone.yaw = StepDroneYaw(drone.yaw, view.yaw, drone.landed, dt);
    drone.tilt = StepDroneTilt(drone.tilt, DroneTargetTilt(drone.velocity, accel, drone.yaw, DRONE_SPEED), dt);
    const angles = { pitch: drone.tilt.pitch, yaw: drone.yaw, roll: drone.tilt.roll };
    for (const entity of drone.parts) {
        if (entity.IsValid()) {
            entity.Move({ position: drone.position, angles });
        }
    }
    UpdateDroneRotors(kart, takingOff, dt);
    UpdateDroneLaser(kart, angles, view);
    SetDroneHintHud(kart, true, drone.landed && now >= (drone.takeoffUntil ?? -Infinity));
}

/**
 * Standing still on the floor for DRONE_LAND_SECONDS the rotors run down to
 * a stop, taking off they run up again (IsDroneOnFloor, StepDroneStillSeconds,
 * IsDroneLanded, DroneRotorInputs) — the floor looked for
 * DRONE_GROUND_DISTANCE under the drone's skids.
 * @param {Kart} kart @param {boolean} takingOff jump pressed on the ground just now @param {number} dt
 */
function UpdateDroneRotors(kart, takingOff, dt) {
    const drone = kart.drone;
    const below = { x: drone.position.x, y: drone.position.y, z: drone.position.z - DRONE_GROUND_DISTANCE };
    const onFloor = IsDroneOnFloor(DroneTrace(kart, drone.position, below), takingOff);
    // Landed it's parked (velocity held at 0), so it stays landed until jump takes off.
    drone.stillSeconds = StepDroneStillSeconds(drone.stillSeconds ?? 0, onFloor, drone.velocity, dt);
    const landed = IsDroneLanded(drone.stillSeconds);
    for (const [input, value] of DroneRotorInputs(landed, drone.landed)) {
        for (const entity of drone.parts) {
            if (entity.IsValid()) {
                Instance.EntFireAtTarget({ target: entity, input, value });
            }
        }
    }
    drone.landed = landed;
}

/**
 * The laser pointer: from the camera's recording light along the pilot's
 * view to the first thing in the way (not the drone itself, not players),
 * at most DRONE_LASER_LENGTH — its segments laid end to end (LaserSegments).
 * @param {Kart} kart @param {{ pitch: number, yaw: number, roll: number }} angles the drone's
 * @param {{ pitch: number, yaw: number }} view the pilot's
 */
function UpdateDroneLaser(kart, angles, view) {
    const segments = kart.drone?.laser ?? [];
    if (segments.length === 0) {
        return;
    }
    const { start, end } = DroneLaserRay(kart.drone.position, angles, view);
    const trace = TraceLine({ start, end, ignoreEntity: kart.drone.entities, ignorePlayers: true });
    const to = trace.didHit ? trace.end : end;
    const length = Math.hypot(to.x - start.x, to.y - start.y, to.z - start.z);
    const { positions, scale } = LaserSegments(start, ViewForward(view), length);
    const beamAngles = { pitch: view.pitch, yaw: view.yaw, roll: 0 };
    segments.forEach((segment, i) => {
        if (!segment.IsValid()) {
            return;
        }
        segment.Move({ position: positions[Math.min(i, positions.length - 1)], angles: beamAngles });
        if (segment.laserScale !== scale) {
            segment.laserScale = scale;
            segment.SetModelScale?.(scale);
        }
    });
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
 * The world between `start` and `end` for a drone: a box trace, the
 * drone's size (DRONE_BOX; a line trace if the box starts stuck), re-run past every melon
 * it meets — drones fly through melons. Undefined if the way is clear.
 * @param {Kart} kart @param {any} start @param {any} end
 */
function DroneTrace(kart, start, end) {
    const melons = new Set([...karts.values()].map((other) => other.melon));
    /** @type {any[]} */
    const ignore = [...(kart.drone?.entities ?? [])];
    for (let skip = 0; skip <= MAX_MELON_SKIPS; skip++) {
        let result = TraceBox({ start, end, ...DRONE_BOX, ignoreEntity: ignore, ignorePlayers: true });
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
