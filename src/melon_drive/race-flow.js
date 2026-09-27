import { Instance } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { GetTrackConfig, GetTrackOrder } from "./track-config.js";
import { karts } from "./kart-registry.js";
import { HideHubModal, GetSpeedHud } from "./hud.js";
import {
    RacePhase,
    COUNTDOWN_SECONDS,
    BREAK_SECONDS,
    GO_DISPLAY_SECONDS,
    RACE_SPAWN_LATERAL_SPACING,
    TELEPORT_UP_OFFSET,
} from "./constants.js";
import { GetHubSpawnPoint, GetIntroSpawnPoint, Lifted, FacePlayerView } from "./spawn-points.js";

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

/** One class per countdown image on the HUD's countdown_panel (see
 * speedometer.xml/.css) — exactly one is set at a time. There's no image for
 * values above 3, so a COUNTDOWN_SECONDS > 3 shows nothing until 3.
 */
const COUNTDOWN_SHOW_CLASSES = ["Show3", "Show2", "Show1", "ShowGo"];

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
            HideHubModal(slot, kart);
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

/**
 * Spot `i` of `count` karts lined up side by side, centered on `center` and
 * perpendicular to `angles`' facing — so a group teleported together doesn't
 * spawn inside each other. Keeps `center`'s height as-is.
 * @param {{ x: number, y: number, z: number }} center @param {{ yaw: number }} angles @param {number} i @param {number} count
 */
function LineUpPosition(center, angles, i, count) {
    const rad = (angles.yaw * Math.PI) / 180;
    const lateral = (i - (count - 1) / 2) * RACE_SPAWN_LATERAL_SPACING;
    return {
        x: center.x + Math.sin(rad) * lateral,
        y: center.y - Math.cos(rad) * lateral,
        z: center.z,
    };
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
    // TELEPORT_UP_OFFSET: the start trigger's brush may be sunk into the floor.
    const center = Lifted(start.GetAbsOrigin(), TELEPORT_UP_OFFSET);
    const angles = start.GetAbsAngles();

    const racers = CurrentRacers();
    racers.forEach((kart, i) => {
        const position = LineUpPosition(center, angles, i, racers.length);
        // A melon destroyed mid-BREAK is still pending its respawn (see
        // HandleMelonLost) — skip the teleport rather than throw on a dead
        // entity; that respawn lands it at the checkpointPosition set below.
        if (kart.melon.IsValid()) {
            kart.melon.Teleport({
                position,
                angles,
                velocity: { x: 0, y: 0, z: 0 },
            });
        }
        kart.teleportGen = (kart.teleportGen ?? 0) + 1; // ?? 0: karts carried over a hot reload from before this field existed
        kart.lastVelocity = undefined;
        kart.settled = false;
        kart.speedCap = undefined; // back to plain MAX_SPEED — no carrying a wall-bounce boost through a teleport
        kart.pendingBounce = undefined;
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
        // Its own lined-up spot, not the start line's center — a respawn
        // before reaching checkpoint 1 (break, or the user menu's respawn
        // button during the countdown) would otherwise stack it on whoever
        // is standing in the middle.
        kart.checkpointPosition = position;
        kart.checkpointAngles = angles;
        FacePlayerView(kart.pawn, angles.yaw);
        SetFinishImageVisible(kart.pawn.GetPlayerController()?.GetPlayerSlot(), false);
    });

    phase = RacePhase.COUNTDOWN;
    phaseEndTime = Instance.GetGameTime() + COUNTDOWN_SECONDS;
    Debug(`BeginHeat: track ${trackId}, ${racers.length} racer(s), countdown started`);
}

/**
 * Shows or hides the big "FINISH" image (finish_image in speedometer.xml)
 * for one player. @param {number | undefined} slot @param {boolean} visible
 */
function SetFinishImageVisible(slot, visible) {
    if (slot !== undefined) {
        GetSpeedHud()?.SetHasClassForPlayer(slot, "finish_image", "Hidden", !visible);
    }
}

/** A kart reached lapsToWin — park it (still locked) until the whole heat ends. */
/** @param {import("./kart-registry.js").Kart} kart */
export function FinishKart(kart) {
    kart.finished = true;
    kart.locked = true;
    // Shown the moment this racer crosses the line, not only once the whole
    // heat is over — stays up through BREAK until the next heat/the hub.
    SetFinishImageVisible(kart.pawn.GetPlayerController()?.GetPlayerSlot(), true);
    Debug(`FinishKart: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} finished track ${activeTrackId}`);
}

/** @param {import("./kart-registry.js").Kart[]} returning */
export function ReturnAllToHub(returning) {
    SendKartsOutOfRace(returning, GetHubSpawnPoint(), "hub");
}

/**
 * The user menu's "Go to Tutorial": same as the hub button (leaves a
 * running heat, respawn point moves along), just landing at intro_spawn —
 * or the hub, if the map has no intro_spawn.
 * @param {import("./kart-registry.js").Kart} kart
 */
export function SendKartToTutorial(kart) {
    SendKartsOutOfRace([kart], GetIntroSpawnPoint(), "tutorial");
}

/**
 * Takes karts out of any heat and teleports them (lined up side by side)
 * to `spawn`, which also becomes their respawn point.
 * @param {import("./kart-registry.js").Kart[]} returning
 * @param {import("./spawn-points.js").SpawnPoint | undefined} spawn where to put them
 * @param {string} label for the debug log
 */
function SendKartsOutOfRace(returning, spawn, label) {
    Debug(`SendKartsOutOfRace: sending ${returning.length} kart(s) to the ${label} at ${spawn ? JSON.stringify(spawn.position) : "nowhere (spawn entity missing)"}`);
    returning.forEach((kart, i) => {
        kart.racing = false;
        kart.finished = false;
        kart.locked = false;
        // kart.inHub (and the hub modal) is deliberately left to the
        // hub_start_trigger's own hub_enter/hub_leave inputs: the teleport
        // below lands inside it and fires hub_enter from there. Forcing it
        // here left inHub stuck at true whenever the melon ended up outside
        // the trigger volume — hub_leave never fires for a trigger that was
        // never entered — and that kart then got pulled into the next heat
        // from anywhere on the map.
        // Leaving the heat also leaves its track: without this the HUD kept
        // showing the old track's checkpoint/lap panel in the hub, and a
        // break or the user menu's respawn button would send the kart right
        // back onto that track's last checkpoint.
        kart.trackId = undefined;
        kart.checkpointIndex = 0;
        kart.lapsCompleted = 0;
        if (spawn) {
            const spawnAngles = spawn.angles;
            const spawnPosition = LineUpPosition(spawn.position, spawnAngles, i, returning.length);
            kart.checkpointPosition = spawnPosition;
            kart.checkpointAngles = spawnAngles;
            FacePlayerView(kart.pawn, spawnAngles.yaw);
            // Same dead-melon guard as BeginHeat — its pending respawn lands
            // it at the checkpointPosition just set.
            if (kart.melon.IsValid()) {
                kart.melon.Teleport({
                    position: spawnPosition,
                    angles: spawnAngles,
                    velocity: { x: 0, y: 0, z: 0 },
                });
            }
        }
        kart.teleportGen = (kart.teleportGen ?? 0) + 1; // ?? 0: karts carried over a hot reload from before this field existed
        kart.lastVelocity = undefined;
        kart.settled = false;
        kart.speedCap = undefined; // back to plain MAX_SPEED — no carrying a wall-bounce boost through a teleport
        kart.pendingBounce = undefined;
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        if (slot === undefined) {
            return;
        }
        // Both labels, since ReturnAllToHub can now be reached from any
        // non-HUB phase (a moderator abort can land mid-COUNTDOWN, not just
        // after a heat finishes normally in BREAK).
        GetSpeedHud()?.SetHasClassForPlayer(slot, "countdown_panel", "Hidden", true);
        GetSpeedHud()?.SetHasClassForPlayer(slot, "break_label", "Hidden", true);
        SetFinishImageVisible(slot, false);
    });
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
        const showClass = remaining > 0 ? `Show${Math.ceil(remaining)}` : "ShowGo";
        for (const kart of racers) {
            const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
            if (slot === undefined) {
                continue;
            }
            hud?.SetHasClassForPlayer(slot, "countdown_panel", "Hidden", false);
            for (const cls of COUNTDOWN_SHOW_CLASSES) {
                hud?.SetHasClassForPlayer(slot, "countdown_panel", cls, cls === showClass);
            }
        }
        if (remaining <= 0) {
            for (const kart of racers) {
                kart.locked = false;
            }
            // The "GO" image just shown above stays up for GO_DISPLAY_SECONDS —
            // hiding it in this same tick meant it was never actually seen.
            // RACING reuses phaseEndTime as the moment to hide it.
            phase = RacePhase.RACING;
            phaseEndTime = now + GO_DISPLAY_SECONDS;
            Debug(`UpdateRaceFlow: countdown finished for track ${activeTrackId}, GO`);
        }
        return;
    }

    if (phase === RacePhase.RACING) {
        const racers = CurrentRacers();
        if (now >= phaseEndTime) {
            for (const kart of racers) {
                const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
                if (slot !== undefined) {
                    hud?.SetHasClassForPlayer(slot, "countdown_panel", "Hidden", true);
                }
            }
            phaseEndTime = Infinity; // hidden — don't re-hide every tick
        }
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
            // "Ziel!" itself is the finish_image FinishKart already shows; this is just the line under it.
            const message = NextTrackId() !== undefined ? `Nächste Strecke in ${BREAK_SECONDS}s…` : `Zurück zum Hub in ${BREAK_SECONDS}s…`;
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
