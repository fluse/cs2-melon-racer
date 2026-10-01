// Collision debug view: everything that shows how ground/wall contact and jump
// presses are judged — the on-screen status line, the probes drawn into the
// world, and the "Jump pressed" console log. Toggled per player from the
// user menu (kart.collisionDebug, see SetCollisionDebug); off by default. The contact
// code in contact.js/drive.js/jump.js only hands its results to the
// Record*/Log*/Draw* functions here, so none of this lives in the gameplay
// code itself. Debug draws only show in dev environments (tools mode).
import { Instance } from "cs_script/point_script";
import { WALL_JUMP_CONTACT_RADIUS } from "../constants/index.js";

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
 *   wall?: WallDebug,
 * }} ContactDebug
 * @typedef {{ point: any, normal: { x: number, y: number }, gap: number, reach: number, actual: any, touching: boolean }} WallDebug
 *   the nearest wall the probes found: `gap` center to its plane, `reach` how close it had to be (see WallContactReach)
 */

/** @param {import("../core/kart-registry.js").Kart} kart */
export function IsCollisionDebugOn(kart) {
    return Boolean(kart.collisionDebug);
}

/** Turns the view on/off for this kart's player. @param {import("../core/kart-registry.js").Kart} kart @param {boolean} on */
export function SetCollisionDebug(kart, on) {
    kart.collisionDebug = on;
    if (!on) {
        kart.contactDebug = undefined;
    }
}

/**
 * Start of a tick's record: the measured support and the floor trace.
 * @param {import("../core/kart-registry.js").Kart} kart @param {any} origin
 * @param {boolean} supported @param {number | undefined} verticalAccel
 * @param {any} trace the floor TraceLine result @param {boolean} grounded
 */
export function RecordFloorProbe(kart, origin, supported, verticalAccel, trace, grounded) {
    if (!IsCollisionDebugOn(kart)) {
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
 * The wall probes (every tick while the view is on, also on the ground) and the nearest wall they found, with
 * its measured distance from the melon's center — read that off to tune
 * WALL_JUMP_CONTACT_RADIUS.
 * @param {import("../core/kart-registry.js").Kart} kart
 * @param {{ end: any, state: ProbeState }[]} probes
 * @param {WallDebug} [wall]
 */
export function RecordWallProbes(kart, probes, wall) {
    const d = kart.contactDebug;
    if (!IsCollisionDebugOn(kart) || !d) {
        return;
    }
    d.probes = probes;
    d.wall = wall;
    if (!wall) {
        d.wallText = "no wall";
        return;
    }
    const into = -(wall.actual.x * wall.normal.x + wall.actual.y * wall.normal.y);
    d.wallText = `${wall.gap.toFixed(1)} from center (counts <= ${wall.reach.toFixed(1)}), into ${into.toFixed(0)} u/s${wall.touching ? " AT WALL" : ""}`;
}

/**
 * Console log of a jump press: why it was (or wasn't) allowed.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {number} now
 * @param {boolean} grounded @param {boolean} groundJump @param {boolean} timingPress
 */
export function LogJumpPress(slot, kart, now, grounded, groundJump, timingPress) {
    if (!IsCollisionDebugOn(kart)) {
        return;
    }
    const d = kart.contactDebug;
    const groundAge = kart.lastGroundedTime === undefined ? "never" : `${(now - kart.lastGroundedTime).toFixed(3)}s ago`;
    const wallAge = kart.lastWallContact === undefined ? "never" : `${(now - kart.lastWallContact.time).toFixed(3)}s ago`;
    Instance.Msg(
        `[collision debug] slot ${slot} jump pressed: grounded=${grounded} groundJump=${groundJump} ` +
            `(ground contact ${groundAge}, ${d?.support ?? "—"}, floor: ${d?.floorText ?? "—"}) ` +
            `wall contact ${wallAge} (${d?.wallText ?? "—"}) wallCharge=${(kart.wallJumpCharge ?? 1).toFixed(2)} wallTiming=${timingPress}`
    );
}

/**
 * Console log of whether that press became a wall jump, and if not, why.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 * @param {string | null} blockedBy see WallJumpBlockReason @param {boolean} inLift
 */
export function LogWallJumpVerdict(slot, kart, blockedBy, inLift) {
    if (!IsCollisionDebugOn(kart)) {
        return;
    }
    Instance.Msg(`[collision debug] slot ${slot} wall jump: ${blockedBy === null ? "YES" : `no — ${blockedBy}`}${inLift ? " (in lift zone)" : " (not in a lift zone)"}`);
}

// Colors — see the legend in GAMEPLAY.md's "Jumping".
const COLOR_MISS = { r: 110, g: 110, b: 110 };
const COLOR_IGNORED = { r: 170, g: 80, b: 200 };
const COLOR_FAR = { r: 80, g: 120, b: 200 };
const COLOR_NEAR = { r: 60, g: 220, b: 230 };
const COLOR_CHOSEN = { r: 255, g: 180, b: 60 };
const COLOR_TOUCH = { r: 60, g: 255, b: 60 };
const COLOR_ACTUAL = { r: 80, g: 140, b: 255 };
const COLOR_RING = { r: 230, g: 230, b: 230 }; // bright: a dark ring vanished against the floor
const COLOR_WHITE = { r: 255, g: 255, b: 255 };
const PROBE_COLORS = { miss: COLOR_MISS, ignored: COLOR_IGNORED, far: COLOR_FAR, near: COLOR_NEAR, chosen: COLOR_CHOSEN };
const VELOCITY_DRAW_SCALE = 0.15; // units of line per unit/sec
const RING_SEGMENTS = 24;
const FLOOR_RING_LIFT = 1; // units above the floor trace's hit
// The marker at the wall's hit point — small: the melon itself is only ~7
// units in radius, and a bigger sphere (8) hid it close up.
const WALL_MARKER_RADIUS_AT = 2.5; // at the melon
const WALL_MARKER_RADIUS_FAR = 1.5; // found, too far
const JUMPABLE_RING_RADIUS = WALL_JUMP_CONTACT_RADIUS + 8;

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
 * the floor trace, the WALL_JUMP_CONTACT_RADIUS ring, every wall probe
 * colored by what it hit, and at the nearest wall its normal and the
 * melon's velocity.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {boolean} grounded
 * @param {{ x: number, y: number } | undefined} wallNormal @param {number} jumpWindow seconds a wall contact stays jumpable (WallRules.wallJumpWindow)
 */
export function DrawCollisionDebug(slot, kart, grounded, wallNormal, jumpWindow) {
    const d = kart.contactDebug;
    if (!IsCollisionDebugOn(kart) || !d) {
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
        return; // no probes ran (view switched on mid-tick)
    }
    // How close a wall must be to the center to count (standing still —
    // moving at it, one tick's travel is added): at the center's height,
    // and again flat on the floor below (FLOOR_RING_LIFT up, so it doesn't
    // sink into it) — from the chase camera the one at center height is
    // mostly hidden by the melon while it's on the ground.
    Circle(o, WALL_JUMP_CONTACT_RADIUS, COLOR_RING);
    if (d.floorHit) {
        Circle({ x: o.x, y: o.y, z: d.floorEnd.z + FLOOR_RING_LIFT }, WALL_JUMP_CONTACT_RADIUS, COLOR_RING);
    }
    for (const p of d.probes) {
        Line(o, p.end, PROBE_COLORS[p.state]);
    }
    // Jumpable right now (at a wall this tick, or within jumpWindow): a
    // green ring just outside the contact ring.
    if (kart.lastWallContact && Instance.GetGameTime() - kart.lastWallContact.time <= jumpWindow) {
        Circle(o, JUMPABLE_RING_RADIUS, COLOR_TOUCH);
    }
    const w = d.wall;
    if (!w) {
        return;
    }
    // Wall normal at the nearest wall, and a marker: green = at the melon
    // now (within reach), orange = found but too far.
    const color = w.touching ? COLOR_TOUCH : COLOR_CHOSEN;
    Line(w.point, { x: w.point.x + w.normal.x * 32, y: w.point.y + w.normal.y * 32, z: w.point.z }, color);
    Instance.DebugSphere({ center: w.point, radius: w.touching ? WALL_MARKER_RADIUS_AT : WALL_MARKER_RADIUS_FAR, duration: 0, color });
    // The melon's velocity now: its part towards the wall widens the reach.
    Velocity(o, w.actual, COLOR_ACTUAL, 0);
}
