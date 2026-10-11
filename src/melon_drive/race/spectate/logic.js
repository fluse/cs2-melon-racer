// Pure rules of spectating (no engine calls) — see spectate.js.
import { RacePhase } from "../constants.js";
import { SPECTATE_AFTER_FINISH_SECONDS } from "./constants.js";

/**
 * Whether `phase` is part of a running Grand Prix — what a player outside it
 * can watch. @param {string} phase
 */
export function IsHeatPhase(phase) {
    return phase === RacePhase.COUNTDOWN || phase === RacePhase.RACING || phase === RacePhase.BREAK;
}

/**
 * Whether a player spectates right now, and as what:
 * "racer" — finished at least SPECTATE_AFTER_FINISH_SECONDS ago, while others
 * still drive this heat (the finish window, FINISH_GRACE_SECONDS);
 * "watcher" — not in the Grand Prix, watching it ("Watch Grand Prix"), for
 * as long as one runs; undefined — the own melon.
 * A racer who pressed R (`spectateDismissed`) stays on their own melon for
 * the rest of the heat.
 * @param {{ racing: boolean, finished: boolean, finishTime?: number, watching?: boolean, spectateDismissed?: boolean }} kart
 * @param {string} phase @param {number} now
 * @param {boolean} othersDriving another racer hasn't finished yet
 * @returns {"racer" | "watcher" | undefined}
 */
export function SpectateMode(kart, phase, now, othersDriving) {
    if (kart.watching && !kart.racing && IsHeatPhase(phase)) {
        return "watcher";
    }
    if (kart.racing && kart.finished && !kart.spectateDismissed && phase === RacePhase.RACING && othersDriving
        && now - (kart.finishTime ?? -Infinity) >= SPECTATE_AFTER_FINISH_SECONDS) {
        return "racer";
    }
    return undefined;
}

/**
 * Who can be watched, in the order "next" steps through them: the racers
 * still driving, most progress first (laps, then checkpoints), ties in the
 * order given. With nobody driving any more and `fallbackAll`, every racer
 * instead (a watcher during the countdown's line-up is covered by the
 * first rule, the break by this one).
 * @param {{ key: number, laps: number, checkpoint: number, finished: boolean }[]} racers
 * @param {boolean} fallbackAll
 * @returns {number[]} their keys
 */
export function SpectateCandidates(racers, fallbackAll) {
    const driving = racers.filter((racer) => !racer.finished);
    const pool = driving.length > 0 || !fallbackAll ? driving : racers;
    return pool
        .map((racer, index) => ({ racer, index }))
        .sort((a, b) => b.racer.laps - a.racer.laps || b.racer.checkpoint - a.racer.checkpoint || a.index - b.index)
        .map(({ racer }) => racer.key);
}

/**
 * The one to watch after stepping `direction` (1 next, -1 previous, 0 stay)
 * from `current` through `candidates`, wrapping around. A `current` no longer
 * among them (finished, out, gone) — or none yet — starts on the first, the
 * one furthest ahead. Undefined with nobody to watch.
 * @param {number[]} candidates see SpectateCandidates @param {number | undefined} current @param {number} direction
 * @returns {number | undefined}
 */
export function StepSpectateTarget(candidates, current, direction) {
    if (candidates.length === 0) {
        return undefined;
    }
    const index = current === undefined ? -1 : candidates.indexOf(current);
    if (index === -1) {
        return candidates[0];
    }
    return candidates[(index + direction + candidates.length) % candidates.length];
}
