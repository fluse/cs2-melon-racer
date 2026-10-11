// Bouncers: the rules (world/bouncer/logic.js) and UpdateBouncers against the
// fake engine — every prop_dynamic with the bouncer model is held upright and
// gets its swing loop once, at a random time within one swing (on the
// script's clock, not as delayed inputs).
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity } from "../helpers/cs-script-mock.mjs";

const { IsBouncerModel, BouncerStartDelay, BouncerHoldInputs, BouncerSwingInputs } = await import("../../src/melon_drive/world/bouncer/logic.js");
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

test("hold upright, then the swing loop (also as its idle)", () => {
    assert.deepEqual([...new Set(BouncerHoldInputs().map(([, v]) => v))], [C.BOUNCER_IDLE_ANIMATION]);
    assert.deepEqual([...new Set(BouncerSwingInputs().map(([, v]) => v))], [C.BOUNCER_SWING_ANIMATION]);
    assert.ok(BouncerSwingInputs().some(([input]) => input === "SetIdleAnimationLooping"), "keeps swinging as its idle");
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

const Fired = (target, value) => world.fired.filter((f) => f.target === target && f.input === "SetAnimationLooping" && f.value === value);

test("every bouncer is held upright, then swings at its own time on the script's clock — no delayed inputs; other props left alone", () => {
    const a = AddProp(C.BOUNCER_MODEL);
    const b = AddProp(C.BOUNCER_MODEL);
    AddProp("models/melon_racer/spike_spring/spike_spring.vmdl");
    AddProp(C.BOUNCER_MODEL, "prop_physics");
    UpdateBouncers(0);
    assert.deepEqual([...bouncers.keys()], [a, b]);
    assert.ok(world.fired.every((f) => !f.delay), "no input relies on a delay");
    // In the order they start, so an earlier update never runs past the next one's time.
    for (const target of [a, b].sort((x, y) => bouncers.get(x).startAt - bouncers.get(y).startAt)) {
        assert.equal(Fired(target, C.BOUNCER_IDLE_ANIMATION).length, 1, "held upright at once");
        const { startAt } = bouncers.get(target);
        assert.ok(startAt >= 0 && startAt < C.BOUNCER_SWING_SECONDS);
        UpdateBouncers(startAt - 0.001);
        assert.equal(Fired(target, C.BOUNCER_SWING_ANIMATION).length, startAt === 0 ? 1 : 0, "not before its time");
        UpdateBouncers(startAt);
        assert.equal(Fired(target, C.BOUNCER_SWING_ANIMATION).length, 1, "swinging from its time on");
    }
    const fired = world.fired.length;
    UpdateBouncers(C.BOUNCER_SCAN_SECONDS * 2);
    assert.equal(world.fired.length, fired, "not started a second time");
});

test("start times differ between bouncers", () => {
    for (let i = 0; i < 8; i++) AddProp(C.BOUNCER_MODEL);
    UpdateBouncers(0);
    const starts = new Set([...bouncers.values()].map((b) => b.startAt));
    assert.ok(starts.size > 1);
});

test("a bouncer that turns up later is found at the next scan; a round restart starts them all again", () => {
    const first = AddProp(C.BOUNCER_MODEL);
    UpdateBouncers(0);
    const late = AddProp(C.BOUNCER_MODEL);
    UpdateBouncers(C.BOUNCER_SCAN_SECONDS / 2);
    assert.ok(!bouncers.has(late), "not before the next scan");
    UpdateBouncers(C.BOUNCER_SCAN_SECONDS);
    assert.ok(bouncers.has(late));
    ResetBouncers();
    UpdateBouncers(C.BOUNCER_SCAN_SECONDS + 0.1);
    assert.equal(Fired(first, C.BOUNCER_IDLE_ANIMATION).length, 2, "held upright again");
    assert.equal(bouncers.get(first).started, false, "waiting for a new start");
});
