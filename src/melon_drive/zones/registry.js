// Trigger zones the melon can be inside — heal zones (heal_enter/heal_leave,
// read by ../heal/), lift zones (lift_enter/lift_leave, zones/lift/constants.js) and
// camera zones (camera_enter/camera_leave, CAMERA_ZONE_* in camera-zone/constants.js)
// jump pads (jump_pad_enter/jump_pad_leave, zones/jump-pad/constants.js)
// water zones (water_enter/water_leave, zones/water/constants.js)
// side-view zones (side_view_enter/side_view_leave, zones/side-view/constants.js)
// and jump recharge zones (jump_recharge_enter/jump_recharge_leave, zones/jump-recharge/logic.js):
// entering/leaving them (registered in inputs.js), what they add up
// to right now, and leaving them all at once when a new melon replaces the old.
// Each kind is a Map on the kart: trigger entity -> its value (heal rate in
// health/s, lift kick in u/s, camera zoom), so overlapping zones and their leaves are
// tracked separately.
import { WallRules } from "./lift/logic.js";

/** @typedef {"healZones" | "liftZones" | "cameraZones" | "jumpPads" | "waterZones" | "sideViews" | "jumpRecharges"} ZoneKind */

/**
 * The melon entered a zone trigger of this kind, worth `value`.
 * @param {import("../core/kart-registry.js").Kart} kart @param {ZoneKind} kind @param {any} trigger @param {any} value
 */
export function EnterZone(kart, kind, trigger, value) {
    (kart[kind] ??= new Map()).set(trigger, value);
}

/** @param {import("../core/kart-registry.js").Kart} kart @param {ZoneKind} kind @param {any} trigger */
export function LeaveZone(kart, kind, trigger) {
    kart[kind]?.delete(trigger);
}

/**
 * Forgets every zone the melon was in — only for a brand new melon entity,
 * whose predecessor's zones never send OnEndTouch (the new one gets its own
 * OnStartTouch). Not for teleports of the same melon: landing back inside the
 * same trigger (e.g. respawning in the zone it broke in) sends no new
 * OnStartTouch, so clearing would lose the zone; leaving it by teleport
 * sends OnEndTouch like any other exit.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function LeaveZones(kart) {
    kart.healZones?.clear();
    kart.liftZones?.clear();
    kart.cameraZones?.clear();
    kart.jumpPads?.clear();
    kart.waterZones?.clear();
    kart.sideViews?.clear();
    kart.jumpRecharges?.clear();
}

/**
 * The strongest value of the zones of this kind the melon is inside, or
 * undefined if none — overlapping zones don't stack. Zone entities that no
 * longer exist are dropped.
 * @param {import("../core/kart-registry.js").Kart} kart @param {ZoneKind} kind
 */
export function StrongestZone(kart, kind) {
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

/** Whether the melon is inside a lift zone. @param {import("../core/kart-registry.js").Kart} kart */
export function InLiftZone(kart) {
    return StrongestZone(kart, "liftZones") !== undefined;
}

/**
 * Whether the melon is inside a water zone — its drag and buoyancy aren't
 * impacts, see zones/water/constants.js.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function InWater(kart) {
    return StrongestZone(kart, "waterZones") !== undefined;
}

/**
 * Whether the melon is inside a jump recharge zone — its wall-jump charges
 * are kept full there.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function InJumpRechargeZone(kart) {
    return StrongestZone(kart, "jumpRecharges") !== undefined;
}

/** The wall bounce / wall jump rules for where the melon is now (see WallRules). @param {import("../core/kart-registry.js").Kart} kart */
export function CurrentWallRules(kart) {
    return WallRules(StrongestZone(kart, "liftZones"), CurrentSideView(kart) !== undefined);
}

/**
 * The launch of the jump pad the melon entered last (of those it's still
 * on), or undefined if it's on none.
 * @param {import("../core/kart-registry.js").Kart} kart
 * @returns {import("./jump-pad/logic.js").JumpPad | undefined}
 */
export function CurrentJumpPad(kart) {
    return LatestZone(kart, "jumpPads");
}

/**
 * The zoom of the camera zone the melon entered last (of those it's still
 * inside), or undefined if none — overlapping camera zones don't add up.
 * @param {import("../core/kart-registry.js").Kart} kart
 * @returns {import("./camera-zone/logic.js").CameraZone | undefined}
 */
export function CurrentCameraZone(kart) {
    return LatestZone(kart, "cameraZones");
}

/**
 * The side view of the side-view zone the melon entered last (of those it's
 * still inside), or undefined if none.
 * @param {import("../core/kart-registry.js").Kart} kart
 * @returns {import("./side-view/logic.js").SideView | undefined}
 */
export function CurrentSideView(kart) {
    return LatestZone(kart, "sideViews");
}

/**
 * The value of the zone of this kind the melon entered last (of those it's
 * still inside), or undefined if none. Zone entities that no longer exist
 * are dropped.
 * @param {import("../core/kart-registry.js").Kart} kart @param {ZoneKind} kind
 */
function LatestZone(kart, kind) {
    const zones = kart[kind];
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
