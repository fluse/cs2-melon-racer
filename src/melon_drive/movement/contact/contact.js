// Engine side of ground/wall contact: the floor and wall probes (line
// traces — see UpdateGrounded for why not TraceSphere). The rules are in
// ./logic.js; what the probes saw goes to dev/collision-debug.js for the
// optional debug view.
import { IsGrounded, InLiftoff, IsAtWall, WallContactReach } from "./logic.js";
import { TraceLine } from "../../core/trace.js";
import { WallApproach } from "../jump/logic.js";
import { RecordFloorProbe, RecordWallProbes, IsCollisionDebugOn } from "../../dev/collision-debug.js";
import {
    GROUND_CHECK_DISTANCE,
    GROUND_COYOTE_TIME,
    WALL_PROBE_DIRECTIONS,
    WALL_NORMAL_MAX_Z,
} from "../../constants/index.js";

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
 * @param {import("../../core/kart-registry.js").Kart} kart @param {any} origin @param {number} now
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
 * In the air: whether a wall is right at the melon — a line trace in each of
 * WALL_PROBE_DIRECTIONS horizontal directions; a steep, non-prop hit counts
 * if its plane is within WallContactReach of the melon's center (the tight
 * WALL_JUMP_CONTACT_RADIUS plus one tick's travel towards it, IsAtWall).
 * The nearest such wall is recorded as kart.lastWallContact (the wall
 * jump's normal). No physics check on top: being that close *is* the
 * contact, so a press counts when the wall is at the melon — just before
 * the touch, on it, or the tick after (WALL_JUMP_WINDOW).
 * On the ground there's no wall jump: nothing is recorded, and the probes
 * only run at all for the collision debug view, so it shows them always.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {any} origin @param {number} now
 * @param {any} currentVelocity @param {number} dt @param {boolean} grounded see UpdateGrounded
 * @returns {{ x: number, y: number } | undefined} the wall's normal, if one is at the melon (in the air)
 */
export function UpdateWallContact(kart, origin, now, currentVelocity, dt, grounded) {
    if (grounded && !IsCollisionDebugOn(kart)) {
        return undefined;
    }
    /** @type {{ normal: { x: number, y: number }, gap: number, point: any, probe: number, at: boolean } | undefined} */
    let nearest = undefined;
    /** @type {{ end: any, state: import("../../dev/collision-debug.js").ProbeState }[]} */
    const probes = [];
    // Long enough for the widest reach this tick (moving straight at a
    // wall), and a wall between two probe directions is hit at up to
    // 1/cos(half the angle between them) times its real distance.
    const reach = WallContactReach(Math.hypot(currentVelocity.x, currentVelocity.y), dt) / Math.cos(Math.PI / WALL_PROBE_DIRECTIONS);
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
        const at = IsAtWall(gap, n, currentVelocity, dt);
        probes.push({ end: trace.end, state: at ? "near" : "far" });
        // A wall at the melon beats one that isn't; among equals the nearest.
        if (!nearest || (at && !nearest.at) || (at === nearest.at && gap < nearest.gap)) {
            nearest = { normal: n, gap, point: trace.end, probe: probes.length - 1, at };
        }
    }
    if (!nearest) {
        RecordWallProbes(kart, probes);
        return undefined;
    }
    if (nearest.at) {
        probes[nearest.probe].state = "chosen";
    }
    const into = -(currentVelocity.x * nearest.normal.x + currentVelocity.y * nearest.normal.y);
    RecordWallProbes(kart, probes, {
        point: nearest.point,
        normal: nearest.normal,
        gap: nearest.gap,
        reach: WallContactReach(into, dt),
        actual: currentVelocity,
        touching: nearest.at,
    });
    if (!nearest.at || grounded) {
        return undefined;
    }
    // How the melon came at this wall, for the wall jump's angle rating —
    // remembered from the contact's start (WallApproach), before physics
    // stopped it against the wall.
    const approach = WallApproach(kart.lastWallContact, now, nearest.normal, [currentVelocity, kart.lastVelocity, kart.prevLastVelocity]);
    kart.lastWallContact = { time: now, normal: nearest.normal, ...approach };
    return nearest.normal;
}
