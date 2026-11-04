// The free-look drone stays inside the info_visibility_box it starts in:
// the boxes read from the map (build-map-data.mjs ->
// src/melon_drive/dev/visibility-boxes.js), the rules (DroneBoundsAt,
// KeepInBounds in dev/drone-logic.js) and flying against the edge in
// dev/free-look.js (fake engine).
import "../helpers/register-cs-script.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { ReadVisibilityBoxes, VisibilityBoxesText, VISIBILITY_BOXES_FILE } from "../../build-map-data.mjs";
import { DroneBoundsAt, KeepInBounds } from "../../src/melon_drive/dev/drone-logic.js";
import { VISIBILITY_BOXES } from "../../src/melon_drive/dev/visibility-boxes.js";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { SetFreeLook, UpdateDrone } = await import("../../src/melon_drive/dev/free-look.js");
const C = await import("../../src/melon_drive/constants/index.js");

const close = (a, b) => Math.abs(a - b) < 1e-6;
const AXES = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
const small = { center: { x: 0, y: 0, z: 0 }, axes: AXES, half: [100, 100, 100] };
const big = { center: { x: 0, y: 0, z: 0 }, axes: AXES, half: [1000, 1000, 1000] };
// Turned 90 degrees (as in a prefab placed at yaw 90): its own x along world +y.
const turned = { center: { x: 0, y: 0, z: 0 }, axes: [{ x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], half: [500, 50, 100] };

test("visibility-boxes.js is up to date with the map — else run npm run build", () => {
    const fresh = VisibilityBoxesText(ReadVisibilityBoxes());
    assert.equal(readFileSync(VISIBILITY_BOXES_FILE, "utf8").replace(/\r\n/g, "\n"), fresh);
    assert.ok(VISIBILITY_BOXES.length > 0, "sanity: the map has info_visibility_boxes");
});

test("which box: the smallest round the start, none outside all of them", () => {
    assert.equal(DroneBoundsAt([big, small], { x: 10, y: 0, z: 0 }), small);
    assert.equal(DroneBoundsAt([big, small], { x: 500, y: 0, z: 0 }), big);
    assert.equal(DroneBoundsAt([big, small], { x: 5000, y: 0, z: 0 }), undefined);
    assert.equal(DroneBoundsAt([turned], { x: 0, y: 400, z: 0 }), turned, "turned: long along world y");
    assert.equal(DroneBoundsAt([turned], { x: 400, y: 0, z: 0 }), undefined);
});

test("kept inside with all of the drone in the box; what goes out is taken away, the rest slides along", () => {
    const inside = KeepInBounds(small, { x: 10, y: 20, z: 30 }, { x: 5, y: 5, z: 5 });
    assert.deepEqual(inside, { position: { x: 10, y: 20, z: 30 }, velocity: { x: 5, y: 5, z: 5 } }, "inside: untouched");
    const out = KeepInBounds(small, { x: 150, y: 0, z: 150 }, { x: 300, y: 40, z: 200 });
    assert.ok(close(out.position.x, 100 - C.DRONE_RADIUS));
    assert.ok(close(out.position.z, 100 - C.DRONE_TOP), "up to its top");
    assert.deepEqual(out.velocity, { x: 0, y: 40, z: 0 });
    const low = KeepInBounds(small, { x: 0, y: -150, z: -150 }, { x: 0, y: 50, z: -10 });
    assert.ok(close(low.position.y, -100 + C.DRONE_RADIUS) && close(low.position.z, -100 + C.DRONE_BOTTOM), "down to its skids");
    assert.deepEqual(low.velocity, { x: 0, y: 50, z: 0 }, "flying back in is kept");
    const sideways = KeepInBounds(turned, { x: 80, y: 0, z: 0 }, { x: 100, y: 100, z: 0 });
    assert.ok(close(sideways.position.x, 50 - C.DRONE_RADIUS), "turned: narrow across world x");
    assert.ok(close(sideways.velocity.x, 0) && close(sideways.velocity.y, 100));
});

test("flying the drone: it stops at the edge of the box it started in and slides along it", () => {
    world.reset();
    karts.clear();
    const box = VISIBILITY_BOXES[0];
    // The melon inside the box, near the end of its own x axis.
    const near = box.half[0] - 30;
    const start = { x: box.center.x + box.axes[0].x * near, y: box.center.y + box.axes[0].y * near, z: box.center.z };
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.HUB_SPAWN_NAME, className: "info_player_start", origin: start }));
    world.add(new PointTemplate({ name: C.DRONE_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_dynamic" })] }));
    const kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetHubSpawnPoint());
    assert.equal(SetFreeLook(kart, true), true, "setup: flying");
    assert.equal(kart.drone.bounds, box);
    // Fly out along the box's x axis and to its side.
    const yaw = (Math.atan2(box.axes[0].y, box.axes[0].x) * 180) / Math.PI;
    kart.pawn.eyeAngles = { pitch: 0, yaw, roll: 0 };
    kart.pawn.pressed.add("FORWARD").add("LEFT");
    const startAlongY = kart.drone.position.x * box.axes[1].x + kart.drone.position.y * box.axes[1].y;
    for (let i = 0; i < 30; i++) {
        UpdateDrone(kart, 0.1);
    }
    const p = kart.drone.position;
    const along = (axis) => (p.x - box.center.x) * axis.x + (p.y - box.center.y) * axis.y + (p.z - box.center.z) * axis.z;
    assert.ok(close(along(box.axes[0]), box.half[0] - C.DRONE_RADIUS * (Math.abs(box.axes[0].x) + Math.abs(box.axes[0].y))), "held at the edge");
    assert.ok(p.x * box.axes[1].x + p.y * box.axes[1].y > startAlongY + 100, "slid along it");
});
