import { test } from "node:test";
import assert from "node:assert/strict";
import { CheckpointStrip } from "../../src/melon_drive/hud/checkpoint-strip-logic.js";
import { CHECKPOINT_HUD_SLOTS } from "../../src/melon_drive/constants/index.js";

const states = (strip) => strip.slots.map((s) => s.state);

test("reached checkpoints, then the next one, then the rest", () => {
    const strip = CheckpointStrip(4, 2, CHECKPOINT_HUD_SLOTS);
    assert.deepEqual(strip.slots.map((s) => s.number), [1, 2, 3, 4]);
    assert.deepEqual(states(strip), ["reached", "reached", "next", "pending"]);
    assert.equal(strip.finish, "pending");
    assert.equal(strip.moreBefore || strip.moreAfter, false);
});

test("after the last checkpoint the finish is next; a finished run has it reached", () => {
    assert.equal(CheckpointStrip(3, 3, CHECKPOINT_HUD_SLOTS).finish, "next");
    const done = CheckpointStrip(3, 0, CHECKPOINT_HUD_SLOTS, true);
    assert.equal(done.finish, "reached");
    assert.deepEqual(states(done), ["reached", "reached", "reached"]);
});

test("a track without checkpoints is start -> finish", () => {
    const strip = CheckpointStrip(0, 0, CHECKPOINT_HUD_SLOTS);
    assert.deepEqual(strip.slots, []);
    assert.equal(strip.finish, "next");
});

test("more checkpoints than slots: the window follows the next one", () => {
    const total = CHECKPOINT_HUD_SLOTS * 2;
    for (let reached = 0; reached <= total; reached++) {
        const strip = CheckpointStrip(total, reached, CHECKPOINT_HUD_SLOTS);
        assert.equal(strip.slots.length, CHECKPOINT_HUD_SLOTS);
        const numbers = strip.slots.map((s) => s.number);
        if (reached < total) {
            assert.ok(numbers.includes(reached + 1), `next checkpoint ${reached + 1} is visible`);
        }
        assert.equal(strip.moreBefore, numbers[0] > 1);
        assert.equal(strip.moreAfter, numbers[numbers.length - 1] < total);
    }
    assert.equal(CheckpointStrip(total, 0, CHECKPOINT_HUD_SLOTS).moreBefore, false, "starts at checkpoint 1");
    assert.equal(CheckpointStrip(total, total, CHECKPOINT_HUD_SLOTS).moreAfter, false, "ends at the last one");
});
