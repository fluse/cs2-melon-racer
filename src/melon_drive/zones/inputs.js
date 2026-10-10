// Script inputs of the zone triggers — heal, lift, camera, side-view (+ depth), water and jump recharge zones, jump pads,
// plus the teleporters (teleport/inputs.js). The zones all work
// the same way: OnStartTouch -> "<kind>_enter", OnEndTouch -> "<kind>_leave",
// and the touched trigger's own name may carry its value (heal_zone_<rate>,
// lift_zone_<speed>, camera_zone_<distance>_<height>). What the zones do is in
// registry.js and the systems reading it (healing, wall rules, cameras).
import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { FindKartByMelon } from "../core/kart-registry.js";
import { HealZoneRate, PlayHealEffect } from "../health/heal/index.js";
import { LiftZoneUpSpeed } from "./lift/logic.js";
import { CameraZoneFromName } from "./camera-zone/logic.js";
import { SideViewFromName } from "./side-view/logic.js";
import { JumpPadFromName } from "./jump-pad/logic.js";
import { StopInWater } from "./water/water.js";
import { EnterZone, LeaveZone } from "./registry.js";
import { RegisterTeleportInput } from "./teleport/inputs.js";

/**
 * @param {string} enterInput @param {string} leaveInput
 * @param {import("./registry.js").ZoneKind} kind
 * @param {(triggerName: string) => any} valueFromName @param {string} unit for the debug log
 * @param {(kart: import("../core/kart-registry.js").Kart) => void} [onEnter] e.g. an effect on entering
 */
function RegisterZone(enterInput, leaveInput, kind, valueFromName, unit, onEnter) {
    Instance.OnScriptInput(enterInput, ({ caller, activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart || !caller) {
            Debug(`${enterInput}: activator wasn't a tracked melon, ignoring`);
            return;
        }
        const value = valueFromName(caller.GetEntityName());
        EnterZone(kart, kind, caller, value);
        onEnter?.(kart);
        Debug(`${enterInput}: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} in "${caller.GetEntityName()}" (${typeof value === "object" ? JSON.stringify(value) : value} ${unit})`);
    });
    Instance.OnScriptInput(leaveInput, ({ caller, activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (kart && caller) {
            LeaveZone(kart, kind, caller);
        }
    });
}

export function RegisterZoneInputs() {
    // Heal zones (incl. heal_zone_full) — everything else about healing is in health/heal/.
    RegisterZone("heal_enter", "heal_leave", "healZones", HealZoneRate, "health/s", PlayHealEffect);
    // Lift zones — see lift/constants.js. Read by CurrentWallRules (every wall
    // bounce and wall jump) and the lift camera.
    RegisterZone("lift_enter", "lift_leave", "liftZones", LiftZoneUpSpeed, "u/s up per bounce");
    // Camera zones — see CAMERA_ZONE_* in camera-zone/constants.js. Read by the zone camera (camera/zone-zoom/).
    RegisterZone("camera_enter", "camera_leave", "cameraZones", CameraZoneFromName, "extra back/up");
    // Side-view zones — see side-view/constants.js. Read by UpdateKart (2D driving) and the side camera (camera/side-view/).
    RegisterZone("side_view_enter", "side_view_leave", "sideViews", SideViewFromName, "yaw/distance/height");
    // Side-view depth zones — inside a side view, W/S move the melon towards/away from the camera. Read by UpdateKart.
    RegisterZone("side_view_depth_enter", "side_view_depth_leave", "sideViewDepths", () => 1, "(side-view depth)");
    // Jump pads — see jump-pad/constants.js. Read by jump-pad/jump-pad.js (launch, no damage).
    RegisterZone("jump_pad_enter", "jump_pad_leave", "jumpPads", JumpPadFromName, "up/forward u/s");
    // Water zones (a trigger around a func_water) — see water/constants.js:
    // landing in one stops the melon, and UpdateKart reads no impacts inside.
    RegisterZone("water_enter", "water_leave", "waterZones", () => 1, "(water)", StopInWater);
    // Jump recharge zones — see jump-recharge/logic.js. Read by UpdateKart:
    // the wall-jump charges are kept full inside.
    RegisterZone("jump_recharge_enter", "jump_recharge_leave", "jumpRecharges", () => 1, "(jump recharge)");
    RegisterTeleportInput();
}
