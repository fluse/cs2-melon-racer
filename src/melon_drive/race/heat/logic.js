// Pure rules of the heat flow (no engine calls) — see race-flow.js.

/**
 * The number the BREAK countdown under the FINISH image shows, `remaining`
 * seconds before the break ends: rounded, so it runs BREAK_SECONDS … 0 with
 * every number but the first and the last up for a full second (0 for the
 * break's last half second). Never below 0.
 * @param {number} remaining
 */
export function BreakCountdownValue(remaining) {
    return Math.max(0, Math.round(remaining));
}

/**
 * Which step of the pre-race countdown shows `remaining` seconds before GO:
 * 0 = "3", 1 = "2", 2 = "1", 3 = "GO" (at and after GO). Undefined above 3
 * seconds — there's no number for those (COUNTDOWN_SECONDS > 3 shows nothing
 * until 3).
 * @param {number} remaining
 * @returns {number | undefined}
 */
export function CountdownStep(remaining) {
    if (remaining <= 0) {
        return 3;
    }
    const seconds = Math.ceil(remaining);
    return seconds <= 3 ? 3 - seconds : undefined;
}

/**
 * What the countdown's number `index` (0 = "3" … 3 = "GO") does while step
 * `step` is showing: "In" — it's the current one, falling in from the top
 * and standing in the middle (GO instead grows from small to huge, fading
 * out); "Out" — the one before it, knocked down out of the picture by the
 * current one landing; undefined — not shown. GO doesn't fall in, so it
 * knocks nothing out: the 1 is simply gone when GO appears in its place.
 * @param {number} index @param {number | undefined} step see CountdownStep
 * @returns {"In" | "Out" | undefined}
 */
export function CountdownNumberState(index, step) {
    if (step === undefined) {
        return undefined;
    }
    if (index === step) {
        return "In";
    }
    return index === step - 1 && step < 3 ? "Out" : undefined;
}

/**
 * The break countdown's two number Labels take turns (the numbers change
 * every second, so there's no Label per number like the start countdown's):
 * `value` falls in on Label `value % 2` ("In"), and the other one — still
 * showing value + 1 — is knocked out ("Out"), but only if that was the
 * number shown just before (not on the first one).
 * @param {number} value the number now, see BreakCountdownValue
 * @param {number | undefined} previous the number shown before it, if any
 * @returns {{ in: number, out: number | undefined }} Label indexes, 0 or 1
 */
export function BreakCountdownLabels(value, previous) {
    return { in: value % 2, out: previous === value + 1 ? (value + 1) % 2 : undefined };
}

/**
 * Keeps track of when a racer last made progress (a new checkpoint or a
 * lap): returns `watch` unchanged while `checkpoint`/`laps` are the same as
 * it saw, else a fresh watch starting at `now`. Start one at GO with
 * `watch` undefined.
 * @param {{ checkpoint: number, laps: number, since: number } | undefined} watch
 * @param {number} checkpoint @param {number} laps @param {number} now
 */
export function WatchProgress(watch, checkpoint, laps, now) {
    if (watch && watch.checkpoint === checkpoint && watch.laps === laps) {
        return watch;
    }
    return { checkpoint, laps, since: now };
}

/**
 * Seconds a racer has left to make progress before they're out (DNF) — at
 * or below 0 they are. @param {{ since: number }} watch @param {number} now
 * @param {number} limit DNF_NO_PROGRESS_SECONDS
 */
export function DnfSecondsLeft(watch, now, limit) {
    return limit - (now - watch.since);
}

/**
 * What the racer's dnf_warning shows `left` seconds before they're out: the
 * whole seconds, rounded up (so it never shows 0 while still racing), only
 * within the last `warning` seconds — undefined before that.
 * @param {number} left see DnfSecondsLeft @param {number} warning DNF_WARNING_SECONDS
 */
export function DnfWarningValue(left, warning) {
    return left > 0 && left <= warning ? Math.ceil(left) : undefined;
}
