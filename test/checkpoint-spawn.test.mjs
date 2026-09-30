// A checkpoint's respawn point is its checkpoint_spawn_<trackId>_<index>
// info_target (facing that entity's yaw), not the checkpoint trigger — the
// trigger is only the fallback when the map has no such info_target. A
// teleport_[stop_|keep_]checkpoint_to_<destination> teleporter sets the
// respawn point to its destination (tutorial sections), a plain one doesn't. Runs
// the real engine-side functions against the fake engine in
// helpers/cs-script-mock.mjs.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "./helpers/cs-script-mock.mjs";

const { karts } = await import("../src/melon_drive/kart-registry.js");
const { SetUpPlayerKart } = await import("../src/melon_drive/kart-spawn.js");
const { GetIntroSpawnPoint } = await import("../src/melon_drive/spawn-points.js");
const { RespawnKartAtCheckpoint } = await import("../src/melon_drive/physics/index.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, INTRO_SPAWN_NAME, SPAWN_UP_OFFSET, TELEPORT_UP_OFFSET, CheckpointSpawnName } = await import("../src/melon_drive/constants/index.js");
await import("../src/melon_drive/index.js"); // registers the script inputs

/** @param {string} name */
function ScriptInput(name) {
    const registration = (world.handlers.OnScriptInput ?? []).find(([input]) => input === name);
    assert.ok(registration, `${name} input is registered`);
    return registration[1];
}

/** @type {any} */
let kart;
/** @type {Entity} */
let trigger;

beforeEach(() => {
    world.reset();
    karts.clear();
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: { x: -2000, y: -900, z: 24 } }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 250, y: -520, z: 16 } }));
    world.add(new Entity({ name: "track_start_1_cp2_laps3", className: "trigger_multiple", origin: { x: 2400, y: 1088, z: 128 } }));
    trigger = world.add(new Entity({ name: "checkpoint_1_1", className: "trigger_multiple", origin: { x: 2400, y: 1200, z: 100 }, angles: { pitch: 0, yaw: 0, roll: 0 } }));
    kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetIntroSpawnPoint());
    assert.ok(kart, "setup: kart created");
});

test("a checkpoint respawns the melon at its checkpoint_spawn info_target, facing its yaw", () => {
    const target = world.add(new Entity({
        name: CheckpointSpawnName(1, 1),
        className: "info_target",
        origin: { x: 2500, y: 1300, z: 64 },
        angles: { pitch: 20, yaw: 135, roll: 5 },
    }));
    ScriptInput("checkpoint_1_1")({ caller: trigger, activator: kart.melon });
    assert.equal(kart.checkpointIndex, 1);

    RespawnKartAtCheckpoint(kart);
    const at = kart.melon.GetAbsOrigin();
    const origin = target.GetAbsOrigin();
    assert.deepEqual({ x: at.x, y: at.y }, { x: origin.x, y: origin.y });
    assert.equal(at.z, origin.z + SPAWN_UP_OFFSET); // no floor in the fake world
    assert.deepEqual(kart.melon.GetAbsAngles(), { pitch: 0, yaw: 135, roll: 0 }); // level, only the yaw
    assert.equal(kart.pawn.GetEyeAngles().yaw, 135, "the player's view turns with it");
});

test("without a checkpoint_spawn info_target the checkpoint trigger itself is the respawn point", () => {
    ScriptInput("checkpoint_1_1")({ caller: trigger, activator: kart.melon });

    RespawnKartAtCheckpoint(kart);
    const origin = trigger.GetAbsOrigin();
    assert.deepEqual(kart.melon.GetAbsOrigin(), { x: origin.x, y: origin.y, z: origin.z + TELEPORT_UP_OFFSET });
});

test("an ignored checkpoint touch doesn't move the respawn point", () => {
    world.add(new Entity({ name: CheckpointSpawnName(1, 2), className: "info_target", origin: { x: 9000, y: 9000, z: 0 } }));
    const before = kart.checkpointPosition;
    ScriptInput("checkpoint_1_2")({ caller: trigger, activator: kart.melon }); // not on track 1 yet
    assert.equal(kart.checkpointPosition, before);
});

/** A tutorial destination and the teleporter named `triggerName` leading to it. @param {string} triggerName */
function AddTeleporter(triggerName) {
    world.add(new Entity({ name: "tp_dest2_hub_back", className: "info_target", origin: { x: -1500, y: -700, z: 32 }, angles: { pitch: 0, yaw: 270, roll: 0 } }));
    return world.add(new Entity({ name: triggerName, className: "trigger_multiple" }));
}

test("a checkpoint_ teleporter makes its destination the respawn point", () => {
    const teleporter = AddTeleporter("teleport_stop_checkpoint_to_tp_dest2_hub_back");
    ScriptInput("melon_teleport")({ caller: teleporter, activator: kart.melon });
    assert.equal(kart.checkpointIndex, 0, "track progress untouched");

    kart.melon.Teleport({ position: { x: 0, y: 0, z: 0 } }); // drives on
    RespawnKartAtCheckpoint(kart);
    assert.deepEqual(kart.melon.GetAbsOrigin(), { x: -1500, y: -700, z: 32 + TELEPORT_UP_OFFSET });
    assert.equal(kart.melon.GetAbsAngles().yaw, 270);
});

test("a plain teleporter leaves the respawn point where it was", () => {
    const before = kart.checkpointPosition;
    const teleporter = AddTeleporter("teleport_stop_to_tp_dest2_hub_back");
    ScriptInput("melon_teleport")({ caller: teleporter, activator: kart.melon });
    assert.equal(kart.checkpointPosition, before);
});
