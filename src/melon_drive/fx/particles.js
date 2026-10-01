// Particle effects from point_templates, the one way every effect in
// melon_drive is spawned: the break burst (health/breaking/effects.js), the
// PERFECT spark (movement/wall-bounce/wall-bounce.js), the heal sparkle (health/heal/effect.js)
// and the boost trail (fx/boost-trail/boost-trail.js).
// Tested against the fake engine in test/particles.test.mjs.
//
// Two engine quirks every caller would otherwise have to know about:
// - ForceSpawn keeps each templated entity's Hammer offset from its
//   point_template, so without moving them the effect plays wherever the
//   template happens to sit relative to it (see PlaceAll).
// - "Start Active" alone doesn't reliably play an info_particle_system
//   spawned later from a point_template — it's started explicitly
//   (StartParticles).
import { Instance, PointTemplate } from "cs_script/point_script";
import { Debug } from "../core/debug.js";

/**
 * A fresh copy of the named point_template's entities, spawned at
 * `position` — still at their Hammer offsets, not started yet.
 * @param {string} templateName @param {any} position @param {any} [angles]
 * @param {{ warn?: boolean }} [options] warn: report a missing/broken
 *   template with Instance.Msg (always in the console) instead of Debug —
 *   for effects that are part of the map's contract, where silently
 *   spawning nothing is the bug.
 * @returns {any[]} empty if nothing spawned
 */
export function SpawnFromTemplate(templateName, position, angles, { warn = false } = {}) {
    const report = warn ? (/** @type {string} */ text) => Instance.Msg(`[melon_drive] ${text}`) : Debug;
    const template = Instance.FindEntityByName(templateName);
    if (!template) {
        report(`SpawnFromTemplate: no point_template named "${templateName}" in the map`);
        return [];
    }
    if (!(template instanceof PointTemplate)) {
        report(`SpawnFromTemplate: "${templateName}" is a ${template.GetClassName()}, not a point_template`);
        return [];
    }
    const spawned = template.ForceSpawn(position, angles) ?? [];
    if (spawned.length === 0) {
        report(`SpawnFromTemplate: ForceSpawn of "${templateName}" returned nothing — check its Template01.. entries in Hammer`);
    }
    return spawned;
}

/** @param {any} entity */
export function IsParticleSystem(entity) {
    return entity.GetClassName() === "info_particle_system";
}

/** Moves every entity exactly onto `position` (undoing ForceSpawn's Hammer offsets). @param {any[]} entities @param {any} position */
export function PlaceAll(entities, position) {
    for (const entity of entities) {
        entity.Teleport({ position });
    }
}

/** Starts every info_particle_system among `entities`. @param {any[]} entities */
export function StartParticles(entities) {
    for (const entity of entities) {
        if (IsParticleSystem(entity)) {
            Instance.EntFireAtTarget({ target: entity, input: "Start" });
        }
    }
}

/**
 * Stops every info_particle_system among `entities` that's still around:
 * no new particles, the ones already out play to the end of their lifetime.
 * @param {any[]} entities
 */
export function StopParticles(entities) {
    for (const entity of entities) {
        if (entity.IsValid() && IsParticleSystem(entity)) {
            Instance.EntFireAtTarget({ target: entity, input: "Stop" });
        }
    }
}

/**
 * Removes `entities` after `seconds` (those still around — a parented one
 * goes with its parent if that's removed first). Removing an
 * info_particle_system ends its particles, so `seconds` must cover the
 * effect's own duration.
 * @param {any[]} entities @param {number} seconds
 */
export function RemoveAfter(entities, seconds) {
    Instance.Delay(seconds).then(() => {
        for (const entity of entities) {
            if (entity.IsValid()) {
                entity.Remove();
            }
        }
    });
}

/**
 * The whole short-lived effect in one call: a fresh copy of the template,
 * placed exactly at `position`, optionally riding along on `parent`,
 * started, and removed after `lifetime` seconds.
 * @param {string} templateName @param {any} position
 * @param {{ lifetime: number, parent?: any, angles?: any, warn?: boolean }} options
 * @returns {any[]} the spawned entities (empty if nothing spawned)
 */
export function PlayParticleTemplate(templateName, position, { lifetime, parent, angles, warn }) {
    const spawned = SpawnFromTemplate(templateName, position, angles, { warn });
    PlaceAll(spawned, position);
    if (parent) {
        for (const entity of spawned) {
            entity.SetParent(parent);
        }
    }
    StartParticles(spawned);
    RemoveAfter(spawned, lifetime);
    return spawned;
}
