// Player lifecycle (reset, disconnect) and the paint triggers (melon_paint).
import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { karts, EnsureModerator, FindKartByMelon, DropKart } from "../core/kart-registry.js";
import { SetUpPlayerKart, ForgetIntroLogo } from "./spawn.js";
import { SetKartPaintColor } from "./look.js";
import { PAINT_TRIGGER_NAME_PATTERN } from "../constants/index.js";

export function RegisterKartInputs() {
    // A reset keeps an existing kart where it is and just re-attaches it to the
    // pawn. A player without one gets it from EnsurePlayerKarts (core/think.js):
    // the logo first, then a melon in the tutorial (intro_spawn).
    Instance.OnPlayerReset(({ player }) => {
        Debug(`OnPlayerReset: slot=${player.GetPlayerController()?.GetPlayerSlot()}`);
        SetUpPlayerKart(player, undefined);
    });

    Instance.OnPlayerDisconnect(({ playerSlot }) => {
        ForgetIntroLogo(playerSlot);
        const kart = karts.get(playerSlot);
        if (kart) {
            DropKart(playerSlot, kart);
        }
        // Promotes the next-oldest remaining player (Map preserves insertion
        // order) so there's always a moderator whenever anyone's still on the
        // map — see EnsureModerator's comment for why this can't just wait for
        // the next Think tick to notice.
        EnsureModerator();
    });

    // See PAINT_TRIGGER_NAME_PATTERN for the Hammer-side naming
    // convention — the color comes from the trigger's own name, not this
    // input's parameter, so any number of differently-colored triggers can
    // share this one handler.
    Instance.OnScriptInput("melon_paint", ({ caller, activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart || !caller) {
            Debug("melon_paint: activator wasn't a tracked melon, ignoring");
            return;
        }
        const match = PAINT_TRIGGER_NAME_PATTERN.exec(caller.GetEntityName());
        if (!match) {
            Debug(`melon_paint: trigger "${caller.GetEntityName()}" doesn't match paint_trigger_<r>_<g>_<b>, ignoring`);
            return;
        }
        const [, r, g, b] = match.map(Number);
        SetKartPaintColor(kart, { r, g, b, a: 255 });
        Debug(`melon_paint: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} painted (${r}, ${g}, ${b})`);
    });
}
