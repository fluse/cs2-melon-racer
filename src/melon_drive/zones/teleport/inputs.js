// The generic teleporter input, melon_teleport.
import { Instance } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { FindKartByMelon } from "../../core/kart-registry.js";
import { Lifted, LevelAngles } from "../../kart/spawn-points.js";
import { TeleportKartTo } from "../../kart/teleport.js";
import { ParseTeleportTrigger, TeleportExitVelocity } from "./logic.js";
import { TELEPORT_UP_OFFSET } from "../../constants/index.js";

export function RegisterTeleportInput() {
    // Generic teleporter — see TELEPORT_TRIGGER_NAME_PATTERN for the Hammer
    // convention: the destination comes from the touched trigger's own name
    // (teleport_to_<destination>), so every teleporter shares this handler.
    // Msg, not Debug, for wiring mistakes: a teleporter that silently does
    // nothing is hard to spot otherwise.
    Instance.OnScriptInput("melon_teleport", ({ caller, activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart || !caller) {
            Debug("melon_teleport: activator wasn't a tracked melon, ignoring");
            return;
        }
        if (kart.breaking || kart.locked) {
            return; // broken (about to respawn) or parked by the race flow — leave it where it is
        }
        const triggerName = caller.GetEntityName();
        const parsed = ParseTeleportTrigger(triggerName);
        if (!parsed) {
            Instance.Msg(`[melon_drive] melon_teleport: trigger "${triggerName}" isn't named teleport_[stop_|keep_][checkpoint_]to_<destination>, ignoring`);
            return;
        }
        const destinationName = parsed.destination;
        const destination = Instance.FindEntityByName(destinationName);
        if (!destination) {
            Instance.Msg(`[melon_drive] melon_teleport: trigger "${triggerName}" points at "${destinationName}", but no entity has that name`);
            return;
        }
        const yaw = destination.GetAbsAngles().yaw;
        // Lifted like the race-flow teleports: a destination placed on (or
        // sunk into) the floor would otherwise embed the melon in it.
        const position = Lifted(destination.GetAbsOrigin(), TELEPORT_UP_OFFSET);
        const angles = LevelAngles(yaw);
        TeleportKartTo(kart, position, angles, TeleportExitVelocity(kart.melon.GetAbsVelocity(), yaw, parsed.keepSpeed));
        if (parsed.setsRespawn) {
            // Only the respawn point — track progress stays untouched, so this
            // can't skip a race checkpoint.
            kart.checkpointPosition = position;
            kart.checkpointAngles = angles;
        }
        Debug(`melon_teleport: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} -> "${destinationName}"${parsed.setsRespawn ? " (new respawn point)" : ""}`);
    });
}
