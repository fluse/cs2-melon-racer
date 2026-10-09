// The user menu's developer camera page (dev/camera-tuning.js): the layout's
// segments and the clicks against the fake engine — each setting only the
// clicking player's own chase camera. The scale's rules:
// test/dev/tuning-scale.test.mjs.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";

const { CAMERA_TUNING_SCALE: SCALE, ScaleSegmentCount } = await import("../../src/melon_drive/dev/tuning-scale-logic.js");
const C = await import("../../src/melon_drive/constants/index.js");
const { karts, SetModeratorSlot } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { GetCameraOffsetFor } = await import("../../src/melon_drive/camera/index.js");
const { SetUserMenuOpen } = await import("../../src/melon_drive/hud/user-menu.js");
await import("../../src/melon_drive/index.js"); // registers OnCustomHudClicked

test("speedometer.xml has one segment per scale value for both axes", () => {
    const layout = readFileSync(new URL("../../panorama/layout/custom_game/speedometer.xml", import.meta.url), "utf8");
    const count = ScaleSegmentCount(SCALE);
    for (const axis of ["distance", "height"]) {
        const indices = [...layout.matchAll(new RegExp(`id="camtune_${axis}_seg_(\\d+)"`, "g"))].map((m) => Number(m[1]));
        assert.deepEqual(indices, [...Array(count).keys()], axis);
    }
});

/** @type {FakeHud} */
let hud;
/** @type {any} */
let a;
/** @type {any} */
let b;

/** @param {number} slot @param {string} buttonId */
function Click(slot, buttonId) {
    const [[onClick]] = world.handlers.OnCustomHudClicked;
    onClick({ layout: hud, buttonId, player: { GetPlayerSlot: () => slot } });
}

beforeEach(() => {
    hud?.Remove();
    world.reset();
    karts.clear();
    SetModeratorSlot(undefined);
    hud = world.add(new FakeHud(C.SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: C.MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: C.HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    a = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetHubSpawnPoint());
    b = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 1 })), GetHubSpawnPoint());
});

test("the camera button swaps the menu's columns for the camera page, Back swaps them back", () => {
    SetUserMenuOpen(0, a, true);
    Click(0, "usermenu_camera_button");
    assert.ok(hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(!hud.Has(0, "usermenu_camera_page", "Hidden"));
    assert.equal(hud.Variable(0, "usermenu_camera_page", "camtune_distance"), `${C.CAMERA_DISTANCE}`);
    Click(0, "camtune_back_button");
    assert.ok(!hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(hud.Has(0, "usermenu_camera_page", "Hidden"));
});

test("the menu reopens on its columns", () => {
    SetUserMenuOpen(0, a, true);
    Click(0, "usermenu_camera_button");
    SetUserMenuOpen(0, a, false);
    SetUserMenuOpen(0, a, true);
    assert.ok(!hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(hud.Has(0, "usermenu_camera_page", "Hidden"));
});

test("− / + and the scale set only the clicking player's camera, within the scale", () => {
    Click(0, "usermenu_camera_button");
    Click(0, "camtune_distance_plus");
    assert.equal(GetCameraOffsetFor(a).x, -(C.CAMERA_DISTANCE + C.CAMERA_TUNING_STEP));
    assert.equal(GetCameraOffsetFor(b).x, -C.CAMERA_DISTANCE);

    Click(0, "camtune_height_seg_0");
    assert.equal(GetCameraOffsetFor(a).z, C.CAMERA_TUNING_MIN);
    Click(0, "camtune_height_minus");
    assert.equal(GetCameraOffsetFor(a).z, C.CAMERA_TUNING_MIN, "can't go below the scale");
    assert.equal(hud.Variable(0, "usermenu_camera_page", "camtune_height"), `${C.CAMERA_TUNING_MIN}`);
    assert.ok(hud.Has(0, "camtune_height_seg_0", "On"));
    assert.ok(!hud.Has(0, "camtune_height_seg_1", "On"));

    const last = ScaleSegmentCount(SCALE) - 1;
    Click(0, `camtune_distance_seg_${last}`);
    Click(0, "camtune_distance_plus");
    assert.equal(GetCameraOffsetFor(a).x, -C.CAMERA_TUNING_MAX, "can't go above the scale");
    assert.ok(hud.Has(0, `camtune_distance_seg_${last}`, "On"));
});

test("Reset puts both values back on the defaults", () => {
    Click(0, "camtune_distance_seg_0");
    Click(0, "camtune_height_plus");
    Click(0, "camtune_reset_button");
    assert.deepEqual(GetCameraOffsetFor(a), GetCameraOffsetFor(b));
    assert.equal(a.cameraTuning, undefined);
});

test("the fine − / + change a value by the fine step", () => {
    Click(0, "camtune_height_plus_fine");
    assert.equal(GetCameraOffsetFor(a).z, C.CAMERA_HEIGHT + C.CAMERA_TUNING_FINE_STEP);
    Click(0, "camtune_distance_minus_fine");
    assert.equal(GetCameraOffsetFor(a).x, -(C.CAMERA_DISTANCE - C.CAMERA_TUNING_FINE_STEP));
});
