// The kart registry (core/kart-registry.js) and what keeps it right across
// players leaving and tools-mode hot reloads, against the fake engine in
// helpers/cs-script-mock.mjs: the first player is the moderator, the
// next-oldest takes over when they leave, a dropped kart takes its melon and
// effects with it, and OnScriptReload carries karts, race phase and
// moderator over. See GAMEPLAY.md, "Moderator".
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";

const registry = await import("../../src/melon_drive/core/kart-registry.js");
const { karts, SetModeratorSlot, EnsureModerator, IsModerator, DropKart, FindKartByMelon } = registry;
const { predictionDotSet } = await import("../../src/melon_drive/core/trace.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const flow = await import("../../src/melon_drive/race/heat/race-flow.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, RacePhase } = await import("../../src/melon_drive/constants/index.js");
await import("../../src/melon_drive/index.js"); // registers OnPlayerDisconnect and OnScriptReload

/** @param {number} slot */
function Join(slot) {
    const kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot })), GetHubSpawnPoint());
    assert.ok(kart, `setup: kart for slot ${slot}`);
    return kart;
}

/** @param {number} playerSlot */
function Disconnect(playerSlot) {
    const [[onDisconnect]] = world.handlers.OnPlayerDisconnect;
    onDisconnect({ playerSlot });
}

beforeEach(() => {
    world.reset();
    karts.clear();
    SetModeratorSlot(undefined);
    flow.RestoreRaceFlowSnapshot({ phase: RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
});

test("the first player to get a kart is the moderator; later ones aren't", () => {
    Join(4);
    Join(1);
    assert.equal(IsModerator(4), true);
    assert.equal(IsModerator(1), false);
    assert.equal(IsModerator(undefined), false);
});

test("the moderator leaving promotes the next-oldest player, not the lowest slot", () => {
    Join(4);
    Join(2);
    Join(0);
    Disconnect(4);
    assert.equal(registry.moderatorSlot, 2);
    Disconnect(2);
    assert.equal(registry.moderatorSlot, 0);
    Disconnect(0);
    assert.equal(registry.moderatorSlot, undefined, "nobody left");
    Join(3);
    assert.equal(IsModerator(3), true, "the next one in is the moderator again");
});

test("another player leaving keeps the moderator", () => {
    Join(0);
    Join(1);
    Disconnect(1);
    assert.equal(registry.moderatorSlot, 0);
    assert.equal(karts.has(1), false);
});

test("a moderator slot nobody holds any more (e.g. after a reload) is reassigned", () => {
    Join(1);
    Join(2);
    SetModeratorSlot(6);
    EnsureModerator();
    assert.equal(registry.moderatorSlot, 1);
});

test("dropping a kart removes its melon, boost trail and guide-line dots with it", () => {
    const kart = Join(0);
    const trail = world.add(new Entity({ className: "info_particle_system" }));
    const dot = world.add(new Entity({ className: "func_brush" }));
    kart.boostTrail = { melon: kart.melon, entities: [trail] };
    kart.predictionDots = [dot];
    predictionDotSet.add(dot);

    DropKart(0, kart);
    assert.equal(karts.has(0), false);
    assert.equal(kart.melon.IsValid(), false, "no orphaned melon for the next one to spawn on");
    assert.equal(trail.IsValid(), false);
    assert.equal(dot.IsValid(), false);
    assert.equal(predictionDotSet.has(dot), false, "traces don't keep skipping a removed dot");
});

test("dropping a kart whose melon is already gone doesn't throw", () => {
    const kart = Join(0);
    kart.melon.Remove();
    assert.doesNotThrow(() => DropKart(0, kart));
    assert.equal(karts.has(0), false);
});

test("a melon is mapped back to its own kart; anything else to none", () => {
    const a = Join(0);
    const b = Join(1);
    assert.equal(FindKartByMelon(a.melon), a);
    assert.equal(FindKartByMelon(b.melon), b);
    assert.equal(FindKartByMelon(new Entity({ className: "prop_physics" })), undefined);
});

test("a hot reload carries the karts, the race phase and the moderator over", () => {
    const a = Join(0);
    const b = Join(1);
    SetModeratorSlot(1);
    flow.RestoreRaceFlowSnapshot({ phase: RacePhase.RACING, activeTrackId: 2, phaseEndTime: 77 });
    const [[{ before, after }]] = world.handlers.OnScriptReload;
    const memory = before();

    // What re-running the module's top level would leave behind: a new,
    // empty karts Map (the snapshot keeps the old one), nothing else set.
    memory.karts = new Map(memory.karts);
    karts.clear();
    SetModeratorSlot(undefined);
    flow.RestoreRaceFlowSnapshot({ phase: RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });

    after(memory);
    assert.equal(karts.get(0), a);
    assert.equal(karts.get(1), b);
    assert.equal(registry.moderatorSlot, 1);
    assert.equal(flow.phase, RacePhase.RACING);
    assert.equal(flow.activeTrackId, 2);
    assert.equal(flow.phaseEndTime, 77);
});

test("a reload without a snapshot leaves everything as it is", () => {
    Join(0);
    const [[{ after }]] = world.handlers.OnScriptReload;
    after(undefined);
    assert.equal(karts.size, 1);
    assert.equal(registry.moderatorSlot, 0);
});
