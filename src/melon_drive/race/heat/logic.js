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
 * The digit images that show `value`: tens undefined below 10 (no leading
 * zero), at most two digits (above 99 shows 99).
 * @param {number} value
 * @returns {{ tens: number | undefined, ones: number }}
 */
export function CountdownDigits(value) {
    const clamped = Math.min(99, Math.max(0, Math.floor(value)));
    return { tens: clamped >= 10 ? Math.floor(clamped / 10) : undefined, ones: clamped % 10 };
}
