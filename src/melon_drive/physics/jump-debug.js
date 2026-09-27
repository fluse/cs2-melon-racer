// Jump debug view: everything that shows how ground/wall contact and jump
// presses are judged — the on-screen status line, the probes drawn into the
// world, and the "Jump pressed" console log. Toggled per player from the
// user menu (kart.jumpDebug, see SetJumpDebug); off by default. The contact
// code in contact.js/drive.js/jump.js only hands its results to the
// Record*/Log*/Draw* functions here, so none of this lives in the gameplay
// code itself. Debug draws only show in dev environments (tools mode).
import { Instance } from "cs_script/point_script";
import { WALL_CONTACT_DISTANCE, WALL_JUMP_WINDOW } from "../constants.js";

/**
 * What this tick's probes saw. Rebuilt every tick (while the view is on)
 * by the Record* functions below.
 * @typedef {"miss" | "ignored" | "far" | "near" | "chosen"} ProbeState
 * @typedef {{
 *   origin: any,
 *   support: string,
 *   floorEnd: any, floorHit: boolean, floorOk: boolean, floorText: string,
 *   probes: { end: any, state: ProbeState }[],
 *   wallText: string,
 *   wall?: { point: any, normal: { x: number, y: number }, commanded?: any, actual: any, touching: boolean },
 * }} ContactDebug
 */

/** @param {import("../kart-registry.js").Kart} kart */
export function IsJumpDebugOn(kart) {
    return Boolean(kart.jumpDebug);
}

/** Turns the view on/off for this kart's player. @param {import("../kart-registry.js").Kart} kart @param {boolean} on */
export function SetJumpDebug(kart, on) {
    kart.jumpDebug = on;
    if (!on) {
        kart.contactDebug = undefined;
    }
}

/**
 * Start of a tick's record: the measured support and the floor trace.
 * @param {import("../kart-registry.js").Kart} kart @param {any} origin
 * @param {boolean} supported @param {number | undefined} verticalAccel
 * @param {any} trace the floor TraceLine result @param {boolean} grounded
 */
export function RecordFloorProbe(kart, origin, supported, verticalAccel, trace, grounded) {
    if (!IsJumpDebugOn(kart)) {
        return;
    }
    const floorHit = trace.didHit && !trace.startedInSolid;
    kart.contactDebug = {
        origin,
        support: `supported=${supported}, az=${verticalAccel === undefined ? "—" : verticalAccel.toFixed(0)}`,
        floorEnd: trace.end,
        floorHit,
        floorOk: grounded,
        floorText: trace.startedInSolid
            ? "started in solid"
            : floorHit
              ? `hit ${(origin.z - trace.end.z).toFixed(1)} below, normal z ${trace.normal.z.toFixed(2)}`
              : "nothing",
        probes: [],
        wallText: "—",
    };
}

/**
 * The wall probes (in the air only) and, if one was near enough, the
 * physics check on it.
 * @param {import("../kart-registry.js").Kart} kart
 * @param {{ end: any, state: ProbeState }[]} probes
 * @param {{ point: any, normal: { x: number, y: number }, commanded?: any, actual: any, touching: boolean }} [wall]
 */
export function RecordWallProbes(kart, probes, wall) {
    const d = kart.contactDebug;
    if (!IsJumpDebugOn(kart) || !d) {
        return;
    }
    d.probes = probes;
    d.wall = wall;
    if (!wall) {
        d.wallText = "no wall";
        return;
    }
    /** @param {{ x: number, y: number }} v */
    const into = (v) => -(v.x * wall.normal.x + v.y * wall.normal.y);
    d.wallText = wall.commanded
        ? `near, into ${into(wall.commanded).toFixed(0)} -> ${into(wall.actual).toFixed(0)}${wall.touching ? " TOUCH" : ""}`
        : "near, no command to compare";
}

/**
 * Console log of a jump press: why it was (or wasn't) allowed.
 * @param {number} slot @param {import("../kart-registry.js").Kart} kart @param {number} now
 * @param {boolean} grounded @param {boolean} groundJump @param {boolean} timingPress
 */
export function LogJumpPress(slot, kart, now, grounded, groundJump, timingPress) {
    if (!IsJumpDebugOn(kart)) {
        return;
    }
    const d = kart.contactDebug;
    const groundAge = kart.lastGroundedTime === undefined ? "never" : `${(now - kart.lastGroundedTime).toFixed(3)}s ago`;
    const wallAge = kart.lastWallContact === undefined ? "never" : `${(now - kart.lastWallContact.time).toFixed(3)}s ago`;
    Instance.Msg(
        `[jump debug] slot ${slot} jump pressed: grounded=${grounded} groundJump=${groundJump} ` +
            `(ground contact ${groundAge}, ${d?.support ?? "—"}, floor: ${d?.floorText ?? "—"}) ` +
            `wall contact ${wallAge} (${d?.wallText ?? "—"}) wallCharge=${(kart.wallJumpCharge ?? 1).toFixed(2)} wallTiming=${timingPress}`
    );
}

// Colors — see the legend in GAMEPLAY.md's "Jumping".
const COLOR_MISS = { r: 110, g: 110, b: 110 };
const COLOR_IGNORED = { r: 170, g: 80, b: 200 };
const COLOR_FAR = { r: 80, g: 120, b: 200 };
const COLOR_NEAR = { r: 60, g: 220, b: 230 };
const COLOR_CHOSEN = { r: 255, g: 180, b: 60 };
const COLOR_TOUCH = { r: 60, g: 255, b: 60 };
const COLOR_COMMANDED = { r: 255, g: 70, b: 70 };
const COLOR_ACTUAL = { r: 80, g: 140, b: 255 };
const COLOR_RING = { r: 90, g: 90, b: 90 };
const COLOR_WHITE = { r: 255, g: 255, b: 255 };
const PROBE_COLORS = { miss: COLOR_MISS, ignored: COLOR_IGNORED, far: COLOR_FAR, near: COLOR_NEAR, chosen: COLOR_CHOSEN };
const VELOCITY_DRAW_SCALE = 0.15; // units of line per unit/sec
const RING_SEGMENTS = 24;
const JUMPABLE_RING_RADIUS = 24;

/** @param {any} start @param {any} end @param {{ r: number, g: number, b: number }} color */
function Line(start, end, color) {
    Instance.DebugLine({ start, end, duration: 0, color });
}

/** @param {any} center @param {number} radius @param {{ r: number, g: number, b: number }} color */
function Circle(center, radius, color) {
    for (let i = 0; i < RING_SEGMENTS; i++) {
        const a0 = (i / RING_SEGMENTS) * Math.PI * 2;
        const a1 = ((i + 1) / RING_SEGMENTS) * Math.PI * 2;
        Line(
            { x: center.x + Math.cos(a0) * radius, y: center.y + Math.sin(a0) * radius, z: center.z },
            { x: center.x + Math.cos(a1) * radius, y: center.y + Math.sin(a1) * radius, z: center.z },
            color
        );
    }
}

/**
 * A horizontal velocity as a line from `from`, VELOCITY_DRAW_SCALE long per unit/sec.
 * @param {any} from @param {{ x: number, y: number }} v @param {{ r: number, g: number, b: number }} color @param {number} dz
 */
function Velocity(from, v, color, dz) {
    const start = { x: from.x, y: from.y, z: from.z + dz };
    Line(start, { x: start.x + v.x * VELOCITY_DRAW_SCALE, y: start.y + v.y * VELOCITY_DRAW_SCALE, z: start.z }, color);
}

/**
 * Draws this tick's record: the status line on screen, and in the world
 * the floor trace, the WALL_CONTACT_DISTANCE search ring, every wall probe
 * colored by what it hit, and at the chosen wall the commanded vs. actual
 * velocity that decide "touching".
 * @param {number} slot @param {import("../kart-registry.js").Kart} kart @param {boolean} grounded @param {{ x: number, y: number } | undefined} wallNormal
 */
export function DrawJumpDebug(slot, kart, grounded, wallNormal) {
    const d = kart.contactDebug;
    if (!IsJumpDebugOn(kart) || !d) {
        return;
    }
    Instance.DebugScreenText({
        text: `slot ${slot}: ${grounded ? "GROUND" : "AIR"}${wallNormal ? " + WALL" : ""}  (${d.support}, floor: ${d.floorText}, wall: ${d.wallText})`,
        x: 20,
        y: 200 + slot * 16,
        duration: 0,
        color: grounded ? { r: 90, g: 220, b: 90 } : wallNormal ? COLOR_CHOSEN : COLOR_WHITE,
    });
    const o = d.origin;
    // Floor trace: green = ground contact, white = hit something but not
    // held up by it (or not floor-like), grey = nothing below.
    Line(o, d.floorEnd, d.floorOk ? COLOR_TOUCH : d.floorHit ? COLOR_WHITE : COLOR_MISS);
    if (d.probes.length === 0) {
        return; // on the ground — wall probes only run in the air
    }
    // How far a wall may be from the center to be considered at all.
    Circle(o, WALL_CONTACT_DISTANCE, COLOR_RING);
    for (const p of d.probes) {
        Line(o, p.end, PROBE_COLORS[p.state]);
    }
    // Still jumpable from an earlier touch (WALL_JUMP_WINDOW): a small green
    // ring around the melon.
    if (kart.lastWallContact && Instance.GetGameTime() - kart.lastWallContact.time <= WALL_JUMP_WINDOW) {
        Circle(o, JUMPABLE_RING_RADIUS, COLOR_TOUCH);
    }
    const w = d.wall;
    if (!w) {
        return;
    }
    // Wall normal at the chosen wall, and a marker: green = touching now
    // (physics stopped the melon against it), orange = only near.
    const color = w.touching ? COLOR_TOUCH : COLOR_CHOSEN;
    Line(w.point, { x: w.point.x + w.normal.x * 32, y: w.point.y + w.normal.y * 32, z: w.point.z }, color);
    Instance.DebugSphere({ center: w.point, radius: w.touching ? 8 : 4, duration: 0, color });
    // What decides "touching": red = velocity commanded last tick, blue =
    // what physics left of it now. Red reaching into the wall while blue is
    // cut short = the wall stopped it.
    if (w.commanded) {
        Velocity(o, w.commanded, COLOR_COMMANDED, 4);
    }
    Velocity(o, w.actual, COLOR_ACTUAL, -4);
}
