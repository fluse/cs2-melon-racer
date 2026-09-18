import { Instance } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { START_TRIGGER_NAME_PATTERN } from "./constants.js";

// Per-track checkpoint/lap config comes straight from Hammer instead of a
// hand-maintained lookup: each track has one trigger_multiple named
// "track_start_<trackId>_cp<checkpointCount>_laps<lapsToWin>" (e.g.
// "track_start_1_cp8_laps3"). Its transform also doubles as where racers are
// teleported to start that track. Parsed once and cached — the geometry
// can't change without a full map reload anyway. Only the entity *name* is
// kept, not the entity handle itself: unlike Instance.FindEntityByName's
// handles, the ones yielded by FindEntitiesByClass's iterator below don't
// stay valid once the loop moves on, so resolving to a live entity happens
// at each point of use instead (see BeginHeat in race-flow.js).
/** @typedef {{ checkpoints: number, lapsToWin: number, startEntityName: string }} TrackConfig */
/** @type {Record<number, TrackConfig> | null} */
let trackConfigCache = null;

export function GetTrackConfig() {
    if (trackConfigCache) {
        return trackConfigCache;
    }
    /** @type {Record<number, TrackConfig>} */
    const config = {};
    for (const trigger of Instance.FindEntitiesByClass("trigger_multiple")) {
        const match = START_TRIGGER_NAME_PATTERN.exec(trigger.GetEntityName());
        if (!match) {
            continue;
        }
        config[Number(match[1])] = {
            checkpoints: Number(match[2]),
            lapsToWin: Number(match[3]),
            startEntityName: trigger.GetEntityName(),
        };
    }
    if (Object.keys(config).length === 0) {
        // Don't cache an empty result — entities may not have spawned yet.
        Debug("GetTrackConfig: no track_start_<id>_cp<N>_laps<M> triggers found yet");
        return config;
    }
    trackConfigCache = config;
    Debug(`GetTrackConfig: found track(s) ${JSON.stringify(Object.keys(config))}`);
    return config;
}

/** Track ids in race order (ascending), derived from whatever start triggers exist. */
export function GetTrackOrder() {
    return Object.keys(GetTrackConfig()).map(Number).sort((a, b) => a - b);
}
