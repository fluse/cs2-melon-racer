// The tutorial stations' rules: what each step checks, moving on from step
// to step, the finished stations in the save data, and what the HUD card
// shows. Pure — tutorial/tutorial.js feeds it a snapshot of the kart every
// tick (TutorialSnapshot) and does the side effects.
import {
    TUTORIAL_STATIONS,
    TUTORIAL_READ_SECONDS,
    TUTORIAL_STEP_DONE_SECONDS,
    TUTORIAL_COMPLETE_HUD_SECONDS,
    TUTORIAL_MAX_STEPS,
    TUTORIAL_PROGRESS_SEGMENTS,
    TUTORIAL_STATION_NAME_PATTERN,
    TUTORIAL_GOAL_NAME_PATTERN,
    SAVE_DATA_TUTORIAL_KEY,
    BOUNCE_RATINGS,
} from "../constants/index.js";

/**
 * What the kart did and is doing this tick, built by tutorial/tutorial.js.
 * `events` are what happened since the last tick.
 * @typedef {{
 *   speed: number, health: number, maxHealth: number,
 *   inputs: Record<string, boolean>, // forward, back, left, right, jump, attack: held now
 *   viewYaw: number, // where the player looks (degrees)
 *   boosting: boolean, inHeal: boolean, momentumSteps: number,
 *   menuOpen: boolean, menuPage: string | undefined, skin: string, freeLook: boolean,
 *   events: { wallJump?: { rating: string | undefined }, bounce?: { rating: string, jump: number }, break?: string, goals: string[] },
 * }} TutorialSnapshot
 * Where a player is in the stations: the station they're in (undefined:
 * none), its step, that step's tally (StepProgress), when it was done, the
 * goals reached in the station so far, and the "STATION COMPLETE" message.
 * @typedef {{
 *   station: number | undefined, step: number, tally: Record<string, any>, progress: number, goals: string[],
 *   doneAt: number | undefined, complete: { station: number, until: number, firstTime: boolean } | undefined,
 * }} TutorialState
 */

/** @returns {TutorialState} */
export function NewTutorialState() {
    return { station: undefined, step: 0, tally: {}, progress: 0, goals: [], doneAt: undefined, complete: undefined };
}

/** @param {number | undefined} id */
export function StationById(id) {
    return TUTORIAL_STATIONS.find((s) => s.id === id);
}

/** The station id in a station trigger's name, or undefined. @param {string} name */
export function StationFromTriggerName(name) {
    const match = TUTORIAL_STATION_NAME_PATTERN.exec(name);
    return match && StationById(Number(match[1])) ? Number(match[1]) : undefined;
}

/** The station and goal in a goal trigger's name, or undefined. @param {string} name */
export function GoalFromTriggerName(name) {
    const match = TUTORIAL_GOAL_NAME_PATTERN.exec(name);
    return match ? { station: Number(match[1]), goal: match[2] } : undefined;
}

/** How good a rating is: 0 = the best (PERFECT). @param {string | undefined} label */
function RatingRank(label) {
    const i = BOUNCE_RATINGS.findIndex((r) => r.label === label);
    return i < 0 ? BOUNCE_RATINGS.length : i;
}

/** @param {string | undefined} label @param {string | undefined} min */
function AtLeast(label, min) {
    return min === undefined || RatingRank(label) <= RatingRank(min);
}

/**
 * How far a step is, 0..1, from this tick's snapshot. `tally` is the step's
 * own running count (kept from tick to tick, fresh for every step) — it's
 * changed in place. `dt` seconds since the last tick.
 * @param {import("./constants.js").TutorialCheck} check @param {Record<string, any>} tally
 * @param {TutorialSnapshot} snap @param {number} dt
 * @returns {number}
 */
export function StepProgress(check, tally, snap, dt) {
    switch (check.kind) {
        case "hold": {
            if (check.inputs.every((i) => snap.inputs[i]) && snap.speed >= (check.minSpeed ?? 0)) {
                tally.seconds = (tally.seconds ?? 0) + dt;
            }
            return Fraction(tally.seconds ?? 0, check.seconds);
        }
        case "each": {
            let sum = 0;
            for (const input of check.inputs) {
                if (snap.inputs[input] && snap.speed >= (check.minSpeed ?? 0)) {
                    tally[input] = (tally[input] ?? 0) + dt;
                }
                sum += Fraction(tally[input] ?? 0, check.seconds);
            }
            return sum / check.inputs.length;
        }
        case "turn": {
            // How far the view turned since last tick, the short way round.
            const turn = tally.lastYaw === undefined ? 0 : Math.abs(((snap.viewYaw - tally.lastYaw + 540) % 360) - 180);
            tally.lastYaw = snap.viewYaw;
            if (check.inputs.some((i) => snap.inputs[i]) && snap.speed >= (check.minSpeed ?? 0)) {
                tally.degrees = (tally.degrees ?? 0) + turn;
            }
            return Fraction(tally.degrees ?? 0, check.degrees);
        }
        case "goals": {
            tally.reached ??= [];
            for (const goal of snap.events.goals) {
                if (check.goals.includes(goal) && !tally.reached.includes(goal)) {
                    tally.reached.push(goal);
                }
            }
            return tally.reached.length / check.goals.length;
        }
        case "boost":
            if (snap.boosting) {
                tally.seconds = (tally.seconds ?? 0) + dt;
            }
            return Fraction(tally.seconds ?? 0, check.seconds);
        case "healthLost":
            tally.best = Math.max(tally.best ?? 0, Fraction(snap.maxHealth - snap.health, check.amount));
            return tally.best;
        case "healFull":
            return snap.inHeal ? Fraction(snap.health, snap.maxHealth) : 0;
        case "momentum":
            tally.best = Math.max(tally.best ?? 0, Fraction(snap.momentumSteps, check.steps));
            return tally.best;
        case "wallJump": {
            const jump = snap.events.wallJump;
            if (jump && AtLeast(jump.rating, check.minRating)) {
                tally.count = (tally.count ?? 0) + 1;
            }
            return Fraction(tally.count ?? 0, check.count);
        }
        case "bounce": {
            const bounce = snap.events.bounce;
            if (bounce && AtLeast(bounce.rating, check.minRating) && bounce.jump >= (check.minJump ?? 0)) {
                tally.count = (tally.count ?? 0) + 1;
            }
            return Fraction(tally.count ?? 0, check.count);
        }
        case "break":
            if (snap.events.break !== undefined && check.causes.includes(snap.events.break)) {
                tally.done = true;
            }
            return tally.done ? 1 : 0;
        case "menuOpen":
            return snap.menuOpen ? 1 : 0;
        case "menuRead":
            if (snap.menuOpen) {
                tally.seconds = (tally.seconds ?? 0) + dt;
            }
            return Fraction(tally.seconds ?? 0, check.seconds);
        case "menuPage":
            return snap.menuOpen && snap.menuPage === check.page ? 1 : 0;
        case "skin":
            tally.from ??= snap.skin;
            return snap.skin !== tally.from ? 1 : 0;
        case "drone":
            if (snap.freeLook) {
                tally.on = true;
            }
            return tally.on ? (snap.freeLook ? 0.5 : 1) : 0;
        case "read":
            tally.seconds = (tally.seconds ?? 0) + dt;
            return Fraction(tally.seconds, check.seconds ?? TUTORIAL_READ_SECONDS);
    }
    return 0;
}

/** @param {number} value @param {number} of */
function Fraction(value, of) {
    return of > 0 ? Math.max(0, Math.min(1, value / of)) : 1;
}

/**
 * Into station `id` (its trigger touched): from its first step, whether it
 * was finished before or not — a "STATION COMPLETE" still showing stays.
 * Driving back into the station it's already in changes nothing.
 * @param {TutorialState} state @param {number} id
 */
export function EnterStation(state, id) {
    if (state.station === id) {
        return;
    }
    state.station = id;
    state.step = 0;
    state.tally = {};
    state.progress = 0;
    state.goals = [];
    state.doneAt = undefined;
}

/** Out of station `id` (its trigger left). @param {TutorialState} state @param {number} id */
export function LeaveStation(state, id) {
    if (state.station === id) {
        state.station = undefined;
    }
}

/**
 * One tick in the station: checks the current step, moves on to the next
 * TUTORIAL_STEP_DONE_SECONDS after it's done, and after the last one leaves
 * the station finished. Returns the station id when it was just finished.
 * @param {TutorialState} state @param {TutorialSnapshot} snap @param {number} now @param {number} dt
 * @param {(id: number) => boolean} finishedBefore whether this player had finished that station before
 * @returns {number | undefined}
 */
export function StepTutorial(state, snap, now, dt, finishedBefore) {
    if (state.complete && now >= state.complete.until) {
        state.complete = undefined;
    }
    const station = StationById(state.station);
    if (!station) {
        return undefined;
    }
    const step = station.steps[state.step];
    if (!step) {
        return undefined;
    }
    // Goals count for the whole visit: a gate driven through while still on
    // an earlier step isn't lost (the way back to it may be long).
    state.goals ??= [];
    for (const goal of snap.events.goals) {
        if (!state.goals.includes(goal)) {
            state.goals.push(goal);
        }
    }
    if (state.doneAt === undefined) {
        state.progress = StepProgress(step.check, state.tally, { ...snap, events: { ...snap.events, goals: state.goals } }, dt);
        if (state.progress >= 1) {
            state.doneAt = now;
        }
        return undefined;
    }
    if (now - state.doneAt < TUTORIAL_STEP_DONE_SECONDS) {
        return undefined;
    }
    if (state.step + 1 < station.steps.length) {
        state.step += 1;
        state.tally = {};
        state.progress = 0;
        state.doneAt = undefined;
        return undefined;
    }
    // The last step: the station is done. Out of it until its trigger is entered again.
    state.complete = { station: station.id, until: now + TUTORIAL_COMPLETE_HUD_SECONDS, firstTime: !finishedBefore(station.id) };
    state.station = undefined;
    return station.id;
}

/**
 * Every player's finished stations from the save data: { [playerName]: number[] }.
 * @param {Record<string, any>} saveData parsed, see ParseSaveData
 * @returns {Record<string, number[]>}
 */
export function GetFinishedStations(saveData) {
    const raw = saveData[SAVE_DATA_TUTORIAL_KEY];
    /** @type {Record<string, number[]>} */
    const all = {};
    if (raw && typeof raw === "object") {
        for (const [name, list] of Object.entries(raw)) {
            if (Array.isArray(list)) {
                all[name] = list.filter((id) => typeof id === "number" && StationById(id));
            }
        }
    }
    return all;
}

/**
 * Adds station `id` to a player's finished ones. Returns whether it's new.
 * @param {Record<string, number[]>} finished @param {string} name @param {number} id
 */
export function MarkStationFinished(finished, name, id) {
    const list = finished[name] ?? [];
    if (list.includes(id)) {
        return false;
    }
    finished[name] = [...list, id].sort((a, b) => a - b);
    return true;
}

/**
 * What the HUD card shows (hud/tutorial-panel.js), or undefined to hide it:
 * the station's title and number, each step's text and state (done, the
 * current one, still to come), the current step's help, keys, diagram and
 * progress bar, the station row (done = finished before or just now) — or,
 * just after the last step, "STATION COMPLETE" with the next station to visit.
 * @param {TutorialState} state @param {number[]} finished this player's finished stations
 */
export function TutorialView(state, finished) {
    const stationRow = TUTORIAL_STATIONS.map((s) => ({
        id: s.id,
        done: finished.includes(s.id),
        current: s.id === (state.station ?? state.complete?.station),
    }));
    if (state.station === undefined && state.complete) {
        const next = TUTORIAL_STATIONS.find((s) => !finished.includes(s.id));
        const station = StationById(state.complete.station);
        return {
            complete: true,
            title: station?.title ?? "",
            kicker: `STATION ${state.complete.station} / ${TUTORIAL_STATIONS.length}`,
            message: next ? `NEXT: STATION ${next.id} · ${next.title}` : "ALL STATIONS DONE · OFF TO THE HUB!",
            firstTime: state.complete.firstTime,
            stationRow,
            steps: [],
            help: "",
            keys: [],
            diagram: undefined,
            segments: 0,
        };
    }
    const station = StationById(state.station);
    if (!station) {
        return undefined;
    }
    const step = station.steps[state.step];
    const done = state.doneAt !== undefined;
    return {
        complete: false,
        title: station.title,
        kicker: `STATION ${station.id} / ${TUTORIAL_STATIONS.length}`,
        message: "",
        firstTime: false,
        stationRow,
        steps: station.steps.slice(0, TUTORIAL_MAX_STEPS).map((s, i) => ({
            text: s.text,
            state: i < state.step || (i === state.step && done) ? "done" : i === state.step ? "current" : "todo",
        })),
        help: step?.help ?? "",
        keys: step?.keys ?? [],
        diagram: step?.diagram,
        segments: Math.round((done ? 1 : state.progress) * TUTORIAL_PROGRESS_SEGMENTS),
    };
}
