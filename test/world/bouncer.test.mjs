// Bouncers: the rules (world/bouncer/logic.js) and UpdateBouncers against the
// fake engine — every prop_dynamic with the bouncer model is held upright and
// gets its swing loop once, after a random delay within one swing.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity } from "../helpers/cs-script-mock.mjs";

const { IsBouncerModel, BouncerStartDelay, BouncerStartInputs } = await import("../../src/melon_drive/world/bouncer/logic.js");
const { bouncers, UpdateBouncers, ResetBouncers } = await import("../../src/melon_drive/world/index.js");
const C = await import("../../src/melon_drive/constants/index.js");

test("bouncer model: matched whatever the case, slashes or compiled suffix", () => {
    assert.ok(IsBouncerModel(C.BOUNCER_MODEL));
    assert.ok(IsBouncerModel(C.BOUNCER_MODEL.toUpperCase().replace(/\//g, "\\")));
    assert.ok(IsBouncerModel(`${C.BOUNCER_MODEL}_c`));
    assert.ok(!IsBouncerModel("models/melon_racer/spike_spring/spike_spring.vmdl"));
    assert.ok(!IsBouncerModel(""));
});

test("start delay: anywhere within one swing", () => {
    assert.equal(BouncerStartDelay(0), 0);
    assert.equal(BouncerStartDelay(0.5), C.BOUNCER_SWING_SECONDS / 2);
    assert.ok(BouncerStartDelay(0.999999) < C.BOUNCER_SWING_SECONDS);
});

test("start inputs: upright at once, the swing loop after the delay", () => {
    const inputs = BouncerStartInputs(1.3);
    const at = (delay) => inputs.filter((i) => i.delay === delay).map((i) => i.value);
    assert.deepEqual([...new Set(at(0))], [C.BOUNCER_IDLE_ANIMATION]);
    assert.deepEqual([...new Set(at(1.3))], [C.BOUNCER_SWING_ANIMATION]);
    assert.ok(inputs.some((i) => i.input === "SetIdleAnimationLooping" && i.value === C.BOUNCER_SWING_ANIMATION), "keeps swinging as its idle");
});

beforeEach(() => {
    world.reset();
    ResetBouncers();
});

const AddProp = (model, className = C.BOUNCER_CLASS) => {
    const e = world.add(new Entity({ className }));
    e.SetModel(model);
    return e;
};

test("every bouncer is started once, each with its own delay; other props are left alone", () => {
    const a = AddProp(C.BOUNCER_MODEL);
    const b = AddProp(C.BOUNCER_MODEL);
    AddProp("models/melon_racer/spike_spring/spike_spring.vmdl");
    AddProp(C.BOUNCER_MODEL, "prop_physics");
    UpdateBouncers(0);
    assert.deepEqual([...bouncers.keys()], [a, b]);
    const swingAt = (target) => world.fired.find((f) => f.target === target && f.input === "SetAnimationLooping" && f.value === C.BOUNCER_SWING_ANIMATION).delay;
    for (const target of [a, b]) {
        assert.ok(swingAt(target) >= 0 && swingAt(target) < C.BOUNCER_SWING_SECONDS);
    }
    const fired = world.fired.length;
    UpdateBouncers(C.BOUNCER_SCAN_SECONDS * 2);
    assert.equal(world.fired.length, fired, "not started a second time");
});

test("a bouncer that turns up later starts at the next scan; a round restart starts them all again", () => {
    AddProp(C.BOUNCER_MODEL);
    UpdateBouncers(0);
    const late = AddProp(C.BOUNCER_MODEL);
    UpdateBouncers(C.BOUNCER_SCAN_SECONDS / 2);
    assert.ok(!bouncers.has(late), "not before the next scan");
    UpdateBouncers(C.BOUNCER_SCAN_SECONDS);
    assert.ok(bouncers.has(late));
    const fired = world.fired.length;
    ResetBouncers();
    UpdateBouncers(C.BOUNCER_SCAN_SECONDS + 0.1);
    assert.equal(world.fired.length, fired + 2 * BouncerStartInputs(0).length, "both started again");
});
