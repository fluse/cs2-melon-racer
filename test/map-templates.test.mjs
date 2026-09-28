// Checks the Hammer side of what the script spawns by name: every
// point_template kart-spawn.js / physics/break-effects.js /
// physics/wall-bounce.js (perfect spark) / heal/effect.js ForceSpawn must exist in
// maps/melon_racer.vmap exactly once, and point at real entities (the break,
// spark and heal templates at info_particle_systems with an effect set) — otherwise the
// script silently spawns nothing, e.g. no melon burst on a break.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { ReadVmapEntities } from "./helpers/vmap.mjs";
import {
    MELON_TEMPLATE_NAME,
    BREAK_PARTICLE_TEMPLATE_NAME,
    BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME,
    PERFECT_SPARK_TEMPLATE_NAME,
    HEAL_PARTICLE_TEMPLATE_NAME,
    BOOST_TRAIL_TEMPLATE_NAME,
} from "../src/melon_drive/constants/index.js";

const entities = ReadVmapEntities(fileURLToPath(new URL("../maps/melon_racer.vmap", import.meta.url)));

/** @param {string} name */
function ByName(name) {
    return entities.filter((e) => e.targetname === name);
}

/** @param {string} name */
function TemplateTargets(name) {
    const matches = ByName(name);
    assert.equal(matches.length, 1, `expected exactly one entity named "${name}", found ${matches.length}`);
    const template = matches[0];
    assert.equal(template.classname, "point_template", `"${name}" must be a point_template`);
    const targets = Object.entries(template)
        .filter(([key, value]) => /^Template\d+$/.test(key) && value)
        .map(([, value]) => value);
    assert.ok(targets.length > 0, `point_template "${name}" has no Template01.. entries`);
    return targets.map((target) => {
        const found = ByName(target);
        assert.ok(found.length > 0, `point_template "${name}" references "${target}", which doesn't exist in the map`);
        return found[0];
    });
}

test("the vmap parses and contains entities", () => {
    assert.ok(entities.length > 0);
});

test(`"${MELON_TEMPLATE_NAME}" spawns a physics prop`, () => {
    const targets = TemplateTargets(MELON_TEMPLATE_NAME);
    assert.ok(targets.some((e) => String(e.classname).startsWith("prop_physics")));
});

const PARTICLE_TEMPLATES = [BREAK_PARTICLE_TEMPLATE_NAME, BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME, PERFECT_SPARK_TEMPLATE_NAME, HEAL_PARTICLE_TEMPLATE_NAME];

for (const name of PARTICLE_TEMPLATES) {
    test(`"${name}" spawns a particle system with an effect`, () => {
        const particles = TemplateTargets(name).filter((e) => e.classname === "info_particle_system");
        assert.ok(particles.length > 0, `"${name}" doesn't spawn any info_particle_system`);
        for (const particle of particles) {
            assert.match(particle.effect_name, /\.vpcf$/, `"${particle.targetname}" has no .vpcf effect_name`);
        }
    });
}

// The boost trail is optional (no template = no trail), so this only checks
// it once it's been placed — and then it must spawn the band and the juice
// droplets, each as its own info_particle_system, and nothing else.
const BOOST_TRAIL_EFFECTS = ["particles/melon_racer/boost_trail.vpcf", "particles/melon_racer/boost_trail_juice.vpcf"];
test(`"${BOOST_TRAIL_TEMPLATE_NAME}" spawns the boost trail's band and juice particle systems`, { skip: ByName(BOOST_TRAIL_TEMPLATE_NAME).length === 0 && "not placed in the map yet" }, () => {
    const particles = TemplateTargets(BOOST_TRAIL_TEMPLATE_NAME).filter((e) => e.classname === "info_particle_system");
    for (const particle of particles) {
        assert.ok(BOOST_TRAIL_EFFECTS.includes(particle.effect_name), `"${particle.targetname}" plays the wrong effect (${particle.effect_name})`);
    }
    for (const effect of BOOST_TRAIL_EFFECTS) {
        assert.ok(particles.some((p) => p.effect_name === effect), `"${BOOST_TRAIL_TEMPLATE_NAME}" has no info_particle_system playing ${effect}`);
    }
});

// Each effect needs its own particle system: a template copied in Hammer
// that still points at another effect's entity plays that effect instead
// (found: particle_health_template spawning the PERFECT spark).
test("no two particle templates spawn the same entity", () => {
    const owner = new Map();
    const shared = [];
    const placedBoostTrail = ByName(BOOST_TRAIL_TEMPLATE_NAME).length > 0 ? [BOOST_TRAIL_TEMPLATE_NAME] : [];
    for (const name of [...PARTICLE_TEMPLATES, ...placedBoostTrail]) {
        for (const target of TemplateTargets(name)) {
            if (owner.has(target.targetname)) {
                shared.push(`"${target.targetname}" is in both "${owner.get(target.targetname)}" and "${name}"`);
            }
            owner.set(target.targetname, name);
        }
    }
    assert.deepEqual(shared, []);
});

// Decided: exactly these two break templates, no others — extra chunks go
// into one of them as prop_physics (see GAMEPLAY.md, "Melon health & breaking").
test("there are no break templates besides the two the script spawns", () => {
    const breakTemplates = entities
        .filter((e) => e.classname === "point_template" && String(e.targetname ?? "").startsWith("melon_break"))
        .map((e) => e.targetname)
        .sort();
    assert.deepEqual(breakTemplates, [BREAK_PARTICLE_TEMPLATE_NAME, BREAK_CHUNKS_PARTICLE_TEMPLATE_NAME].sort());
});

// Found in the map: "hub_start_trigger " with a trailing space. The script
// looks entities up (and checks triggers) by exact name, so a stray space
// silently breaks the lookup.
test("no entity name has leading or trailing whitespace", () => {
    const bad = entities
        .filter((e) => typeof e.targetname === "string" && e.targetname !== e.targetname.trim())
        .map((e) => `${e.classname} ${JSON.stringify(e.targetname)}`);
    assert.deepEqual(bad, []);
});
