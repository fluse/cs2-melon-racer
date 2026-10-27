// Running the map's spike springs (see world/spike-spring/constants.js): every
// tick each one's animation is kept in step with the shared clock, and while
// its spikes are out every melon over it breaks. The map is searched for
// springs every SPIKE_SPRING_SCAN_SECONDS, so one that spawned after the
// script's first look (or was respawned by a round restart) still joins.
import { Instance, Console } from "cs_script/point_script";
import { SPIKE_SPRING_CLASS, SPIKE_SPRING_SCAN_SECONDS } from "../../constants/index.js";
import { karts } from "../../core/kart-registry.js";
import { BreakKartNow } from "../../health/index.js";
import { ParseSpikeSpringName, SpikeSpringState, SpikeSpringInputs, IsOverSpikeSpring } from "./logic.js";

/** @typedef {import("cs_script/point_script").Entity} Entity */

/**
 * spike spring entity -> its config and the phase last applied to it.
 * @type {Map<Entity, { config: import("./logic.js").SpikeSpringConfig, phase: import("./logic.js").SpikeSpringPhase | undefined }>}
 */
export const spikeSprings = new Map();
let nextScanTime = -Infinity;
let lastError = "";

/** Forgets the springs, so the next update looks them up again (after a round restart). */
export function ResetSpikeSprings() {
    spikeSprings.clear();
    nextScanTime = -Infinity;
}

/** Adds springs not known yet, and says in the console when the set changed. */
function ScanSpikeSprings() {
    const added = [];
    for (const entity of Instance.FindEntitiesByClass(SPIKE_SPRING_CLASS)) {
        const name = entity.GetEntityName();
        const config = spikeSprings.has(entity) ? undefined : ParseSpikeSpringName(name);
        if (config) {
            spikeSprings.set(entity, { config, phase: undefined });
            added.push(`${name} (${config.down}s down, ${config.up}s up, offset ${config.offset}s)`);
        }
    }
    if (added.length) {
        Console.Log(`[melon_drive] spike springs: ${spikeSprings.size} running, new: ${added.join(", ")}`);
    }
}

/** Every tick: animations in step with the clock, melons on out spikes broken. @param {number} now */
export function UpdateSpikeSprings(now) {
    try {
        if (now >= nextScanTime) {
            nextScanTime = now + SPIKE_SPRING_SCAN_SECONDS;
            ScanSpikeSprings();
        }
        for (const [spring, state] of spikeSprings) {
            if (!spring.IsValid()) {
                spikeSprings.delete(spring);
                continue;
            }
            UpdateSpikeSpring(spring, state, now);
        }
    } catch (err) {
        // Said once per kind of error, not every tick (Think's own catch only logs with DEBUG on).
        if (String(err) !== lastError) {
            lastError = String(err);
            Console.Log(`[melon_drive] spike springs: ${err}`);
        }
    }
}

/**
 * @param {Entity} spring
 * @param {{ config: import("./logic.js").SpikeSpringConfig, phase: import("./logic.js").SpikeSpringPhase | undefined }} state
 * @param {number} now
 */
function UpdateSpikeSpring(spring, state, now) {
    const { phase, lethal } = SpikeSpringState(now, state.config);
    for (const [input, value] of SpikeSpringInputs(state.phase, phase)) {
        Instance.EntFireAtTarget({ target: spring, input, value });
    }
    state.phase = phase;
    if (!lethal) {
        return;
    }
    const origin = spring.GetAbsOrigin();
    const angles = spring.GetAbsAngles();
    for (const kart of karts.values()) {
        if (!kart.melon.IsValid()) {
            continue;
        }
        const p = kart.melon.GetAbsOrigin();
        if (IsOverSpikeSpring({ x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z }, angles)) {
            BreakKartNow(kart, `spike spring ${spring.GetEntityName()}`);
        }
    }
}
