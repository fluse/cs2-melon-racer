// Trigger zones the melon can be inside — heal zones (heal_enter/heal_leave,
// HEAL_ZONE_RATE), lift zones (lift_enter/lift_leave, constants/lift.js) and
// camera zones (camera_enter/camera_leave, CAMERA_ZONE_* in constants/camera.js):
// entering/leaving them (registered in ../zone-inputs.js), what they add up
// to right now, and leaving them all at once on a teleport/respawn.
// Each kind is a Map on the kart: trigger entity -> its value (heal rate in
// health/s, lift kick in u/s, camera zoom), so overlapping zones and their leaves are
// tracked separately.
import { WallRules } from "../logic/lift.js";

/** @typedef {"healZones" | "liftZones" | "cameraZones"} ZoneKind */

/**
 * The melon entered a zone trigger of this kind, worth `value`.
 * @param {import("../kart-registry.js").Kart} kart @param {ZoneKind} kind @param {any} trigger @param {any} value
 */
export function EnterZone(kart, kind, trigger, value) {
    (kart[kind] ??= new Map()).set(trigger, value);
}

/** @param {import("../kart-registry.js").Kart} kart @param {ZoneKind} kind @param {any} trigger */
export function LeaveZone(kart, kind, trigger) {
    kart[kind]?.delete(trigger);
}

/**
 * Forgets every zone the melon was in — for teleports/respawns, where the
 * zone's OnEndTouch may never reach us (the melon left it by teleport, or
 * it's a brand new melon entity). If the melon lands inside a zone, the
 * zone's next OnStartTouch adds it back.
 * @param {import("../kart-registry.js").Kart} kart
 */
export function LeaveZones(kart) {
    kart.healZones?.clear();
    kart.liftZones?.clear();
    kart.cameraZones?.clear();
}

/**
 * The strongest value of the zones of this kind the melon is inside, or
 * undefined if none — overlapping zones don't stack. Zone entities that no
 * longer exist are dropped.
 * @param {import("../kart-registry.js").Kart} kart @param {ZoneKind} kind
 */
function StrongestZone(kart, kind) {
    const zones = kart[kind];
    let strongest = undefined;
    for (const [zone, value] of zones ?? []) {
        if (!zone.IsValid()) {
            zones?.delete(zone);
            continue;
        }
        strongest = strongest === undefined ? value : Math.max(strongest, value);
    }
    return strongest;
}

/** Health per second the melon heals right now (0 outside heal zones). @param {import("../kart-registry.js").Kart} kart */
export function CurrentHealRate(kart) {
    return StrongestZone(kart, "healZones") ?? 0;
}

/** Whether the melon is inside a lift zone. @param {import("../kart-registry.js").Kart} kart */
export function InLiftZone(kart) {
    return StrongestZone(kart, "liftZones") !== undefined;
}

/** The wall bounce / wall jump rules for where the melon is now (see WallRules). @param {import("../kart-registry.js").Kart} kart */
export function CurrentWallRules(kart) {
    return WallRules(StrongestZone(kart, "liftZones"));
}

/**
 * The zoom of the camera zone the melon entered last (of those it's still
 * inside), or undefined if none — overlapping camera zones don't add up.
 * @param {import("../kart-registry.js").Kart} kart
 * @returns {import("../logic/camera-zone.js").CameraZone | undefined}
 */
export function CurrentCameraZone(kart) {
    const zones = kart.cameraZones;
    let latest = undefined;
    for (const [zone, value] of zones ?? []) {
        if (!zone.IsValid()) {
            zones?.delete(zone);
            continue;
        }
        latest = value; // Map order = entry order
    }
    return latest;
}
