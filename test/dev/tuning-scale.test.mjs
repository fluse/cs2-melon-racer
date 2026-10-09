// The scale the user menu's tuning pages share (dev/tuning-scale-logic.js):
// clamping, segments, and what each − / + / segment button does — for both
// pages' scales, so a retuned constant can't break one of them unnoticed.
import { test } from "node:test";
import assert from "node:assert/strict";

const S = await import("../../src/melon_drive/dev/tuning-scale-logic.js");
const SCALES = { camera: S.CAMERA_TUNING_SCALE, physics: S.PHYSICS_TUNING_SCALE };

for (const [name, scale] of Object.entries(SCALES)) {
    test(`${name}: values are kept on the scale`, () => {
        assert.equal(S.ClampOnScale(scale, scale.min - 1), scale.min);
        assert.equal(S.ClampOnScale(scale, scale.max + 1), scale.max);
        assert.equal(S.ClampOnScale(scale, scale.min), scale.min);
    });

    test(`${name}: the segments run from min to max and fill up to the value`, () => {
        const count = S.ScaleSegmentCount(scale);
        assert.equal(S.ScaleSegmentValue(scale, 0), scale.min);
        assert.equal(S.ScaleSegmentValue(scale, count - 1), scale.max);
        assert.ok(S.IsScaleSegmentLit(scale, 0, scale.min));
        assert.ok(!S.IsScaleSegmentLit(scale, 1, scale.min));
        assert.ok(S.IsScaleSegmentLit(scale, 1, scale.min + scale.segmentStep));
        assert.ok(S.IsScaleSegmentLit(scale, count - 1, scale.max));
    });

    test(`${name}: − / + move by the big or fine step, a segment jumps to its value, all kept on the scale`, () => {
        const mid = S.ScaleSegmentValue(scale, 1);
        assert.equal(S.TunedValue(scale, mid, { row: "x", action: "plus" }), mid + scale.step);
        assert.equal(S.TunedValue(scale, mid, { row: "x", action: "minus_fine" }), mid - scale.fineStep);
        assert.equal(S.TunedValue(scale, mid, { row: "x", action: "segment", segment: 0 }), scale.min);
        assert.equal(S.TunedValue(scale, scale.min, { row: "x", action: "minus" }), scale.min);
        assert.equal(S.TunedValue(scale, scale.max, { row: "x", action: "plus_fine" }), scale.max);
        assert.equal(S.TunedValue(scale, mid, { row: "x", action: "segment", segment: 999 }), scale.max);
    });
}

test("button ids: row and control after the page's prefix", () => {
    assert.deepEqual(S.ParseTuningButton("camtune_", "camtune_height_plus"), { row: "height", action: "plus" });
    assert.deepEqual(S.ParseTuningButton("camtune_", "camtune_height_plus_fine"), { row: "height", action: "plus_fine" });
    assert.deepEqual(S.ParseTuningButton("phytune_", "phytune_maxspeed_seg_12"), { row: "maxspeed", action: "segment", segment: 12 });
    assert.equal(S.ParseTuningButton("phytune_", "camtune_height_plus"), undefined, "another page's prefix");
    assert.equal(S.ParseTuningButton("camtune_", "camtune_back_button"), undefined, "not a scale control");
    assert.equal(S.ParseTuningButton("camtune_", "camtune_height_sideways"), undefined);
});
