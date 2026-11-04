// The tutorial stations, engine side: which station a melon is in (its
// trigger's tutorial_enter/tutorial_leave), what it does each tick (a
// TutorialSnapshot for the rules in logic.js), the finished stations kept per
// player name in the save data, the XP for a station's first finish, and the
// respawn point moving to the station's tutorial_spawn_<id>.
import { Instance, CSInputs } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { ParseSaveData } from "../race/time-trial/logic.js";
import { GetBounceRating } from "../movement/wall-bounce/logic.js";
import { GetMelonSkin } from "../kart/skin.js";
import { PlayerName } from "../kart/join-spot.js";
import { GetNamedSpawnPoint } from "../kart/spawn-points.js";
import { GrantXp } from "../race/level/level.js";
import { NewTutorialState, EnterStation, LeaveStation, StepTutorial, GetFinishedStations, MarkStationFinished } from "./logic.js";
import {
    MELON_MAX_HEALTH,
    WALL_BOUNCE_PERFECT_JUMP_WINDOW,
    SAVE_DATA_TUTORIAL_KEY,
    TUTORIAL_SPAWN_NAME_PREFIX,
    XP_TUTORIAL_STATION,
    XP_REASON_TUTORIAL,
} from "../constants/index.js";

/** @typedef {import("../core/kart-registry.js").Kart} Kart */

// Every player's finished stations, read from the save data once.
/** @type {Record<string, number[]> | undefined} */
let finished = undefined;

function Finished() {
    finished ??= GetFinishedStations(ParseSaveData(Instance.GetSaveData()));
    return finished;
}

/** This kart's player's finished stations. @param {Kart} kart */
export function GetKartFinishedStations(kart) {
    return Finished()[PlayerName(kart)] ?? [];
}

/** @param {Kart} kart */
function State(kart) {
    kart.tutorial ??= NewTutorialState();
    return kart.tutorial;
}

/**
 * Into station `id`: its steps from the first, and its tutorial_spawn_<id>
 * the respawn point (not on a track: a race keeps its checkpoints).
 * @param {Kart} kart @param {number} id
 */
export function EnterTutorialStation(kart, id) {
    const state = State(kart);
    if (state.station === id) {
        return;
    }
    EnterStation(state, id);
    kart.tutorialSeen = undefined; // events from before the station don't count
    kart.tutorialGoals = [];
    const spawn = GetNamedSpawnPoint(`${TUTORIAL_SPAWN_NAME_PREFIX}${id}`);
    if (spawn && kart.trackId === undefined) {
        kart.checkpointPosition = spawn.position;
        kart.checkpointAngles = spawn.angles;
    }
    Debug(`tutorial: "${PlayerName(kart)}" in station ${id}${spawn ? "" : ` (no ${TUTORIAL_SPAWN_NAME_PREFIX}${id}: respawn point unchanged)`}`);
}

/** Out of station `id`. @param {Kart} kart @param {number} id */
export function LeaveTutorialStation(kart, id) {
    if (kart.tutorial) {
        LeaveStation(kart.tutorial, id);
    }
}

/** A goal of station `station` reached. @param {Kart} kart @param {number} station @param {string} goal */
export function ReachTutorialGoal(kart, station, goal) {
    if (kart.tutorial?.station === station) {
        (kart.tutorialGoals ??= []).push(goal);
    }
}

/**
 * This tick's snapshot of the kart for the rules (logic.js). The events —
 * a wall jump, a wall bounce, a break — are told from the times the kart
 * keeps, against the ones seen last tick (kart.tutorialSeen). A bounce counts
 * once its jump window has closed, so a jump just after the hit is in it.
 * @param {Kart} kart @param {number} now
 * @returns {import("./logic.js").TutorialSnapshot}
 */
function TutorialSnapshotOf(kart, now) {
    const seen = (kart.tutorialSeen ??= { wallJump: kart.lastWallJump?.time, bounce: kart.lastBounceTime, break: kart.lastBreak?.time });
    const pawn = kart.pawn;
    const velocity = kart.melon.GetAbsVelocity();
    /** @type {import("./logic.js").TutorialSnapshot["events"]} */
    const events = { goals: kart.tutorialGoals ?? [] };
    kart.tutorialGoals = [];

    const wallJumpTime = kart.lastWallJump?.time;
    if (wallJumpTime !== undefined && wallJumpTime !== seen.wallJump) {
        seen.wallJump = wallJumpTime;
        const rated = kart.lastBounceTime === wallJumpTime && kart.lastBounceInfo;
        events.wallJump = { rating: rated ? GetBounceRating(rated.angleFactor).label : undefined };
    }
    const bounceTime = kart.lastBounceTime;
    if (
        bounceTime !== undefined &&
        bounceTime !== seen.bounce &&
        bounceTime !== wallJumpTime &&
        now - bounceTime > WALL_BOUNCE_PERFECT_JUMP_WINDOW &&
        kart.lastBounceInfo
    ) {
        seen.bounce = bounceTime;
        events.bounce = { rating: GetBounceRating(kart.lastBounceInfo.angleFactor).label, jump: kart.lastBounceInfo.jumpFactor };
    }
    const breakTime = kart.lastBreak?.time;
    if (breakTime !== undefined && breakTime !== seen.break) {
        seen.break = breakTime;
        events.break = kart.lastBreak?.cause;
    }

    return {
        speed: Math.hypot(velocity.x, velocity.y),
        health: kart.health,
        maxHealth: MELON_MAX_HEALTH,
        inputs: {
            forward: pawn.IsInputPressed(CSInputs.FORWARD),
            back: pawn.IsInputPressed(CSInputs.BACK),
            left: pawn.IsInputPressed(CSInputs.LEFT),
            right: pawn.IsInputPressed(CSInputs.RIGHT),
            jump: pawn.IsInputPressed(CSInputs.JUMP),
            attack: pawn.IsInputPressed(CSInputs.ATTACK),
        },
        viewYaw: pawn.GetEyeAngles().yaw,
        boosting: Boolean(kart.attackBoosting),
        inHeal: (kart.healZones?.size ?? 0) > 0,
        momentumSteps: kart.momentum?.steps ?? 0,
        menuOpen: kart.userMenuOpen,
        menuPage: kart.userMenuPage,
        skin: GetMelonSkin(kart),
        freeLook: Boolean(kart.freeLook),
        events,
    };
}

/**
 * Per tick for every kart (core/think.js): checks the step of the station
 * it's in, and on a station's last step saves it as finished — with XP the
 * first time.
 * @param {Kart} kart @param {number} now @param {number} dt
 */
export function UpdateTutorial(kart, now, dt) {
    const state = kart.tutorial;
    if (!state || (state.station === undefined && !state.complete)) {
        return;
    }
    if (state.station === undefined) {
        StepTutorial(state, TutorialSnapshotOf(kart, now), now, dt, () => true); // only lets the "STATION COMPLETE" run out
        return;
    }
    const name = PlayerName(kart);
    const done = StepTutorial(state, TutorialSnapshotOf(kart, now), now, dt, (id) => (Finished()[name] ?? []).includes(id));
    if (done === undefined) {
        return;
    }
    if (MarkStationFinished(Finished(), name, done)) {
        const data = ParseSaveData(Instance.GetSaveData()); // re-read: keeps what other systems keep there
        data[SAVE_DATA_TUTORIAL_KEY] = Finished();
        Instance.SetSaveData(JSON.stringify(data));
        GrantXp(kart, XP_TUTORIAL_STATION, `${XP_REASON_TUTORIAL} STATION ${done}`);
    }
    Debug(`tutorial: "${name}" finished station ${done}`);
}
