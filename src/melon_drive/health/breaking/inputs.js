// Kill triggers: the melon_break input.
import { Instance } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { FindKartByMelon } from "../../core/kart-registry.js";
import { BreakMelon } from "./breaking.js";

export function RegisterBreakInputs() {
    // Kill trigger: any trigger_multiple (filtered to prop_physics) whose
    // OnStartTouch calls RunScriptInput "melon_break" breaks the touching melon
    // on the spot — same break as running out of health (effects at the crash
    // site, respawn at the last checkpoint after BREAK_RESPAWN_DELAY).
    Instance.OnScriptInput("melon_break", ({ activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart) {
            Debug("melon_break: activator wasn't a tracked melon, ignoring");
            return;
        }
        if (kart.breaking || kart.locked) {
            return; // already broken, or parked by the race flow (countdown, finished)
        }
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot() ?? -1;
        const velocity = kart.melon.GetAbsVelocity();
        const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
        kart.health = 0;
        Debug(`melon_break: slot ${slot} broken by trigger`);
        BreakMelon(slot, kart, speed > 0 ? velocity : { x: 1, y: 0, z: 0 }, Math.max(speed, 1));
    });
}
