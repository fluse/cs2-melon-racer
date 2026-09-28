// Engine side of ground/wall contact: the floor and wall probes (line
// traces — see UpdateGrounded for why not TraceSphere). The rules are in
// ../logic/contact.js; what the probes saw goes to jump-debug.js for the
// optional debug view.
import { IsGrounded, InLiftoff, StoppedByWall } from "../logic/contact.js";
import { TraceLine } from "../trace.js";
import { RecordFloorProbe, RecordWallProbes } from "./jump-debug.js";
import {
    GROUND_CHECK_DISTANCE,
    GROUND_COYOTE_TIME,
    WALL_PROBE_DIRECTIONS,
    WALL_CONTACT_DISTANCE,
    WALL_NORMAL_MAX_Z,
} from "../constants/index.js";

/**
 * Refreshes kart.lastGroundedTime if the melon is on the ground right now —
 * held up (`supported`, measured from physics in UpdateKart) by a floor-like
 * surface a trace finds underneath — and reports whether it had ground
 * contact within the last GROUND_COYOTE_TIME seconds. Not while still
 * taking off from a jump (InLiftoff): the floor pushing the melon up for a
 * tick after it jumped looks just like support.
 * Line traces only, not TraceSphere: a sphere started at the melon's center
 * apparently counts as starting inside it in-engine — with sphere probes no
 * floor was ever found and jumping stopped working entirely.
 * @param {import("../kart-registry.js").Kart} kart @param {any} origin @param {number} now
 * @param {boolean} supported @param {number | undefined} verticalAccel only for the debug view
 */
export function UpdateGrounded(kart, origin, now, supported, verticalAccel) {
    const trace = TraceLine({
        start: origin,
        end: { x: origin.x, y: origin.y, z: origin.z - GROUND_CHECK_DISTANCE },
        ignoreEntity: [kart.melon, kart.pawn],
        ignorePlayers: true,
    });
    const floorNormalZ = trace.didHit && !trace.startedInSolid ? trace.normal.z : undefined;
    kart.floorNormalZ = floorNormalZ; // for this tick's landing damage (FLAT_LANDING_*)
    const grounded = IsGrounded(supported, floorNormalZ) && !InLiftoff(now, kart.lastJumpTime, kart.lastWallJump?.time);
    RecordFloorProbe(kart, origin, supported, verticalAccel, trace, grounded);
    if (grounded) {
        kart.lastGroundedTime = now;
    }
    return kart.lastGroundedTime !== undefined && now - kart.lastGroundedTime <= GROUND_COYOTE_TIME;
}

/**
 * In the air: looks for a wall right next to the melon — a line trace in
 * each of WALL_PROBE_DIRECTIONS horizontal directions (long enough that the
 * gaps between directions don't miss a wall), the steep, non-prop hit whose
 * plane is nearest and within WALL_CONTACT_DISTANCE of the melon's center
 * wins. Being near isn't touching, though: it only counts if physics just
 * stopped the melon against it (StoppedByWall — last tick's commanded
 * velocity vs. `currentVelocity`); then it's recorded as
 * kart.lastWallContact (the wall jump's normal).
 * @param {import("../kart-registry.js").Kart} kart @param {any} origin @param {number} now @param {any} currentVelocity
 * @returns {{ x: number, y: number } | undefined} the touched wall's normal, if any
 */
export function UpdateWallContact(kart, origin, now, currentVelocity) {
    let best = undefined;
    let bestGap = Infinity;
    let bestPoint = undefined;
    let bestProbe = -1;
    /** @type {{ end: any, state: import("./jump-debug.js").ProbeState }[]} */
    const probes = [];
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
        if (!trace.didHit || trace.startedInSolid) {
            probes.push({ end: trace.end, state: "miss" });
            continue;
        }
        const hit = trace.hitEntity;
        if (Math.abs(trace.normal.z) >= WALL_NORMAL_MAX_Z || (hit && !hit.IsWorld() && hit.GetClassName().startsWith("prop_physics"))) {
            probes.push({ end: trace.end, state: "ignored" }); // floor/ceiling, or other melons, break pieces — not a wall to jump off
            continue;
        }
        const h = Math.hypot(trace.normal.x, trace.normal.y);
        const n = { x: trace.normal.x / h, y: trace.normal.y / h };
        const gap = (origin.x - trace.end.x) * n.x + (origin.y - trace.end.y) * n.y; // center to wall plane
        probes.push({ end: trace.end, state: gap <= WALL_CONTACT_DISTANCE ? "near" : "far" });
        if (gap <= WALL_CONTACT_DISTANCE && gap < bestGap) {
            best = n;
            bestGap = gap;
            bestPoint = trace.end;
            bestProbe = probes.length - 1;
        }
    }
    if (!best) {
        RecordWallProbes(kart, probes);
        return undefined;
    }
    probes[bestProbe].state = "chosen";
    const touching = kart.lastVelocity !== undefined && StoppedByWall(best, kart.lastVelocity, currentVelocity);
    RecordWallProbes(kart, probes, { point: bestPoint, normal: best, commanded: kart.lastVelocity, actual: currentVelocity, touching });
    if (!touching) {
        return undefined;
    }
    kart.lastWallContact = { time: now, normal: best };
    return best;
}
