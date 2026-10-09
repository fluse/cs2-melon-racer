import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { ParseSaveData } from "../race/time-trial/logic.js";
import { StartsInTutorial, WithStartsInTutorial } from "./join-spot-logic.js";
import { GetHubSpawnPoint, GetIntroSpawnPoint } from "./spawn-points.js";

// Where a joining player's melon appears: the tutorial (intro_spawn, the
// default) or straight in the hub — each player's own choice in the user
// menu ("Start in Tutorial"), kept per player name in the addon's save data
// (like the best times: the API has no stable player id). The rules are in
// kart/join-spot-logic.js.

/** @param {import("../core/kart-registry.js").Kart | { pawn: any }} kart */
function PlayerName(kart) {
    return kart.pawn.GetPlayerController()?.GetPlayerName() ?? "";
}

/** Whether this kart's player starts in the tutorial when joining. @param {import("../core/kart-registry.js").Kart} kart */
export function IsStartInTutorialOn(kart) {
    return StartsInTutorial(ParseSaveData(Instance.GetSaveData()), PlayerName(kart));
}

/**
 * Sets whether this kart's player starts in the tutorial next time they
 * join, and saves it. @param {import("../core/kart-registry.js").Kart} kart @param {boolean} on
 */
export function SetStartInTutorial(kart, on) {
    // Re-read so the best times and everyone else's settings survive.
    const data = WithStartsInTutorial(ParseSaveData(Instance.GetSaveData()), PlayerName(kart), on);
    Instance.SetSaveData(JSON.stringify(data));
    Debug(`SetStartInTutorial: "${PlayerName(kart)}" starts ${on ? "in the tutorial" : "in the hub"} on join`);
}

/**
 * Where a joining player's very first melon appears: intro_spawn (or the hub
 * without one) — or hub_spawn if they switched "Start in Tutorial" off (the
 * intro if the map has no hub_spawn).
 * @param {any} pawn
 */
export function GetJoinSpawnPoint(pawn) {
    if (StartsInTutorial(ParseSaveData(Instance.GetSaveData()), PlayerName({ pawn }))) {
        return GetIntroSpawnPoint();
    }
    return GetHubSpawnPoint() ?? GetIntroSpawnPoint();
}
