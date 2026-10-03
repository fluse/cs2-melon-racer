// The per-tick driver (core/think.js) against the fake engine in
// helpers/cs-script-mock.mjs: whatever goes wrong with one kart, every other
// player keeps driving and the next tick is always scheduled — otherwise the
// whole gamemode freezes until the map is reloaded.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const registry = await import("../../src/melon_drive/core/kart-registry.js");
const { karts, SetModeratorSlot } = registry;
const { Think } = await import("../../src/melon_drive/core/think.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetIntroSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, INTRO_SPAWN_NAME } = await import("../../src/melon_drive/constants/index.js");

const HUB = { x: 250, y: -520, z: 16 };
const INTRO = { x: -2000, y: -900, z: 24 };

/** @param {number} slot */
function Join(slot) {
    const kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot })), GetIntroSpawnPoint());
    assert.ok(kart, `setup: kart for slot ${slot}`);
    return kart;
}

/** Runs one Think at game time `time`, returning how many next thinks it scheduled. */
function ThinkAt(time) {
    world.time = time;
    const before = world.handlers.SetNextThink?.length ?? 0;
    Think();
    return (world.handlers.SetNextThink?.length ?? 0) - before;
}

beforeEach(() => {
    world.reset();
    karts.clear();
    SetModeratorSlot(undefined);
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: HUB }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: INTRO }));
});

test("every tick schedules the next one", () => {
    Join(0);
    assert.equal(ThinkAt(1), 1);
    assert.equal(ThinkAt(1.02), 1);
});

test("one kart's update throwing drops only that kart, and it gets a fresh one at the hub a second later", async () => {
    const broken = Join(0);
    const fine = Join(1);
    const oldMelon = broken.melon;
    broken.pawn.WasInputJustPressed = () => {
        throw new Error("boom");
    };

    assert.equal(ThinkAt(1), 1, "the next tick is still scheduled");
    assert.equal(karts.has(0), false);
    assert.equal(oldMelon.IsValid(), false, "its melon goes with it");
    assert.equal(karts.get(1), fine, "the other player keeps their kart");
    assert.deepEqual(fine.lastKnownPosition, fine.melon.GetAbsOrigin(), "…and was updated this tick");
    assert.equal(registry.moderatorSlot, 1, "the moderator passes on at once");
    assert.ok(world.delays.includes(1), "the rebuild waits a second, so a recurring error can't respawn every tick");

    await new Promise((resolve) => setImmediate(resolve));
    const rebuilt = karts.get(0);
    assert.ok(rebuilt, "rebuilt");
    assert.notEqual(rebuilt, broken);
    const p = rebuilt.melon.GetAbsOrigin();
    assert.deepEqual([p.x, p.y], [HUB.x, HUB.y], "at the hub — they were already playing, no intro again");
});

test("a kart whose pawn is gone is dropped, and the moderator passes on", () => {
    const leaving = Join(0);
    Join(1);
    leaving.pawn.valid = false;

    assert.equal(ThinkAt(1), 1);
    assert.equal(karts.has(0), false);
    assert.equal(leaving.melon.IsValid(), false);
    assert.equal(registry.moderatorSlot, 1);
});

test("a kart whose melon the engine destroyed is kept — it respawns instead of being dropped", async () => {
    const kart = Join(0);
    kart.melon.Remove();

    assert.equal(ThinkAt(1), 1);
    assert.equal(karts.get(0), kart);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(kart.melon.IsValid(), true, "a new melon");
});
