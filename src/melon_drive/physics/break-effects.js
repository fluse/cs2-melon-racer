// What a break leaves at the crash site: the two break templates'
// particles and any physics pieces in them, placed on the crash site, flung
// out, and cleaned up after BREAK_EFFECT_LIFETIME.
import { Instance, PointTemplate } from "cs_script/point_script";
import { Debug } from "../debug.js";
import { PruneBreakEffects, BreakPieceVelocity, RecenterOnto } from "../logic/break-sequence.js";
import { BREAK_EFFECT_LIFETIME, BREAK_PARTICLE_TEMPLATE_NAME, BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME, BREAK_PIECE_SPIN } from "../constants/index.js";

/**
 * Converts a direction vector into the pitch/yaw/roll a particle template
 * should spawn with to visually point along it (Source's angle convention:
 * yaw rotates around Z, pitch is negative-up/positive-down from horizontal).
 * @param {{ x: number, y: number, z: number }} dir @param {number} length
 */
export function DirectionToAngles(dir, length) {
    const yaw = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    const pitch = -(Math.asin(Math.min(1, Math.max(-1, dir.z / length))) * 180) / Math.PI;
    return { pitch, yaw, roll: 0 };
}

// Every break's spawned effect entities, kept so they can stay at the crash
// site for a long time (BREAK_EFFECT_LIFETIME) and still get cleaned up —
// see PruneBreakEffects.
/** @type {Array<{ spawnTime: number, entities: any[] }>} */
let breakEffects = [];

/** Removes break effects that are too old, or too many. */
function CleanUpBreakEffects() {
    const { expired, kept } = PruneBreakEffects(breakEffects, Instance.GetGameTime());
    breakEffects = kept;
    for (const effect of expired) {
        for (const entity of effect.entities) {
            if (entity.IsValid()) {
                entity.Remove();
            }
        }
    }
}

/**
 * Spawns a single named point_template's particle effect, if it's actually
 * placed in Hammer. @param {string} templateName @param {any} position @param {any} angles
 * @returns {any[]} the spawned entities (empty if nothing spawned)
 */
function SpawnParticleTemplate(templateName, position, angles) {
    const template = Instance.FindEntityByName(templateName);
    // Msg, not Debug: a missing/broken break template must be visible in the
    // console even with DEBUG off — silently spawning nothing is the bug.
    if (!template) {
        Instance.Msg(`[melon_drive] SpawnParticleTemplate: no entity named "${templateName}" found — add a point_template in Hammer with a particle system to see break effects`);
        return [];
    }
    if (!(template instanceof PointTemplate)) {
        Instance.Msg(`[melon_drive] SpawnParticleTemplate: entity "${templateName}" exists but is a ${template.GetClassName()}, not a point_template`);
        return [];
    }
    const spawned = template.ForceSpawn(position, angles) ?? [];
    if (spawned.length === 0) {
        Instance.Msg(`[melon_drive] SpawnParticleTemplate: ForceSpawn of "${templateName}" returned nothing — check its Template01.. entries in Hammer`);
        return [];
    }
    PlaceAtCrashSite(spawned, position);
    for (const entity of spawned) {
        // "Start Active" alone doesn't reliably play a particle system spawned
        // later from a point_template — start it explicitly.
        if (entity.GetClassName() === "info_particle_system") {
            Instance.EntFireAtTarget({ target: entity, input: "Start" });
        }
    }
    Debug(`SpawnParticleTemplate: "${templateName}" spawned ${spawned.map((e) => e.GetClassName()).join(", ")} at ${JSON.stringify(position)}`);
    return spawned;
}

/**
 * ForceSpawn keeps each templated entity's Hammer offset from its
 * point_template (same as melon_template, see SpawnMelonAt) — in the map
 * the break particles sit ~200 units next to their templates, so they
 * played that far away from the crash site, somewhere different on every
 * break (the offset is rotated by the impact direction). Put particle
 * systems exactly on the crash site, and center the pieces' group on it,
 * keeping their layout relative to each other.
 * @param {any[]} entities @param {any} position
 */
function PlaceAtCrashSite(entities, position) {
    const pieces = entities.filter((e) => e.GetClassName().startsWith("prop_physics"));
    const placed = RecenterOnto(pieces.map((p) => p.GetAbsOrigin()), position);
    pieces.forEach((piece, i) => piece.Teleport({ position: placed[i] }));
    for (const entity of entities) {
        if (!entity.GetClassName().startsWith("prop_physics")) {
            entity.Teleport({ position });
        }
    }
}

/**
 * Flings any physics props a break template spawned (e.g. the melon model's
 * own break pieces, models/cs_italy/italy_food_melon/italy_food_melon/
 * piece*.vmdl, added to melon_break_chunks_template in Hammer) outward from
 * the crash site, tinted in the melon's paint color. They then lie there as
 * ordinary physics props until BREAK_EFFECT_LIFETIME removes them — unlike
 * the chunks particle, which is only sprite flecks that fade within moments.
 * @param {any[]} entities @param {any} position @param {{ r: number, g: number, b: number, a: number }} color
 */
function LaunchBreakPieces(entities, position, color) {
    for (const piece of entities) {
        if (!piece.GetClassName().startsWith("prop_physics")) {
            continue;
        }
        piece.SetColor(color);
        const spin = () => (Math.random() * 2 - 1) * BREAK_PIECE_SPIN;
        piece.Teleport({
            velocity: BreakPieceVelocity(position, piece.GetAbsOrigin(), Math.random() * Math.PI * 2),
            angularVelocity: { x: spin(), y: spin(), z: spin() },
        });
    }
}

/**
 * Spawns both break effects at the crash site — the main burst plus the
 * chunks template layered on top of it. Independent of each other (either
 * can be missing from Hammer without the other failing).
 * @param {any} position @param {any} angles @param {{ r: number, g: number, b: number, a: number }} color the melon's paint, for any pieces
 * @returns {boolean} whether at least one of them actually spawned — see
 * BreakMelon's fallback tint for why callers need to know this, not just
 * fire-and-forget.
 */
export function SpawnBreakParticles(position, angles, color) {
    const entities = [
        ...SpawnParticleTemplate(BREAK_PARTICLE_TEMPLATE_NAME, position, angles),
        ...SpawnParticleTemplate(BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME, position, angles),
    ];
    LaunchBreakPieces(entities, position, color);
    if (entities.length === 0) {
        return false;
    }
    // Deliberately not removed on respawn — the chunks should keep lying at
    // the crash site long after the melon is back on the track.
    breakEffects.push({ spawnTime: Instance.GetGameTime(), entities });
    CleanUpBreakEffects();
    Instance.Delay(BREAK_EFFECT_LIFETIME).then(CleanUpBreakEffects);
    return true;
}
