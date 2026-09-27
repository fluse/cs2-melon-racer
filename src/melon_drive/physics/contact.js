// Engine side of ground/wall contact: the floor and wall probes (line
// traces — see UpdateGrounded for why not TraceSphere) and the DEBUG
// overlay. The rules are in ../logic/contact.js.
import { Instance } from "cs_script/point_script";
import { DEBUG } from "../debug.js";
import { IsGrounded } from "../logic/contact.js";
import { TraceLine } from "../trace.js";
import {
    GROUND_CHECK_DISTANCE,
    GROUND_COYOTE_TIME,
    WALL_PROBE_DIRECTIONS,
    WALL_CONTACT_DISTANCE,
    WALL_NORMAL_MAX_Z,
} from "../constants.js";

/**
 * Refreshes kart.lastGroundedTime if the melon is on the ground right now —
 * held up (`supported`, measured from physics in UpdateKart) by a floor-like
 * surface a trace finds underneath — and reports whether it had ground
 * contact within the last GROUND_COYOTE_TIME seconds.
 * Line traces only, not TraceSphere: a sphere started at the melon's center
 * apparently counts as starting inside it in-engine — with sphere probes no
 * floor was ever found and jumping stopped working entirely.
 * @param {import("../kart-registry.js").Kart} kart @param {any} origin @param {number} now @param {boolean} supported
 */
export function UpdateGrounded(kart, origin, now, supported) {
    const trace = TraceLine({
        start: origin,
        end: { x: origin.x, y: origin.y, z: origin.z - GROUND_CHECK_DISTANCE },
        ignoreEntity: [kart.melon, kart.pawn],
        ignorePlayers: true,
    });
    const floorNormalZ = trace.didHit && !trace.startedInSolid ? trace.normal.z : undefined;
    // For the DEBUG overlay: what the floor trace saw.
    kart.floorProbe = trace.startedInSolid ? "started in solid" : trace.didHit ? `hit, normal z ${trace.normal.z.toFixed(2)}` : "nothing";
    if (IsGrounded(supported, floorNormalZ)) {
        kart.lastGroundedTime = now;
    }
    return kart.lastGroundedTime !== undefined && now - kart.lastGroundedTime <= GROUND_COYOTE_TIME;
}

/**
 * In the air: looks for a wall right next to the melon — a line trace in
 * each of WALL_PROBE_DIRECTIONS horizontal directions (long enough that the
 * gaps between directions don't miss a wall), the steep, non-prop hit whose
 * plane is nearest and within WALL_CONTACT_DISTANCE of the melon's center
 * wins — and records it as kart.lastWallContact (the wall jump's normal).
 * @param {import("../kart-registry.js").Kart} kart @param {any} origin @param {number} now
 * @returns {{ x: number, y: number } | undefined} the touched wall's normal, if any
 */
export function UpdateWallContact(kart, origin, now) {
    let best = undefined;
    let bestGap = Infinity;
    // A wall between two probe directions is hit at up to 1/cos(half the
    // angle between them) times its real distance.
    const reach = WALL_CONTACT_DISTANCE / Math.cos(Math.PI / WALL_PROBE_DIRECTIONS);
    for (let i = 0; i < WALL_PROBE_DIRECTIONS; i++) {
        const a = (i / WALL_PROBE_DIRECTIONS) * Math.PI * 2;
        const trace = TraceLine({
            start: origin,
            end: {
                x: origin.x + Math.cos(a) * reach,
                y: origin.y + Math.sin(a) * reach,
                z: origin.z,
            },
            ignoreEntity: [kart.melon, kart.pawn],
            ignorePlayers: true,
        });
        if (!trace.didHit || trace.startedInSolid || Math.abs(trace.normal.z) >= WALL_NORMAL_MAX_Z) {
            continue;
        }
        const hit = trace.hitEntity;
        if (hit && !hit.IsWorld() && hit.GetClassName().startsWith("prop_physics")) {
            continue; // other melons, break pieces — not a wall to jump off
        }
        const h = Math.hypot(trace.normal.x, trace.normal.y);
        const n = { x: trace.normal.x / h, y: trace.normal.y / h };
        const gap = (origin.x - trace.end.x) * n.x + (origin.y - trace.end.y) * n.y; // center to wall plane
        if (gap <= WALL_CONTACT_DISTANCE && gap < bestGap) {
            best = n;
            bestGap = gap;
        }
    }
    if (best) {
        kart.lastWallContact = { time: now, normal: best };
    }
    return best;
}

/**
 * DEBUG only: the contact state on screen every tick (GROUND / AIR, WALL,
 * the measured vertical acceleration) plus the touched wall's normal in the
 * world — to check the detection while driving before relying on it.
 * @param {number} slot @param {import("../kart-registry.js").Kart} kart @param {boolean} grounded @param {boolean} supported
 * @param {number | undefined} verticalAccel @param {{ x: number, y: number } | undefined} wallNormal
 */
export function DebugDrawContact(slot, kart, grounded, supported, verticalAccel, wallNormal) {
    if (!DEBUG) {
        return;
    }
    const accel = verticalAccel === undefined ? "—" : `${verticalAccel.toFixed(0)} u/s²`;
    const text = `slot ${slot}: ${grounded ? "GROUND" : "AIR"}${wallNormal ? " + WALL" : ""}  (supported=${supported}, az=${accel}, floor trace: ${kart.floorProbe ?? "—"})`;
    Instance.DebugScreenText({
        text,
        x: 20,
        y: 200 + slot * 16,
        duration: 0,
        color: grounded ? { r: 90, g: 220, b: 90 } : wallNormal ? { r: 255, g: 180, b: 60 } : { r: 255, g: 255, b: 255 },
    });
    if (wallNormal) {
        const o = kart.melon.GetAbsOrigin();
        Instance.DebugLine({
            start: o,
            end: { x: o.x + wallNormal.x * 64, y: o.y + wallNormal.y * 64, z: o.z },
            duration: 0,
            color: { r: 255, g: 180, b: 60 },
        });
    }
}
