import { Console } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { karts } from "../../core/kart-registry.js";
import { GrantXp } from "./level.js";
import { XP_CHEAT_COMMAND, XP_REASON_CHEAT } from "../../constants/index.js";

// For testing the leveling: `melon_give_xp <amount>` in the console (only
// with sv_cheats 1) gives every player on the map that many XP. Not a menu
// button — anyone can open the user menu's DEVELOPER pages, and the XP
// unlock skins.
export function RegisterLevelInputs() {
    Console.RegisterCheatCommand(XP_CHEAT_COMMAND, (args) => {
        const amount = Number(String(args).trim().split(/\s+/).pop());
        if (!(amount > 0)) {
            Debug(`${XP_CHEAT_COMMAND}: needs an amount, e.g. "${XP_CHEAT_COMMAND} 500"`);
            return;
        }
        for (const kart of karts.values()) {
            GrantXp(kart, amount, XP_REASON_CHEAT);
        }
    });
}
