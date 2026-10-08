import { Instance } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { GetPodiumSpawnPoint, FacePlayerView } from "../../kart/spawn-points.js";
import { PODIUM_HOLD_SECONDS, PODIUM_CONFETTI_NAME } from "../../constants/index.js";
import { SortedStandings } from "../grand-prix/logic.js";
import { PlayerKey } from "../grand-prix/grand-prix.js";
import { PodiumPlaces } from "./logic.js";

// The podium in the hub: once a Grand Prix has run to its last track and the
// group is back in the hub (race/heat/race-flow.js), the top three are moved
// on from hub_spawn onto their podium_spawn_<place> and held there for
// PODIUM_HOLD_SECONDS — jumping and looking around, no driving (the hold
// itself is in movement/driving/drive.js). Their respawn point stays the
// hub, so the hub/tutorial/respawn buttons take them down at once.

/**
 * Puts the top three of `gp` among `racers` (already sent to the hub) on
 * the podium. Nothing for a cancelled Grand Prix.
 * @param {import("../grand-prix/logic.js").GrandPrix | undefined} gp
 * @param {import("../../core/kart-registry.js").Kart[]} racers
 */
export function PlaceOnPodium(gp, racers) {
    if (!gp || gp.cancelled) {
        return;
    }
    const byKey = new Map(racers.map((kart) => [PlayerKey(kart), kart]));
    const places = PodiumPlaces(SortedStandings(gp).map((s) => s.key), new Set(byKey.keys()));
    const now = Instance.GetGameTime();
    let placed = 0;
    for (const [key, place] of places) {
        const kart = byKey.get(key);
        const spawn = GetPodiumSpawnPoint(place);
        if (!kart || !spawn) {
            Debug(`PlaceOnPodium: place ${place} stays at the hub spawn${spawn ? "" : " (no podium_spawn_" + place + " in the map)"}`);
            continue;
        }
        // A melon still waiting for its respawn (broken in the last BREAK)
        // isn't moved — it comes back at the hub.
        if (!kart.melon.IsValid() || kart.breaking) {
            continue;
        }
        kart.melon.Teleport({ position: spawn.position, angles: spawn.angles, velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } });
        FacePlayerView(kart.pawn, spawn.angles.yaw);
        kart.lastVelocity = undefined;
        kart.settled = false;
        kart.podium = { place, spot: spawn.position, until: now + PODIUM_HOLD_SECONDS };
        placed++;
        Debug(`PlaceOnPodium: "${kart.pawn.GetPlayerController()?.GetPlayerName()}" on place ${place}`);
    }
    if (placed > 0) {
        PlayConfetti();
    }
}

/**
 * The confetti over the podium (PODIUM_CONFETTI_NAME, if placed): on now,
 * off when the hold ends. Stop first, so a system still running restarts.
 */
function PlayConfetti() {
    Instance.EntFireAtName({ name: PODIUM_CONFETTI_NAME, input: "Stop" });
    Instance.EntFireAtName({ name: PODIUM_CONFETTI_NAME, input: "Start" });
    Instance.EntFireAtName({ name: PODIUM_CONFETTI_NAME, input: "Stop", delay: PODIUM_HOLD_SECONDS });
}
