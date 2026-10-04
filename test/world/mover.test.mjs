// Movers: the name rule (world/mover/logic.js) and StartMovers/RestoreMovers
// against the fake engine — every func_movelinear named "mover…" is started
// once and turned round at each end, after its wait.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity } from "../helpers/cs-script-mock.mjs";

const { ParseMoverName } = await import("../../src/melon_drive/world/mover/logic.js");
const { movers, StartMovers, RestoreMovers } = await import("../../src/melon_drive/world/index.js");
const C = await import("../../src/melon_drive/constants/index.js");

test("mover names: plain, suffixed and with a wait", () => {
    assert.deepEqual(ParseMoverName("mover"), { wait: C.MOVER_DEFAULT_WAIT });
    assert.deepEqual(ParseMoverName("mover_left"), { wait: C.MOVER_DEFAULT_WAIT });
    assert.deepEqual(ParseMoverName("mover_wait1.5"), { wait: 1.5 });
    assert.deepEqual(ParseMoverName("mover_wait2_gate_a"), { wait: 2 });
    assert.equal(ParseMoverName("door_1"), undefined);
    assert.equal(ParseMoverName("movers"), undefined);
    assert.equal(ParseMoverName(""), undefined);
});

/** @param {string} name @param {string} [className] */
function AddMover(name, className = C.MOVER_CLASS) {
    return world.add(new Entity({ name, className }));
}

/** @param {Entity} target */
const FiredAt = (target) => world.fired.filter((f) => f.target === target);

beforeEach(() => {
    world.reset();
    movers.clear();
});

test("StartMovers opens every mover, and only movers", () => {
    const mover = AddMover("mover_left");
    const other = AddMover("door_1");
    const notLinear = AddMover("mover_prop", "prop_dynamic");
    StartMovers();
    assert.deepEqual(FiredAt(mover).map((f) => f.input), ["Open"]);
    assert.deepEqual(FiredAt(other), []);
    assert.deepEqual(FiredAt(notLinear), []);
});

test("a mover turns round at each end, after its wait", () => {
    const mover = AddMover("mover_wait1.5");
    StartMovers();
    world.fired = [];
    world.fireOutput(mover, "OnFullyOpen");
    world.fireOutput(mover, "OnFullyClosed");
    assert.deepEqual(FiredAt(mover).map((f) => [f.input, f.delay]), [["Close", 1.5], ["Open", 1.5]]);
});

test("a second StartMovers (round restart) leaves running movers alone", () => {
    const mover = AddMover("mover");
    StartMovers();
    StartMovers();
    assert.equal(FiredAt(mover).length, 1, "opened once");
    assert.equal(world.outputs.size, 2, "connected once");
});

test("a respawned mover (round restart) is started again, the old one dropped", () => {
    const old = AddMover("mover");
    StartMovers();
    old.Remove();
    const fresh = AddMover("mover");
    StartMovers();
    assert.deepEqual(FiredAt(fresh).map((f) => f.input), ["Open"]);
    assert.deepEqual([...movers.keys()], [fresh]);
    assert.equal(world.outputs.size, 2);
});

test("a hot reload swaps the connections without reopening", () => {
    const mover = AddMover("mover_wait1");
    StartMovers();
    const before = new Map(movers);
    movers.clear(); // the reload re-ran the module
    world.fired = [];
    RestoreMovers(before);
    assert.deepEqual(world.fired, [], "no Open");
    assert.equal(world.outputs.size, 2, "old connections replaced, not added to");
    world.fireOutput(mover, "OnFullyOpen");
    assert.deepEqual(FiredAt(mover).map((f) => f.input), ["Close"]);
});
