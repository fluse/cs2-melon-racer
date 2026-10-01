// The hub's script inputs: hub_enter/hub_leave (the start modal) and
// hub_teleport (send a melon to the hub).
import { Instance } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { FindKartByMelon } from "../../core/kart-registry.js";
import { ShowHubModal, HideHubModal } from "../../hud/hub-modal.js";
import { phase, ReturnAllToHub } from "./race-flow.js";
import { HUB_TRIGGER_NAME } from "../../constants/index.js";

export function RegisterHeatInputs() {
    // Hub: place a trigger_multiple named "hub_start_trigger" in the hub area,
    // filtered to prop_physics like the checkpoints, with OnStartTouch/OnEndTouch
    // calling RunScriptInput "hub_enter"/"hub_leave" on this point_script. While a
    // kart is inside it, that player sees the "Jetzt starten" modal (or a
    // "race in progress" message if a heat is already running) — see
    // GAMEPLAY.md's "Hub -> race -> next-track flow".
    Instance.OnScriptInput("hub_enter", ({ caller, activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart) {
            Debug("hub_enter: activator wasn't a tracked melon, ignoring");
            return;
        }
        // Only the hub's own start area may open the start modal. A trigger
        // elsewhere wired to hub_enter by mistake (the intro's pass-through to
        // the hub was — that should be hub_teleport) showed "start race" to
        // players just driving through, and without a matching hub_leave it
        // never closed again. test/map-io.test.mjs catches this in the .vmap.
        // trim(): Hammer happily keeps a stray trailing space in a name (the map's
        // hub trigger had one), which would otherwise reject the real trigger.
        const callerName = caller?.GetEntityName().trim();
        if (callerName !== HUB_TRIGGER_NAME) {
            Instance.Msg(`[melon_drive] hub_enter fired by "${callerName ?? "?"}", not "${HUB_TRIGGER_NAME}" — ignoring. To send melons to the hub, use RunScriptInput hub_teleport instead.`);
            return;
        }
        kart.inHub = true;
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        if (slot !== undefined) {
            ShowHubModal(slot, kart, phase);
        }
    });

    Instance.OnScriptInput("hub_leave", ({ activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart) {
            return;
        }
        kart.inHub = false;
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        if (slot !== undefined) {
            HideHubModal(slot, kart);
        }
    });

    // Hub teleporter: any trigger_multiple (filtered to prop_physics) whose
    // OnStartTouch calls RunScriptInput "hub_teleport" on this point_script sends
    // the touching melon back to the hub — same single-kart path as the user
    // menu's hub button, so a racer who rolls over it also leaves the heat.
    Instance.OnScriptInput("hub_teleport", ({ activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart) {
            Debug("hub_teleport: activator wasn't a tracked melon, ignoring");
            return;
        }
        Debug(`hub_teleport: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} returning to hub (racing=${kart.racing}, phase=${phase})`);
        ReturnAllToHub([kart]);
    });
}
