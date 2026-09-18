import { Instance } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { GetTrackConfig, GetTrackOrder } from "./track-config.js";
import { karts } from "./kart-registry.js";
import { ShowHubModal, HideHubModal, GetSpeedHud } from "./hud.js";
import {
    RacePhase,
    COUNTDOWN_SECONDS,
    BREAK_SECONDS,
    RACE_SPAWN_LATERAL_SPACING,
    HUB_TRIGGER_NAME,
    TELEPORT_UP_OFFSET,
} from "./constants.js";

// --- Race flow: hub -> countdown -> racing -> break --------------------
// See GAMEPLAY.md's "Hub -> race -> next-track flow" for the full design.
// Lives here (not a separate point_script) because it's tightly coupled to
// the same per-kart state as checkpoints/laps (the `Kart` typedef in
// kart-registry.js, and checkpoints.js).

/** @type {typeof RacePhase[keyof typeof RacePhase]} */
export let phase = RacePhase.HUB;
/** Which track the current/last heat was run on — undefined while in HUB.
 * @type {number | undefined} */
export let activeTrackId = undefined;
/** GetGameTime() at which the current COUNTDOWN/BREAK phase should end. */
export let phaseEndTime = 0;

/**
 * Restores phase/activeTrackId/phaseEndTime from an OnScriptReload snapshot
 * (see index.js) — the counterpart write to these otherwise-internal `let`s
 * for the one caller outside this module that legitimately needs to set them.
 * @param {{ phase?: typeof RacePhase[keyof typeof RacePhase], activeTrackId?: number, phaseEndTime?: number } | undefined} snapshot
 */
export function RestoreRaceFlowSnapshot(snapshot) {
    if (!snapshot) {
        return;
    }
    phase = snapshot.phase ?? phase;
    activeTrackId = snapshot.activeTrackId;
    phaseEndTime = snapshot.phaseEndTime ?? phaseEndTime;
}

export function CurrentRacers() {
    return [...karts.values()].filter((kart) => kart.racing);
}

/** Track id after `activeTrackId` in race order, or undefined if it was the last one. */
export function NextTrackId() {
    if (activeTrackId === undefined) {
        return undefined;
    }
    const order = GetTrackOrder();
    const index = order.indexOf(activeTrackId);
    if (index === -1 || index + 1 >= order.length) {
        return undefined;
    }
    return order[index + 1];
}

// Clicking "Jetzt starten" pulls every kart *currently standing in the hub
// trigger* into the heat — not every connected player — matching the
// original request that players have to be on that trigger area to race.
export function TryStartRace() {
    if (phase !== RacePhase.HUB) {
        Debug("TryStartRace: ignored, a heat is already running");
        return;
    }
    const order = GetTrackOrder();
    if (order.length === 0) {
        Debug("TryStartRace: no track_start_* triggers found, ignoring");
        return;
    }
    const racers = [...karts.values()].filter((kart) => kart.inHub && kart.melon.IsValid());
    if (racers.length === 0) {
        Debug("TryStartRace: no karts currently in the hub trigger, ignoring");
        return;
    }
    for (const kart of racers) {
        kart.racing = true;
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        if (slot !== undefined) {
            HideHubModal(slot);
        }
    }
    Debug(`TryStartRace: starting heat on track ${order[0]} with ${racers.length} racer(s)`);
    BeginHeat(order[0]);
}

// Moderator-only: cuts a heat short from wherever it's at (COUNTDOWN,
// RACING, or BREAK) and sends everyone back to the hub, same as a normal
// heat ending — see "Moderator" in GAMEPLAY.md.
export function TryAbortRace() {
    if (phase === RacePhase.HUB) {
        Debug("TryAbortRace: ignored, no heat is running");
        return;
    }
    Debug(`TryAbortRace: moderator aborted the heat on track ${activeTrackId}`);
    ReturnAllToHub(CurrentRacers());
    phase = RacePhase.HUB;
    activeTrackId = undefined;
}

/** @param {number} trackId */
export function BeginHeat(trackId) {
    const config = GetTrackConfig()[trackId];
    const start = config && Instance.FindEntityByName(config.startEntityName);
    if (!start) {
        Debug(`BeginHeat: track ${trackId} has no track_start_* trigger, aborting heat back to HUB`);
        // Route through ReturnAllToHub, not a bare phase reset: callers
        // (TryStartRace, or the BREAK->next-heat transition) may already
        // have marked these karts racing/hidden their hub modal before
        // calling in here, and they'd otherwise be stranded with racing:true
        // and no hub UI, silently swept into whatever heat starts next.
        ReturnAllToHub(CurrentRacers());
        phase = RacePhase.HUB;
        activeTrackId = undefined;
        return;
    }
    activeTrackId = trackId;
    const origin = start.GetAbsOrigin();
    const angles = start.GetAbsAngles();
    const rad = (angles.yaw * Math.PI) / 180;
    // Perpendicular to the start line's facing, to line racers up side by side.
    const rightDir = { x: Math.sin(rad), y: -Math.cos(rad) };

    const racers = CurrentRacers();
    racers.forEach((kart, i) => {
        const lateral = (i - (racers.length - 1) / 2) * RACE_SPAWN_LATERAL_SPACING;
        kart.melon.Teleport({
            position: {
                x: origin.x + rightDir.x * lateral,
                y: origin.y + rightDir.y * lateral,
                z: origin.z + TELEPORT_UP_OFFSET,
            },
            angles,
            velocity: { x: 0, y: 0, z: 0 },
        });
        kart.lastVelocity = undefined;
        // trackId is set directly instead of waiting for the physical
        // checkpoint_<trackId>_1 trigger touch to report it, so the
        // checkpoint/lap panel is already visible ("0/N", lap "1/M") the
        // moment the countdown starts instead of popping in a tick later.
        // checkpointIndex stays at 0 though — the racer hasn't actually
        // reached checkpoint 1 yet, just spawned at/behind it — and only
        // ticks up to 1 once OnCheckpointTouched sees them cross it for
        // real.
        kart.trackId = trackId;
        kart.checkpointIndex = 0;
        kart.lapsCompleted = 0;
        kart.finished = false;
        kart.locked = true;
        kart.checkpointPosition = { x: origin.x, y: origin.y, z: origin.z + TELEPORT_UP_OFFSET };
        kart.checkpointAngles = angles;
    });

    phase = RacePhase.COUNTDOWN;
    phaseEndTime = Instance.GetGameTime() + COUNTDOWN_SECONDS;
    Debug(`BeginHeat: track ${trackId}, ${racers.length} racer(s), countdown started`);
}

/** A kart reached lapsToWin — park it (still locked) until the whole heat ends. */
/** @param {import("./kart-registry.js").Kart} kart */
export function FinishKart(kart) {
    kart.finished = true;
    kart.locked = true;
    Debug(`FinishKart: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} finished track ${activeTrackId}`);
}

/** @param {import("./kart-registry.js").Kart[]} returning */
export function ReturnAllToHub(returning) {
    const hub = Instance.FindEntityByName(HUB_TRIGGER_NAME);
    if (!hub) {
        Debug(`ReturnAllToHub: no entity named "${HUB_TRIGGER_NAME}" found`);
    }
    const hubOrigin = hub?.GetAbsOrigin();
    const hubAngles = hub?.GetAbsAngles();
    for (const kart of returning) {
        kart.racing = false;
        kart.finished = false;
        kart.locked = false;
        kart.inHub = true;
        if (hubOrigin) {
            kart.melon.Teleport({
                position: { x: hubOrigin.x, y: hubOrigin.y, z: hubOrigin.z + TELEPORT_UP_OFFSET },
                angles: hubAngles,
                velocity: { x: 0, y: 0, z: 0 },
            });
        }
        kart.lastVelocity = undefined;
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        if (slot === undefined) {
            continue;
        }
        // Both labels, since ReturnAllToHub can now be reached from any
        // non-HUB phase (a moderator abort can land mid-COUNTDOWN, not just
        // after a heat finishes normally in BREAK).
        GetSpeedHud()?.SetHasClassForPlayer(slot, "countdown_label", "Hidden", true);
        GetSpeedHud()?.SetHasClassForPlayer(slot, "break_label", "Hidden", true);
        ShowHubModal(slot, phase);
    }
}

/** Drives the COUNTDOWN/RACING/BREAK timers and transitions — called once per Think tick (see think.js). */
/** @param {number} now */
export function UpdateRaceFlow(now) {
    const hud = GetSpeedHud();

    if (phase === RacePhase.COUNTDOWN) {
        const racers = CurrentRacers();
        if (racers.length === 0) {
            // Everyone who was in this heat disconnected/despawned before it
            // even started — nothing left to count down for. Without this,
            // the countdown would still finish into RACING below and then
            // get permanently stuck there (see the RACING branch's own
            // "nobody left" check), bricking the race flow for everyone.
            Debug("UpdateRaceFlow: all racers left during countdown, aborting heat back to HUB");
            phase = RacePhase.HUB;
            activeTrackId = undefined;
            return;
        }
        const remaining = phaseEndTime - now;
        const display = remaining > 0 ? String(Math.ceil(remaining)) : "GO!";
        for (const kart of racers) {
            const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
            if (slot === undefined) {
                continue;
            }
            hud?.SetHasClassForPlayer(slot, "countdown_label", "Hidden", false);
            hud?.SetDialogVariableStringForPlayer(slot, "countdown_label", "countdown", display);
        }
        if (remaining <= 0) {
            for (const kart of racers) {
                kart.locked = false;
                const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
                if (slot !== undefined) {
                    hud?.SetHasClassForPlayer(slot, "countdown_label", "Hidden", true);
                }
            }
            phase = RacePhase.RACING;
            Debug(`UpdateRaceFlow: countdown finished for track ${activeTrackId}, GO`);
        }
        return;
    }

    if (phase === RacePhase.RACING) {
        const racers = CurrentRacers();
        if (racers.length === 0) {
            // Same "everyone left" case as COUNTDOWN above, but mid-race:
            // without this, an empty heat sits in RACING forever since
            // `racers.every(...)` on an empty array is vacuously true only
            // when length is also checked, and TryStartRace refuses to start
            // a new heat while phase isn't HUB.
            Debug("UpdateRaceFlow: all racers left mid-heat, aborting back to HUB");
            phase = RacePhase.HUB;
            activeTrackId = undefined;
            return;
        }
        if (racers.every((kart) => kart.finished)) {
            phase = RacePhase.BREAK;
            phaseEndTime = now + BREAK_SECONDS;
            const message = NextTrackId() !== undefined ? "Ziel!\nNächste Strecke in 10s…" : "Ziel!\nZurück zum Hub in 10s…";
            for (const kart of racers) {
                const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
                if (slot === undefined) {
                    continue;
                }
                hud?.SetHasClassForPlayer(slot, "break_label", "Hidden", false);
                hud?.SetDialogVariableStringForPlayer(slot, "break_label", "break", message);
            }
            Debug(`UpdateRaceFlow: heat on track ${activeTrackId} complete, break started`);
        }
        return;
    }

    if (phase === RacePhase.BREAK && now >= phaseEndTime) {
        const racers = CurrentRacers();
        const nextTrackId = NextTrackId();
        if (nextTrackId !== undefined) {
            for (const kart of racers) {
                const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
                if (slot !== undefined) {
                    hud?.SetHasClassForPlayer(slot, "break_label", "Hidden", true);
                }
            }
            BeginHeat(nextTrackId);
        } else {
            ReturnAllToHub(racers);
            phase = RacePhase.HUB;
            activeTrackId = undefined;
            Debug("UpdateRaceFlow: last track done, group returned to hub");
        }
    }
}
