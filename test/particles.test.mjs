// The shared particle helper (src/melon_drive/particles.js) and its users —
// break burst, heal effect — against the fake engine in
// helpers/cs-script-mock.mjs, whose ForceSpawn keeps each entity's Hammer
// offset from its template like the real one.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { SpawnFromTemplate, PlaceAll, StartParticles, RemoveAfter, PlayParticleTemplate } = await import("../src/melon_drive/particles.js");
const { PlayHealEffect } = await import("../src/melon_drive/heal/index.js");
const { SpawnBreakParticles } = await import("../src/melon_drive/physics/break-effects.js");
const { HEAL_PARTICLE_TEMPLATE_NAME, HEAL_PARTICLE_LIFETIME, BREAK_PARTICLE_TEMPLATE_NAME } = await import("../src/melon_drive/constants/index.js");

/** Settles Instance.Delay(...).then(...) chains (the fake Delay resolves immediately). */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const HAMMER_OFFSET = { x: 200, y: -50, z: 10 };
const HERE = { x: 1000, y: 2000, z: 64 };

/** A template holding one particle system and one other entity, both at HAMMER_OFFSET from it. @param {string} name */
function AddTemplate(name) {
    return world.add(new PointTemplate({
        name,
        spawn: () => [
            new Entity({ className: "info_particle_system", origin: HAMMER_OFFSET }),
            new Entity({ className: "info_target", origin: HAMMER_OFFSET }),
        ],
    }));
}

/** The entities that got a "Start" input. */
const started = () => world.fired.filter((f) => f.input === "Start").map((f) => f.target);

beforeEach(() => world.reset());

test("a missing template spawns nothing, quietly unless warn is set", () => {
    assert.deepEqual(SpawnFromTemplate("nope", HERE), []);
    const before = world.messages.length;
    SpawnFromTemplate("nope", HERE, undefined, { warn: true });
    assert.equal(world.messages.length, before + 1);
    assert.match(world.messages.at(-1) ?? "", /nope/);
});

test("an entity that isn't a point_template spawns nothing", () => {
    world.add(new Entity({ name: "not_a_template" }));
    assert.deepEqual(SpawnFromTemplate("not_a_template", HERE), []);
});

test("PlaceAll undoes ForceSpawn's Hammer offset", () => {
    AddTemplate("fx");
    const spawned = SpawnFromTemplate("fx", HERE);
    assert.notDeepEqual(spawned[0].GetAbsOrigin(), HERE); // the engine quirk this exists for
    PlaceAll(spawned, HERE);
    for (const e of spawned) {
        assert.deepEqual(e.GetAbsOrigin(), HERE);
    }
});

test("StartParticles starts only the particle systems", () => {
    AddTemplate("fx");
    const spawned = SpawnFromTemplate("fx", HERE);
    StartParticles(spawned);
    assert.deepEqual(started(), [spawned[0]]);
});

test("RemoveAfter removes after the given time, skipping ones already gone", async () => {
    const a = world.add(new Entity());
    const b = world.add(new Entity());
    b.Remove();
    RemoveAfter([a, b], 3);
    assert.deepEqual(world.delays, [3]);
    await flush();
    assert.equal(a.IsValid(), false);
});

test("PlayParticleTemplate: placed, parented, started, removed after its lifetime", async () => {
    AddTemplate("fx");
    const melon = world.add(new Entity({ className: "prop_physics_multiplayer", origin: HERE }));
    const spawned = PlayParticleTemplate("fx", HERE, { lifetime: 1.5, parent: melon });
    assert.equal(spawned.length, 2);
    for (const e of spawned) {
        assert.deepEqual(e.GetAbsOrigin(), HERE);
        assert.equal(e.GetParent(), melon);
    }
    assert.deepEqual(started(), [spawned[0]]);
    assert.deepEqual(world.delays, [1.5]);
    await flush();
    assert.ok(spawned.every((e) => !e.IsValid()));
});

test("each play is a fresh copy (several karts at once each get their own)", () => {
    AddTemplate("fx");
    const first = PlayParticleTemplate("fx", HERE, { lifetime: 1 });
    const second = PlayParticleTemplate("fx", HERE, { lifetime: 1 });
    assert.notEqual(first[0], second[0]);
});

/** A kart as far as PlayHealEffect looks at it. @param {object} [extra] */
function Kart(extra = {}) {
    const melon = world.add(new Entity({ className: "prop_physics_multiplayer", origin: HERE }));
    return /** @type {any} */ ({ melon, breaking: false, locked: false, ...extra });
}

test("entering a heal zone plays the heal template on the melon", () => {
    AddTemplate(HEAL_PARTICLE_TEMPLATE_NAME);
    const kart = Kart();
    PlayHealEffect(kart);
    const [particle] = started();
    assert.ok(particle, "no particle system started");
    assert.deepEqual(particle.GetAbsOrigin(), HERE);
    assert.equal(particle.GetParent(), kart.melon);
    assert.deepEqual(world.delays, [HEAL_PARTICLE_LIFETIME]);
});

test("no heal effect for a broken or race-locked melon", () => {
    AddTemplate(HEAL_PARTICLE_TEMPLATE_NAME);
    PlayHealEffect(Kart({ breaking: true }));
    PlayHealEffect(Kart({ locked: true }));
    assert.deepEqual(started(), []);
});

test("the break burst still lands on the crash site and starts", () => {
    AddTemplate(BREAK_PARTICLE_TEMPLATE_NAME);
    assert.equal(SpawnBreakParticles(HERE, { pitch: 0, yaw: 0, roll: 0 }, { r: 255, g: 0, b: 0, a: 255 }), true);
    const [particle] = started();
    assert.ok(particle, "no particle system started");
    assert.deepEqual(particle.GetAbsOrigin(), HERE);
});
