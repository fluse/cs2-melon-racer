import { Instance } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { START_TRIGGER_NAME_PATTERN, CHECKPOINT_TRIGGER_NAME_PATTERN, DEFAULT_LAPS_TO_WIN } from "./constants/index.js";

// Per-track config comes straight from Hammer instead of a hand-maintained
// lookup: each track has one trigger_multiple named "start_<trackId>" or
// "start_<trackId>_laps<lapsToWin>" (e.g. "start_1_laps3"; without _laps
// it's DEFAULT_LAPS_TO_WIN), and its checkpoint count is however many
// "checkpoint_<trackId>_<index>" triggers the map has (the highest index —
// they must run 1..N without gaps, or finish_<trackId> can never be
// reached; a gap is logged). The start trigger's transform also doubles as
// where racers are teleported to start that track. Parsed once and cached —
// the geometry can't change without a full map reload anyway. Only the
// entity *name* is kept, not the entity handle itself: unlike
// Instance.FindEntityByName's handles, the ones yielded by
// FindEntitiesByClass's iterator below don't stay valid once the loop moves
// on, so resolving to a live entity happens at each point of use instead
// (see BeginHeat in race-flow.js).
/** @typedef {{ checkpoints: number, lapsToWin: number, startEntityName: string }} TrackConfig */
/** @type {Record<number, TrackConfig> | null} */
let trackConfigCache = null;
// When no start triggers are found yet, the result isn't cached (see below),
// and GetTrackConfig is called per kart every tick by the HUD — so without
// this, a map with no tracks rescanned every trigger_multiple (and logged
// about it) several times per tick. Retry at most once a second instead.
const EMPTY_RESCAN_INTERVAL = 1; // seconds
let lastEmptyScanTime = -Infinity;

export function GetTrackConfig() {
    if (trackConfigCache) {
        return trackConfigCache;
    }
    const now = Instance.GetGameTime();
    if (now - lastEmptyScanTime < EMPTY_RESCAN_INTERVAL) {
        return {};
    }
    /** @type {Record<number, TrackConfig>} */
    const config = {};
    /** @type {Map<number, Set<number>>} checkpoint indices found per track */
    const checkpointIndices = new Map();
    for (const trigger of Instance.FindEntitiesByClass("trigger_multiple")) {
        const name = trigger.GetEntityName();
        const start = START_TRIGGER_NAME_PATTERN.exec(name);
        if (start) {
            config[Number(start[1])] = {
                checkpoints: 0, // counted below
                lapsToWin: start[2] !== undefined ? Number(start[2]) : DEFAULT_LAPS_TO_WIN,
                startEntityName: name,
            };
            continue;
        }
        const checkpoint = CHECKPOINT_TRIGGER_NAME_PATTERN.exec(name);
        if (checkpoint) {
            const trackId = Number(checkpoint[1]);
            if (!checkpointIndices.has(trackId)) {
                checkpointIndices.set(trackId, new Set());
            }
            checkpointIndices.get(trackId)?.add(Number(checkpoint[2]));
        }
    }
    if (Object.keys(config).length === 0) {
        // Don't cache an empty result — entities may not have spawned yet.
        lastEmptyScanTime = now;
        Debug("GetTrackConfig: no start_<id> triggers found yet");
        return config;
    }
    for (const [trackId, track] of Object.entries(config)) {
        const indices = checkpointIndices.get(Number(trackId)) ?? new Set();
        track.checkpoints = indices.size > 0 ? Math.max(...indices) : 0;
        for (let i = 1; i <= track.checkpoints; i++) {
            if (!indices.has(i)) {
                Debug(`GetTrackConfig: track ${trackId} has checkpoint_${trackId}_${track.checkpoints} but no checkpoint_${trackId}_${i} — its finish can never be reached`);
            }
        }
    }
    trackConfigCache = config;
    Debug(`GetTrackConfig: found track(s) ${JSON.stringify(config)}`);
    return config;
}

/** Track ids in race order (ascending), derived from whatever start triggers exist. */
export function GetTrackOrder() {
    return Object.keys(GetTrackConfig()).map(Number).sort((a, b) => a - b);
}
