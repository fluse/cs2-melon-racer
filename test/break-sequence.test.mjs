// Rules of the melon-break sequence (camera pull-back, how long the burst's
// effects stay), asserted in terms of the constants, not their values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BreakCameraZoomFraction, BreakCameraOffset, PruneBreakEffects, BreakPieceVelocity, RecenterOnto } from "../src/melon_drive/logic/break-sequence.js";
import {
    BREAK_CAMERA_ZOOM_SECONDS,
    BREAK_CAMERA_EXTRA_DISTANCE,
    BREAK_CAMERA_EXTRA_HEIGHT,
    BREAK_RESPAWN_DELAY,
    BREAK_EFFECT_LIFETIME,
    BREAK_EFFECT_MAX_ACTIVE,
    BREAK_PIECE_SPEED,
    BREAK_PIECE_UP_SPEED,
} from "../src/melon_drive/constants/index.js";

const base = { x: -320, y: 0, z: 80 };

test("camera starts at the normal chase offset at the moment of the break", () => {
    assert.deepEqual(BreakCameraOffset(base, 0), base);
    assert.equal(BreakCameraZoomFraction(-1), 0);
});

test("camera is fully pulled back (further behind and higher) once the zoom time has passed", () => {
    const zoomed = BreakCameraOffset(base, BREAK_CAMERA_ZOOM_SECONDS);
    assert.equal(zoomed.x, base.x - BREAK_CAMERA_EXTRA_DISTANCE);
    assert.equal(zoomed.z, base.z + BREAK_CAMERA_EXTRA_HEIGHT);
    assert.equal(zoomed.y, base.y);
    assert.deepEqual(BreakCameraOffset(base, BREAK_CAMERA_ZOOM_SECONDS * 5), zoomed, "holds, doesn't keep zooming");
});

test("camera zoom only ever moves outward over time", () => {
    let last = -Infinity;
    for (let t = 0; t <= BREAK_CAMERA_ZOOM_SECONDS; t += BREAK_CAMERA_ZOOM_SECONDS / 20) {
        const f = BreakCameraZoomFraction(t);
        assert.ok(f >= last && f >= 0 && f <= 1);
        last = f;
    }
});

// Regression: the melon used to respawn after 1s — too quick to see anything.
test("the zoom finishes well before the melon respawns, leaving time to watch", () => {
    assert.ok(BREAK_CAMERA_ZOOM_SECONDS < BREAK_RESPAWN_DELAY);
    assert.ok(BREAK_RESPAWN_DELAY >= 2);
});

// Regression: the chunks should stay on the ground long after the respawn.
test("break effects outlive the respawn by a long way", () => {
    assert.ok(BREAK_EFFECT_LIFETIME >= BREAK_RESPAWN_DELAY * 10);
    const { expired, kept } = PruneBreakEffects([{ spawnTime: 0 }], BREAK_RESPAWN_DELAY + 1);
    assert.equal(expired.length, 0);
    assert.equal(kept.length, 1);
});

test("break effects are removed once older than their lifetime", () => {
    const old = { spawnTime: 0 };
    const fresh = { spawnTime: BREAK_EFFECT_LIFETIME };
    const { expired, kept } = PruneBreakEffects([fresh, old], BREAK_EFFECT_LIFETIME);
    assert.deepEqual(expired, [old]);
    assert.deepEqual(kept, [fresh]);
});

test("at most BREAK_EFFECT_MAX_ACTIVE breaks' effects are kept, oldest removed first", () => {
    const effects = Array.from({ length: BREAK_EFFECT_MAX_ACTIVE + 3 }, (_, i) => ({ spawnTime: i }));
    const { expired, kept } = PruneBreakEffects(effects.slice().reverse(), effects.length);
    assert.equal(kept.length, BREAK_EFFECT_MAX_ACTIVE);
    assert.deepEqual(expired, effects.slice(0, 3));
});

test("break pieces fly outward, away from the crash site, and pop upward", () => {
    const center = { x: 100, y: 50, z: 10 };
    const v = BreakPieceVelocity(center, { x: 110, y: 50, z: 30 }, 0);
    assert.ok(v.x > 0 && Math.abs(v.y) < 1e-9, "points from the center toward the piece, horizontally");
    assert.ok(Math.abs(Math.hypot(v.x, v.y) - BREAK_PIECE_SPEED) < 1e-9);
    assert.equal(v.z, BREAK_PIECE_UP_SPEED);
});

test("a break piece spawned right at the center still gets launched, along the fallback angle", () => {
    const center = { x: 0, y: 0, z: 0 };
    const v = BreakPieceVelocity(center, center, Math.PI / 2);
    assert.ok(Math.abs(v.x) < 1e-9 && Math.abs(v.y - BREAK_PIECE_SPEED) < 1e-9);
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y));
});

// Regression: ForceSpawn keeps each entity's Hammer offset from its
// template, so break effects/pieces placed next to the template appeared
// ~200 units away from the crash site.
test("break pieces are centered on the crash site, keeping their layout", () => {
    const hammer = [{ x: 509, y: -240, z: 8 }, { x: 505, y: -239, z: 7 }, { x: 507, y: -246, z: 3 }];
    const crash = { x: -1000, y: 2000, z: 64 };
    const placed = RecenterOnto(hammer, crash);
    const centroid = placed.reduce((c, p) => ({ x: c.x + p.x / 3, y: c.y + p.y / 3, z: c.z + p.z / 3 }), { x: 0, y: 0, z: 0 });
    for (const axis of ["x", "y", "z"]) {
        assert.ok(Math.abs(centroid[axis] - crash[axis]) < 1e-9, `centroid ${axis}`);
        assert.ok(Math.abs(placed[1][axis] - placed[0][axis] - (hammer[1][axis] - hammer[0][axis])) < 1e-9, `layout ${axis}`);
    }
    assert.deepEqual(RecenterOnto([], crash), []);
});
