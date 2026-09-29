// Script inputs of the zone triggers — heal, lift and camera zones, jump pads. All work
// the same way: OnStartTouch -> "<kind>_enter", OnEndTouch -> "<kind>_leave",
// and the touched trigger's own name may carry its value (heal_zone_<rate>,
// lift_zone_<speed>, camera_zone_<distance>_<height>). What the zones do is in
// physics/zones.js and the systems reading it (healing, wall rules, cameras).
import { Instance } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { FindKartByMelon } from "./kart-registry.js";
import { HealZoneRate, PlayHealEffect } from "./heal/index.js";
import { LiftZoneUpSpeed } from "./logic/lift.js";
import { CameraZoneFromName } from "./logic/camera-zone.js";
import { JumpPadFromName } from "./logic/jump-pad.js";
import { EnterZone, LeaveZone } from "./physics/index.js";

/**
 * @param {string} enterInput @param {string} leaveInput
 * @param {import("./physics/zones.js").ZoneKind} kind
 * @param {(triggerName: string) => any} valueFromName @param {string} unit for the debug log
 * @param {(kart: import("./kart-registry.js").Kart) => void} [onEnter] e.g. an effect on entering
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
    // Heal zones (incl. heal_zone_full) — everything else about healing is in heal/.
    RegisterZone("heal_enter", "heal_leave", "healZones", HealZoneRate, "health/s", PlayHealEffect);
    // Lift zones — see constants/lift.js. Read by CurrentWallRules (every wall
    // bounce and wall jump) and the lift camera.
    RegisterZone("lift_enter", "lift_leave", "liftZones", LiftZoneUpSpeed, "u/s up per bounce");
    // Camera zones — see CAMERA_ZONE_* in constants/camera.js. Read by the zone camera (camera/zone-zoom.js).
    RegisterZone("camera_enter", "camera_leave", "cameraZones", CameraZoneFromName, "extra back/up");
    // Jump pads — see constants/jump-pad.js. Read by physics/jump-pad.js (launch, no damage).
    RegisterZone("jump_pad_enter", "jump_pad_leave", "jumpPads", JumpPadFromName, "up/forward u/s");
}
