import { Instance, CSInputs } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { GetTrackConfig, GetTrackOrder } from "../track-config.js";
import { karts } from "../../core/kart-registry.js";
import { GetSpeedHud } from "../../hud/layout.js";
import { HideHubModal } from "../../hud/hub-modal/hub-modal.js";
import {
    RacePhase,
    COUNTDOWN_SECONDS,
    GRAND_PRIX_GATHER_SECONDS,
    BREAK_SECONDS,
    FINISH_GRACE_SECONDS,
    GO_DISPLAY_SECONDS,
    RACE_SPAWN_LATERAL_SPACING,
    HEAT_POINTS,
    INTRO_LOGO_SECONDS,
    DNF_NO_PROGRESS_SECONDS,
    DNF_WARNING_SECONDS,
    HUD_RESEND_SECONDS,
    XP_REASON_HEAT,
} from "../../constants/index.js";
import { SetIntroLogoVisible } from "../../kart/spawn.js";
import { GetHubSpawnPoint, GetIntroSpawnPoint, GetJoinGrandPrixSpawnPoint, GetStartSpawnPoint, FacePlayerView } from "../../kart/spawn-points.js";
import { RestoreFullHealth } from "../../health/heal/index.js";
import { StartRun, CancelRun } from "../time-trial/time-trial.js";
import { BreakCountdownValue, BreakCountdownLabels, CountdownStep, CountdownNumberState, WatchProgress, DnfSecondsLeft, DnfWarningValue, GatherSecondsValue } from "./logic.js";
import { SetFreeLook } from "../../dev/free-look.js";
import { grandPrix, StartGrandPrix, StartGrandPrixHeat, RecordGrandPrixFinish, EndGrandPrix } from "../grand-prix/grand-prix.js";
import { PlaceOnPodium } from "../podium/podium.js";
import { GrantXp, GrantGrandPrixXp } from "../level/level.js";
import { HeatFinishXp } from "../level/logic.js";
import { OrdinalPlace } from "../grand-prix/logic.js";
import { StopSpectating } from "../spectate/index.js";

// --- Race flow: hub -> countdown -> racing -> break --------------------
// See GAMEPLAY.md's "Hub -> race -> next-track flow" for the full design.
// Lives here (not a separate point_script) because it's tightly coupled to
// the same per-kart state as checkpoints/laps (the `Kart` typedef in
// core/kart-registry.js, and race/checkpoints/checkpoints.js).

/** @type {typeof RacePhase[keyof typeof RacePhase]} */
export let phase = RacePhase.HUB;
/** Which track the current/last heat was run on — undefined while in HUB.
 * @type {number | undefined} */
export let activeTrackId = undefined;
/** GetGameTime() at which the current GATHERING/COUNTDOWN/BREAK phase should end. */
export let phaseEndTime = 0;
/** RACING: when the finish window closes — FINISH_GRACE_SECONDS after the
 * heat's first finisher; undefined before that. */
export let graceEndTime = undefined;

/** The countdown's numbers in countdown_panel (speedometer.xml), in order —
 * index = CountdownStep. Each gets "In" or "Out" (CountdownNumberState),
 * which plays its fall in / knock out animation (speedometer.css).
 */
const COUNTDOWN_NUMBER_IDS = ["count_3", "count_2", "count_1", "count_go"];

/** Number the BREAK countdown last sent to each slot — only re-sent when
 * it changes, each change being one number falling in.
 * @type {Map<number, number>} */
const breakCountdownShown = new Map();

/** The break countdown's two number Labels, taking turns — see BreakCountdownLabels. */
const BREAK_NUMBER_IDS = ["break_num_0", "break_num_1"];

/**
 * Shows `value` on one player's break_countdown like the start countdown:
 * it falls in, knocking out the number before it (see BreakCountdownLabels).
 * Hidden with `value` undefined.
 * @param {number} slot @param {number | undefined} value
 */
function SetBreakCountdown(slot, value) {
    const hud = GetSpeedHud();
    const previous = breakCountdownShown.get(slot);
    if (value === undefined) {
        breakCountdownShown.delete(slot);
    } else {
        breakCountdownShown.set(slot, value);
    }
    hud?.SetHasClassForPlayer(slot, "break_countdown", "Hidden", value === undefined);
    const labels = value === undefined ? undefined : BreakCountdownLabels(value, previous);
    BREAK_NUMBER_IDS.forEach((id, index) => {
        if (labels?.in === index) {
            hud?.SetDialogVariableStringForPlayer(slot, id, "n", String(value));
        }
        hud?.SetHasClassForPlayer(slot, id, "In", labels?.in === index);
        hud?.SetHasClassForPlayer(slot, id, "Out", labels?.out === index);
    });
}

/**
 * Restores phase/activeTrackId/phaseEndTime/graceEndTime from an OnScriptReload snapshot
 * (see index.js) — the counterpart write to these otherwise-internal `let`s
 * for the one caller outside this module that legitimately needs to set them.
 * @param {{ phase?: typeof RacePhase[keyof typeof RacePhase], activeTrackId?: number, phaseEndTime?: number, graceEndTime?: number } | undefined} snapshot
 */
export function RestoreRaceFlowSnapshot(snapshot) {
    if (!snapshot) {
        return;
    }
    phase = snapshot.phase ?? phase;
    activeTrackId = snapshot.activeTrackId;
    phaseEndTime = snapshot.phaseEndTime ?? phaseEndTime;
    graceEndTime = snapshot.graceEndTime;
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

/** Karts in the hub's start area right now — the ones a Grand Prix takes along. */
function KartsInStartArea() {
    return [...karts.values()].filter((kart) => (kart.inHub || kart.joinedGrandPrix) && kart.melon.IsValid());
}

/**
 * The hub's "Start Grand Prix" button: always GRAND_PRIX_GATHER_SECONDS
 * first (GATHERING, see UpdateGathering) — everyone outside the start area
 * is called to join, everyone in it sees the seconds — then the Grand Prix
 * starts with whoever stands in the start area.
 */
export function TryStartRace() {
    if (phase !== RacePhase.HUB) {
        Debug("TryStartRace: ignored, a Grand Prix is already starting or running");
        return;
    }
    if (GetTrackOrder().length === 0) {
        Debug("TryStartRace: no start_<id> triggers found, ignoring");
        return;
    }
    const inStartArea = KartsInStartArea();
    if (inStartArea.length === 0) {
        Debug("TryStartRace: no karts currently in the hub trigger, ignoring");
        return;
    }
    phase = RacePhase.GATHERING;
    gatherJoins = 0;
    phaseEndTime = Instance.GetGameTime() + GRAND_PRIX_GATHER_SECONDS;
    Debug(`TryStartRace: ${inStartArea.length} player(s) in the start area — the Grand Prix starts in ${GRAND_PRIX_GATHER_SECONDS}s`);
}

/** @param {import("../../core/kart-registry.js").Kart[]} racers */
function StartGrandPrixWith(racers) {
    const order = GetTrackOrder();
    for (const kart of racers) {
        kart.racing = true;
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        if (slot !== undefined) {
            HideHubModal(slot, kart);
        }
    }
    Debug(`StartGrandPrixWith: starting heat on track ${order[0]} with ${racers.length} racer(s)`);
    StartGrandPrix(racers, order.length);
    BeginHeat(order[0]);
}

/** How many melons R has sent to spawn_join_grandprix in this call — the next one's spot in the line. */
let gatherJoins = 0;

/**
 * R while the call to join is up (or its test preview): takes the melon out
 * of whatever it was doing, like the user menu's hub button, onto
 * spawn_join_grandprix (else hub_spawn), which becomes its respawn point —
 * each one there in this call a spot further along a line, alternating
 * sides, so they don't land on each other.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
function SendKartToJoinGrandPrix(kart) {
    SetFreeLook(kart, false);
    const spawn = GetJoinGrandPrixSpawnPoint();
    const k = gatherJoins++;
    const spot = k % 2 === 1 ? (k + 1) / 2 : -k / 2;
    SendKartsOutOfRace([kart], spawn && { position: LineUpPosition(spawn.position, spawn.angles, spot, 1), angles: spawn.angles }, "Grand Prix join spot");
}

/**
 * R while the call to join is up: to the start area (SendKartToJoinGrandPrix).
 * It counts as in the start area from now on, in case the time runs out
 * before its hub_enter arrives.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
function JoinGrandPrix(kart) {
    Debug(`JoinGrandPrix: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} joins the Grand Prix`);
    SendKartToJoinGrandPrix(kart);
    kart.joinedGrandPrix = true;
}

/**
 * GATHERING, every tick: everyone outside the start area sees the call to
 * join with the seconds left (grand_prix_call), and R takes them to the
 * hub; everyone in it sees the seconds in the hub window (hub_starting).
 * Each sent on change and again every HUD_RESEND_SECONDS.
 * @param {number} now
 */
function UpdateGathering(now) {
    const seconds = GatherSecondsValue(phaseEndTime - now);
    for (const kart of karts.values()) {
        const inStartArea = kart.inHub || Boolean(kart.joinedGrandPrix);
        if (!inStartArea && kart.grandPrixCall && kart.pawn.WasInputJustPressed(CSInputs.RELOAD)) {
            JoinGrandPrix(kart);
        }
        SetGatherHud(kart, kart.inHub || kart.joinedGrandPrix ? `hub:${seconds}` : `call:${seconds}`, now);
    }
}

/**
 * Shows one player's part of GATHERING — "call:<s>" the call to join,
 * "hub:<s>" the hub window's countdown, undefined neither.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {string | undefined} value @param {number} now
 */
function SetGatherHud(kart, value, now) {
    kart.grandPrixCall = value?.startsWith("call:") ?? false;
    if (value === kart.gatherShown && now < (kart.gatherResendAt ?? 0)) {
        return;
    }
    kart.gatherShown = value;
    kart.gatherResendAt = now + HUD_RESEND_SECONDS;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    const hud = GetSpeedHud();
    if (slot === undefined || !hud) {
        return;
    }
    const [where, seconds] = value?.split(":") ?? [];
    if (seconds !== undefined) {
        hud.SetDialogVariableStringForPlayer(slot, where === "call" ? "grand_prix_call" : "hub_starting", "seconds", seconds);
    }
    hud.SetHasClassForPlayer(slot, "grand_prix_call", "Hidden", where !== "call");
}

/** Ends GATHERING's HUD for everyone and forgets who pressed R. */
function EndGathering() {
    gatherJoins = 0;
    const now = Instance.GetGameTime();
    for (const kart of karts.values()) {
        kart.gatherResendAt = undefined;
        SetGatherHud(kart, undefined, now);
        kart.joinedGrandPrix = undefined;
    }
}

// Moderator-only: cuts a heat short from wherever it's at (COUNTDOWN,
// RACING, or BREAK) and sends everyone back to the hub, same as a normal
// heat ending — see "Moderator" in GAMEPLAY.md.
export function TryAbortRace() {
    if (phase === RacePhase.HUB) {
        Debug("TryAbortRace: ignored, no heat is running");
        return;
    }
    if (phase === RacePhase.GATHERING) {
        Debug("TryAbortRace: moderator cancelled the Grand Prix before it started");
        EndGathering();
        phase = RacePhase.HUB;
        return;
    }
    Debug(`TryAbortRace: moderator aborted the heat on track ${activeTrackId}`);
    EndGrandPrix(true);
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
        Debug(`BeginHeat: track ${trackId} has no start_${trackId} trigger, aborting heat back to HUB`);
        // Route through ReturnAllToHub, not a bare phase reset: callers
        // (TryStartRace, or the BREAK->next-heat transition) may already
        // have marked these karts racing/hidden their hub modal before
        // calling in here, and they'd otherwise be stranded with racing:true
        // and no hub UI, silently swept into whatever heat starts next.
        EndGrandPrix(true);
        ReturnAllToHub(CurrentRacers());
        phase = RacePhase.HUB;
        activeTrackId = undefined;
        return;
    }
    activeTrackId = trackId;
    StartGrandPrixHeat(trackId);
    // start_spawn_<trackId> if placed, else the nearest start_spawn, else the start trigger itself.
    const { position: center, angles } = GetStartSpawnPoint(trackId, start);

    const racers = CurrentRacers();
    racers.forEach((kart, i) => {
        const position = LineUpPosition(center, angles, i, racers.length);
        SetFreeLook(kart, false); // a racer flying around would miss the countdown in a frozen melon
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
        RestoreFullHealth(kart); // every heat starts on a whole melon
        kart.lastVelocity = undefined;
        kart.settled = false;
        kart.speedCap = undefined; // back to plain MAX_SPEED — no carrying a wall-bounce boost through a teleport
        kart.pendingBounce = undefined;
        // trackId is set directly instead of waiting for the physical
        // start_<trackId> trigger touch to report it, so the
        // checkpoint/lap panel is already visible ("0/N", lap "1/M") the
        // moment the countdown starts instead of popping in a tick later —
        // and crossing the start line after GO then changes nothing (see
        // ApplyStartTouch).
        kart.trackId = trackId;
        kart.checkpointIndex = 0;
        kart.lapsCompleted = 0;
        CancelRun(kart); // a free-roaming run doesn't carry into the heat — its clock starts at GO
        kart.finished = false;
        kart.finishTime = undefined;
        kart.timedOut = undefined;
        StopSpectating(kart); // a finished racer still watching the last heat
        kart.locked = true;
        kart.progressWatch = undefined; // the DNF clock starts at GO
        HideDnfWarning(kart);
        kart.podium = undefined; // off the podium into the next Grand Prix
        kart.catapult = undefined; // out of a catapult's bucket too
        EndTestPreview(kart); // the real countdown takes over its HUD
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
    graceEndTime = undefined;
    Debug(`BeginHeat: track ${trackId}, ${racers.length} racer(s), countdown started`);
}

/**
 * Shows or hides the big "FINISH" image (finish_image in speedometer.xml)
 * and the place under it ("1ST · +10 PTS", finish_place — set by FinishKart)
 * for one player. @param {number | undefined} slot @param {boolean} visible
 */
function SetFinishImageVisible(slot, visible) {
    if (slot !== undefined) {
        GetSpeedHud()?.SetHasClassForPlayer(slot, "finish_image", "Hidden", !visible);
        GetSpeedHud()?.SetHasClassForPlayer(slot, "finish_place", "Hidden", !visible);
    }
}

/** A kart reached lapsToWin — park it (still locked) until the whole heat ends. */
/** @param {import("../../core/kart-registry.js").Kart} kart */
export function FinishKart(kart) {
    kart.finished = true;
    kart.locked = true;
    kart.finishTime = Instance.GetGameTime();
    kart.spectateDismissed = undefined; // a new finish: spectating the others again (R leaves it)
    if (phase === RacePhase.RACING && graceEndTime === undefined) {
        // The heat's first finisher: the others have FINISH_GRACE_SECONDS left.
        graceEndTime = kart.finishTime + FINISH_GRACE_SECONDS;
        Debug(`FinishKart: first finish on track ${activeTrackId}, the finish window closes in ${FINISH_GRACE_SECONDS}s`);
    }
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    // The place this racer crossed the line in, and the Grand Prix points for it.
    const result = activeTrackId !== undefined ? RecordGrandPrixFinish(kart, activeTrackId) : undefined;
    if (slot !== undefined) {
        GetSpeedHud()?.SetDialogVariableStringForPlayer(slot, "finish_place", "place", result ? `${OrdinalPlace(result.place)}  ·  +${result.points} PTS` : "");
    }
    if (result) {
        GrantXp(kart, HeatFinishXp(result.place), `${XP_REASON_HEAT} ${OrdinalPlace(result.place)}`);
    }
    // Shown the moment this racer crosses the line, not only once the whole
    // heat is over — stays up through BREAK until the next heat/the hub.
    SetFinishImageVisible(slot, true);
    Debug(`FinishKart: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} finished track ${activeTrackId}`);
}

/**
 * The finish window closed before this racer finished: parked like a
 * finisher, but without a place or points for the heat ("TIME UP" where the
 * place would be, no FINISH image) — and still in the Grand Prix, for the
 * next heat. Its run's clock is dropped, no time saved.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
function TimeOutKart(kart) {
    kart.finished = true;
    kart.timedOut = true;
    kart.locked = true;
    kart.finishTime = Instance.GetGameTime();
    CancelRun(kart);
    HideDnfWarning(kart);
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        GetSpeedHud()?.SetDialogVariableStringForPlayer(slot, "finish_place", "place", "TIME UP  ·  NO POINTS");
        GetSpeedHud()?.SetHasClassForPlayer(slot, "finish_image", "Hidden", true);
        GetSpeedHud()?.SetHasClassForPlayer(slot, "finish_place", "Hidden", false);
    }
    Debug(`TimeOutKart: slot ${slot} didn't finish track ${activeTrackId} within the finish window — no points`);
}

/**
 * The finish window's seconds left (finish_grace, "FINISH CLOSES IN 27"),
 * for everyone in the heat and everyone watching it — hidden outside it.
 * Sent on change and again every HUD_RESEND_SECONDS.
 * @param {number} now
 */
function UpdateFinishGraceHud(now) {
    const open = phase === RacePhase.RACING && graceEndTime !== undefined;
    for (const kart of karts.values()) {
        const value = open && (kart.racing || kart.watching) ? Math.max(0, Math.ceil(graceEndTime - now)) : undefined;
        if (value === kart.graceShown && now < (kart.graceResendAt ?? 0)) {
            continue;
        }
        kart.graceShown = value;
        kart.graceResendAt = now + HUD_RESEND_SECONDS;
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        if (slot === undefined) {
            continue;
        }
        if (value !== undefined) {
            GetSpeedHud()?.SetDialogVariableStringForPlayer(slot, "finish_grace", "seconds", String(value));
        }
        GetSpeedHud()?.SetHasClassForPlayer(slot, "finish_grace", "Hidden", value === undefined);
    }
}

/** @param {import("../../core/kart-registry.js").Kart[]} returning */
export function ReturnAllToHub(returning) {
    SendKartsOutOfRace(returning, GetHubSpawnPoint(), "hub");
}

/**
 * The user menu's "Play Tutorial": same as the hub button (leaves a
 * running heat, respawn point moves along), just landing at intro_spawn —
 * or the hub, if the map has no intro_spawn.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function SendKartToTutorial(kart) {
    SendKartsOutOfRace([kart], GetIntroSpawnPoint(), "tutorial");
}

/**
 * Takes karts out of any heat and teleports them (lined up side by side)
 * to `spawn`, which also becomes their respawn point.
 * @param {import("../../core/kart-registry.js").Kart[]} returning
 * @param {import("../../kart/spawn-points.js").SpawnPoint | undefined} spawn where to put them
 * @param {string} label for the debug log
 */
function SendKartsOutOfRace(returning, spawn, label) {
    Debug(`SendKartsOutOfRace: sending ${returning.length} kart(s) to the ${label} at ${spawn ? JSON.stringify(spawn.position) : "nowhere (spawn entity missing)"}`);
    returning.forEach((kart, i) => {
        StopSpectating(kart); // back to the own melon, which is about to move
        kart.racing = false;
        kart.finished = false;
        kart.timedOut = undefined;
        kart.locked = false;
        kart.progressWatch = undefined;
        HideDnfWarning(kart);
        kart.podium = undefined; // the hub/tutorial button takes a melon down from the podium too
        kart.catapult = undefined; // and out of a catapult's bucket
        EndTestPreview(kart); // the melon is let go just above
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
        CancelRun(kart);
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
        // Arrives whole — hub/tutorial button, hub_teleport, a heat ending.
        RestoreFullHealth(kart);
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
        SetBreakCountdown(slot, undefined);
        SetFinishImageVisible(slot, false);
    });
}

/**
 * Shows one player's countdown `remaining` seconds before GO: the current
 * number falling in / standing, the one before it knocked out (see
 * CountdownNumberState). @param {number} slot @param {number} remaining
 */
function ShowCountdown(slot, remaining) {
    const hud = GetSpeedHud();
    const step = CountdownStep(remaining);
    hud?.SetHasClassForPlayer(slot, "countdown_panel", "Hidden", false);
    COUNTDOWN_NUMBER_IDS.forEach((id, index) => {
        const state = CountdownNumberState(index, step);
        hud?.SetHasClassForPlayer(slot, id, "In", state === "In");
        hud?.SetHasClassForPlayer(slot, id, "Out", state === "Out");
    });
}

/**
 * Developer (user menu "Test Countdown"): the heat's 3…2…1…GO for this one
 * player, without a heat — the melon is held where it is until GO, like on
 * the start grid. Doesn't touch the race phase or anyone else. Not for a
 * racer (their HUD belongs to the heat), a breaking melon or one already
 * playing a preview.
 * @param {import("../../core/kart-registry.js").Kart} kart
 * @returns {boolean} whether it started
 */
export function TestCountdown(kart) {
    if (kart.racing || kart.breaking || kart.testPreview) {
        return false;
    }
    kart.testPreview = { kind: "countdown", endTime: Instance.GetGameTime() + COUNTDOWN_SECONDS };
    kart.locked = true;
    return true;
}

/**
 * Developer (user menu "Test Finish"): what a racer sees on crossing the
 * finish of the last lap — the FINISH image, "1ST · +10 PTS" under it and the
 * BREAK countdown — for this one player, without a heat. Held in place
 * meanwhile, like a finished racer. Same limits as TestCountdown.
 * @param {import("../../core/kart-registry.js").Kart} kart
 * @returns {boolean} whether it started
 */
export function TestFinish(kart) {
    if (kart.racing || kart.breaking || kart.testPreview) {
        return false;
    }
    kart.testPreview = { kind: "finish", endTime: Instance.GetGameTime() + BREAK_SECONDS };
    kart.locked = true;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        GetSpeedHud()?.SetDialogVariableStringForPlayer(slot, "finish_place", "place", `${OrdinalPlace(1)}  ·  +${HEAT_POINTS[0]} PTS`);
        SetFinishImageVisible(slot, true);
        breakCountdownShown.delete(slot);
    }
    return true;
}

/**
 * Developer (user menu "Test Grand Prix Call"): the call to join a starting
 * Grand Prix that everyone outside the start area gets (UpdateGathering),
 * for this one player, without a Grand Prix — counting down
 * GRAND_PRIX_GATHER_SECONDS, R teleports to the hub like the real one. The
 * melon drives on meanwhile. Same limits as TestCountdown, and not while a
 * Grand Prix is starting or running.
 * @param {import("../../core/kart-registry.js").Kart} kart
 * @returns {boolean} whether it started
 */
export function TestGrandPrixCall(kart) {
    if (phase !== RacePhase.HUB || kart.racing || kart.breaking || kart.testPreview) {
        return false;
    }
    kart.testPreview = { kind: "call", endTime: Instance.GetGameTime() + GRAND_PRIX_GATHER_SECONDS };
    kart.gatherResendAt = undefined;
    return true;
}

/**
 * Developer (user menu "Test Intro"): the Melon Racer logo a player sees on
 * joining, for INTRO_LOGO_SECONDS, without rejoining — the melon held where
 * it is behind it. Same limits as TestCountdown.
 * @param {import("../../core/kart-registry.js").Kart} kart
 * @returns {boolean} whether it started
 */
export function TestIntro(kart) {
    if (kart.racing || kart.breaking || kart.testPreview) {
        return false;
    }
    kart.testPreview = { kind: "intro", endTime: Instance.GetGameTime() + INTRO_LOGO_SECONDS };
    kart.locked = true;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        SetIntroLogoVisible(slot, true);
    }
    return true;
}

/**
 * Stops a TestCountdown/TestFinish/TestIntro preview and hides whatever it
 * showed. Leaves kart.locked to the caller.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
function EndTestPreview(kart) {
    if (!kart.testPreview) {
        return;
    }
    kart.testPreview = undefined;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot === undefined) {
        return;
    }
    GetSpeedHud()?.SetHasClassForPlayer(slot, "countdown_panel", "Hidden", true);
    SetBreakCountdown(slot, undefined);
    SetFinishImageVisible(slot, false);
    SetIntroLogoVisible(slot, false);
    kart.gatherResendAt = undefined;
    SetGatherHud(kart, undefined, Instance.GetGameTime());
}

/**
 * Runs the TestCountdown/TestFinish/TestIntro previews: the same HUD as the
 * real COUNTDOWN (GO shown for GO_DISPLAY_SECONDS), BREAK and join, then
 * everything hidden again and the melon let go.
 * @param {number} now
 */
function UpdateTestPreviews(now) {
    for (const kart of karts.values()) {
        const preview = kart.testPreview;
        if (!preview) {
            continue;
        }
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        const remaining = preview.endTime - now;
        if (preview.kind === "countdown") {
            if (remaining <= 0 && kart.locked) {
                kart.locked = false; // GO
            }
            if (remaining > -GO_DISPLAY_SECONDS) {
                if (slot !== undefined) {
                    ShowCountdown(slot, remaining);
                }
                continue;
            }
        } else if (preview.kind === "call") {
            // A real Grand Prix starting takes the HUD over (UpdateGathering).
            if (remaining > 0 && phase === RacePhase.HUB) {
                if (kart.grandPrixCall && kart.pawn.WasInputJustPressed(CSInputs.RELOAD)) {
                    Debug(`TestGrandPrixCall: slot ${slot} pressed R, to the Grand Prix join spot`);
                    SendKartToJoinGrandPrix(kart); // ends the preview
                    gatherJoins = 0; // only a preview — the next starts the line again
                    continue;
                }
                SetGatherHud(kart, `call:${GatherSecondsValue(remaining)}`, now);
                continue;
            }
        } else if (preview.kind === "finish") {
            if (remaining > 0) {
                const value = BreakCountdownValue(remaining);
                if (slot !== undefined && breakCountdownShown.get(slot) !== value) {
                    SetBreakCountdown(slot, value);
                }
                continue;
            }
        } else if (remaining > 0) {
            continue; // intro: the logo stays up
        }
        EndTestPreview(kart);
        kart.locked = false;
    }
}

/**
 * The DNF rule (DNF_NO_PROGRESS_SECONDS): a racer who hasn't reached a new
 * checkpoint or counted a lap for that long since GO or their last one is
 * out — back to the hub like the user menu's "Exit Race", their Grand Prix
 * standings so far kept. So nobody can hold up a heat for the others by
 * stopping (or getting stuck); if every racer is out, the heat ends like
 * one everyone left. The last DNF_WARNING_SECONDS are counted down on
 * their HUD (dnf_warning). Finished racers are left alone.
 * @param {import("../../core/kart-registry.js").Kart[]} racers @param {number} now
 */
function UpdateDnf(racers, now) {
    for (const kart of racers) {
        if (kart.finished) {
            SetDnfWarning(kart, undefined, now);
            continue;
        }
        kart.progressWatch = WatchProgress(kart.progressWatch, kart.checkpointIndex, kart.lapsCompleted, now);
        const left = DnfSecondsLeft(kart.progressWatch, now, DNF_NO_PROGRESS_SECONDS);
        if (left <= 0) {
            Debug(`UpdateDnf: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} made no progress for ${DNF_NO_PROGRESS_SECONDS}s on track ${activeTrackId} — DNF, back to the hub`);
            ReturnAllToHub([kart]);
            continue;
        }
        SetDnfWarning(kart, DnfWarningValue(left, DNF_WARNING_SECONDS), now);
    }
}

/**
 * Shows `value` seconds on one racer's dnf_warning (hidden with undefined) —
 * sent on change, and again every HUD_RESEND_SECONDS.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {number | undefined} value @param {number} now
 */
function SetDnfWarning(kart, value, now) {
    if (value === kart.dnfShown && now < (kart.dnfResendAt ?? 0)) {
        return;
    }
    kart.dnfShown = value;
    kart.dnfResendAt = now + HUD_RESEND_SECONDS;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot === undefined) {
        return;
    }
    if (value !== undefined) {
        GetSpeedHud()?.SetDialogVariableStringForPlayer(slot, "dnf_warning", "dnf", String(value));
    }
    GetSpeedHud()?.SetHasClassForPlayer(slot, "dnf_warning", "Hidden", value === undefined);
}

/** Hides a racer's dnf_warning right away — a new heat, or out of the race. @param {import("../../core/kart-registry.js").Kart} kart */
function HideDnfWarning(kart) {
    kart.dnfResendAt = undefined;
    SetDnfWarning(kart, undefined, Instance.GetGameTime());
}

/** Drives the GATHERING/COUNTDOWN/RACING/BREAK timers and transitions — called once per Think tick (see core/think.js). */
/** @param {number} now */
export function UpdateRaceFlow(now) {
    UpdateTestPreviews(now);
    UpdateRacePhase(now);
    UpdateFinishGraceHud(now); // after this tick's transitions
}

/** @param {number} now */
function UpdateRacePhase(now) {
    const hud = GetSpeedHud();

    if (phase === RacePhase.GATHERING) {
        if (now < phaseEndTime) {
            UpdateGathering(now);
            return;
        }
        const racers = KartsInStartArea();
        EndGathering();
        phase = RacePhase.HUB;
        if (racers.length === 0) {
            Debug("UpdateRaceFlow: nobody in the start area when the call ran out, no Grand Prix");
            return;
        }
        StartGrandPrixWith(racers);
        return;
    }

    if (phase === RacePhase.COUNTDOWN) {
        const racers = CurrentRacers();
        if (racers.length === 0) {
            // Everyone who was in this heat disconnected/despawned before it
            // even started — nothing left to count down for. Without this,
            // the countdown would still finish into RACING below and then
            // get permanently stuck there (see the RACING branch's own
            // "nobody left" check), bricking the race flow for everyone.
            Debug("UpdateRaceFlow: all racers left during countdown, aborting heat back to HUB");
            EndGrandPrix(true);
            phase = RacePhase.HUB;
            activeTrackId = undefined;
            return;
        }
        const remaining = phaseEndTime - now;
        for (const kart of racers) {
            const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
            if (slot !== undefined) {
                ShowCountdown(slot, remaining);
            }
        }
        if (remaining <= 0) {
            for (const kart of racers) {
                kart.locked = false;
                StartRun(kart, now); // the heat's time trial clock
                kart.progressWatch = WatchProgress(undefined, kart.checkpointIndex, kart.lapsCompleted, now); // and the DNF one
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
        UpdateDnf(CurrentRacers(), now); // may send racers out — counted again below
        const racers = CurrentRacers();
        if (graceEndTime !== undefined && now >= graceEndTime) {
            for (const kart of racers) {
                if (!kart.finished) {
                    TimeOutKart(kart);
                }
            }
        }
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
            EndGrandPrix(true);
            phase = RacePhase.HUB;
            activeTrackId = undefined;
            return;
        }
        if (racers.every((kart) => kart.finished)) {
            phase = RacePhase.BREAK;
            graceEndTime = undefined;
            phaseEndTime = now + BREAK_SECONDS;
            // The countdown itself is drawn by the BREAK branch below, under
            // the finish_image FinishKart already shows.
            breakCountdownShown.clear();
            Debug(`UpdateRaceFlow: heat on track ${activeTrackId} complete, break started`);
        }
        return;
    }

    if (phase === RacePhase.BREAK && now < phaseEndTime) {
        // Counting down to the next track / the hub: BREAK_SECONDS … 0 in
        // number images under the finish image, re-sent only on change.
        const value = BreakCountdownValue(phaseEndTime - now);
        for (const kart of CurrentRacers()) {
            const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
            if (slot !== undefined && breakCountdownShown.get(slot) !== value) {
                SetBreakCountdown(slot, value);
            }
        }
        return;
    }

    if (phase === RacePhase.BREAK) {
        const racers = CurrentRacers();
        const nextTrackId = NextTrackId();
        if (nextTrackId !== undefined) {
            for (const kart of racers) {
                const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
                if (slot !== undefined) {
                    SetBreakCountdown(slot, undefined);
                }
            }
            BeginHeat(nextTrackId);
        } else {
            EndGrandPrix(false);
            GrantGrandPrixXp(grandPrix, racers);
            ReturnAllToHub(racers);
            // The top three go on from the hub spawn onto the podium.
            PlaceOnPodium(grandPrix, racers);
            phase = RacePhase.HUB;
            activeTrackId = undefined;
            Debug("UpdateRaceFlow: last track done, group returned to hub");
        }
    }
}
