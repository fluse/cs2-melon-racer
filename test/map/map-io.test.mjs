// Checks the Hammer I/O wiring in maps/melon_racer.vmap against what the
// script expects: every RunScriptInput names an input the script actually
// registers, and the hub's start-modal inputs only come from the hub's own
// start trigger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { ReadVmapConnections, ReadVmapEntities } from "../helpers/vmap.mjs";
import { ParseTeleportTarget } from "../../src/melon_drive/zones/teleport/logic.js";
import { HUB_TRIGGER_NAME, CHECKPOINT_SPAWN_NAME_PATTERN, START_TRIGGER_NAME_PATTERN, START_SPAWN_NAME_PATTERN, CHECKPOINT_TRIGGER_NAME_PATTERN } from "../../src/melon_drive/constants/index.js";

const vmapPath = fileURLToPath(new URL("../../maps/melon_racer.vmap", import.meta.url));
const connections = ReadVmapConnections(vmapPath);
const entityNames = new Set(ReadVmapEntities(vmapPath).map((e) => String(e.targetname ?? "").trim()));
const scriptInputs = connections.filter((c) => c.input === "RunScriptInput");

/** @param {{ classname: string, targetname: string, origin: number[] | undefined }} c */
function Describe(c) {
    const at = c.origin ? ` at (${c.origin.map((v) => Math.round(v)).join(", ")})` : "";
    return `${c.classname} "${c.targetname || "<unnamed>"}"${at}`;
}

// Everything src/melon_drive/ registers via Instance.OnScriptInput.
const KNOWN_INPUT = /^(start_\d+|checkpoint_\d+_\d+|finish_\d+|hub_enter|hub_leave|hub_teleport|melon_paint|melon_teleport|melon_break|melon_respawn|heal_enter|heal_leave|lift_enter|lift_leave|camera_enter|camera_leave|jump_pad_enter|jump_pad_leave|water_enter|water_leave)$/;

test("every RunScriptInput names an input the script registers", () => {
    const unknown = scriptInputs.filter((c) => !KNOWN_INPUT.test(c.param)).map((c) => `${Describe(c)} -> "${c.param}"`);
    assert.deepEqual(unknown, []);
});

// Regression: two pass-through triggers in the intro fired hub_enter, so
// driving through them showed the "start race" modal — and, lacking a
// hub_leave, it never closed. Getting to the hub is hub_teleport's job.
test(`only "${HUB_TRIGGER_NAME}" fires hub_enter / hub_leave`, () => {
    const wrong = scriptInputs
        .filter((c) => (c.param === "hub_enter" || c.param === "hub_leave") && c.targetname.trim() !== HUB_TRIGGER_NAME)
        .map((c) => `${Describe(c)} fires ${c.param} — use hub_teleport to send melons to the hub`);
    assert.deepEqual(wrong, []);
});

test(`"${HUB_TRIGGER_NAME}" fires hub_enter on touch and hub_leave on untouch`, () => {
    const own = scriptInputs.filter((c) => c.targetname.trim() === HUB_TRIGGER_NAME);
    assert.ok(own.some((c) => c.output === "OnStartTouch" && c.param === "hub_enter"), "missing OnStartTouch -> hub_enter");
    assert.ok(own.some((c) => c.output === "OnEndTouch" && c.param === "hub_leave"), "missing OnEndTouch -> hub_leave");
});

// Generic teleporters: the destination lives in the trigger's name
// (teleport_to_<destination>), so a typo there or a missing destination
// entity makes the teleporter silently do nothing in-game.
test("every melon_teleport comes from a teleport_to_<destination> trigger whose destination exists", () => {
    const bad = scriptInputs
        .filter((c) => c.param === "melon_teleport")
        .flatMap((c) => {
            const destination = ParseTeleportTarget(c.targetname);
            if (!destination) {
                return [`${Describe(c)} fires melon_teleport but isn't named teleport_to_<destination>`];
            }
            return entityNames.has(destination) ? [] : [`${Describe(c)} -> no entity named "${destination}"`];
        });
    assert.deepEqual(bad, []);
});

test("every teleport_to_* trigger actually fires melon_teleport", () => {
    const firing = new Set(scriptInputs.filter((c) => c.param === "melon_teleport").map((c) => c.targetname.trim()));
    const silent = [...entityNames].filter((name) => ParseTeleportTarget(name) && !firing.has(name));
    assert.deepEqual(silent, []);
});

// Found in the map: a teleporter with only "Clients" ticked. The melon is a
// prop_physics, so without "Physics Objects" (spawnflag 8) the trigger
// never fires for it and the teleporter silently does nothing.
const SPAWNFLAG_PHYSICS_OBJECTS = 8;
test('every trigger that feeds the script melon inputs has "Physics Objects" ticked', () => {
    const triggers = new Map(
        ReadVmapEntities(vmapPath)
            .filter((e) => String(e.classname).startsWith("trigger_"))
            .map((e) => [String(e.targetname ?? ""), e])
    );
    const bad = scriptInputs
        .filter((c) => String(c.classname).startsWith("trigger_") && c.target === "melon_drive_script")
        .filter((c) => {
            const flags = Number(triggers.get(c.targetname)?.spawnflags ?? 0);
            return (flags & SPAWNFLAG_PHYSICS_OBJECTS) === 0;
        })
        .map((c) => `${Describe(c)} (${c.param}) — tick "Physics Objects" in its spawnflags`);
    assert.deepEqual([...new Set(bad)], []);
});

// Tracks: the script reads a track's laps from its start trigger's name and
// counts its checkpoints from the checkpoint triggers' names (it can't see
// which parameter an output fires) — so a trigger named differently from
// the input it fires makes the track's finish unreachable or too easy.
test("start_<trackId> is fired only by the start_<trackId>[_laps<M>] trigger", () => {
    const bad = scriptInputs
        .filter((c) => /^start_\d+$/.test(c.param))
        .filter((c) => {
            const m = START_TRIGGER_NAME_PATTERN.exec(c.targetname.trim());
            return !m || `start_${m[1]}` !== c.param;
        })
        .map((c) => `${Describe(c)} fires ${c.param} — name it ${c.param} or ${c.param}_laps<M>`);
    assert.deepEqual(bad, []);
});

test("every start_<trackId> trigger fires start_<trackId>", () => {
    const fired = new Set(scriptInputs.map((c) => `${c.targetname.trim()} -> ${c.param}`));
    const silent = [...entityNames]
        .map((name) => [name, START_TRIGGER_NAME_PATTERN.exec(name)])
        .filter(([name, m]) => m && !fired.has(`${name} -> start_${m[1]}`))
        .map(([name, m]) => `"${name}" — add OnStartTouch -> RunScriptInput start_${m[1]}`);
    assert.deepEqual(silent, []);
});

// start_spawn_<t> is only used for a track that has a start_<t> trigger — a
// typo makes the heat silently line racers up on the trigger instead.
test("every start_spawn_<trackId> belongs to a track with a start trigger", () => {
    const tracks = new Set([...entityNames].map((name) => START_TRIGGER_NAME_PATTERN.exec(name)?.[1]).filter(Boolean));
    const orphans = [...entityNames]
        .map((name) => START_SPAWN_NAME_PATTERN.exec(name))
        .filter((m) => m && !tracks.has(m[1]))
        .map((m) => `"${m[0]}" — no trigger named start_${m[1]} or start_${m[1]}_laps<M>`);
    assert.deepEqual(orphans, []);
});

// start_ is a reserved prefix: anything else named start_* is a typo of one
// of the two (found in the map: "start_pawn_1").
test("every start_* entity is a start trigger or a start_spawn", () => {
    const bad = [...entityNames]
        .filter((name) => name.startsWith("start_") && !START_TRIGGER_NAME_PATTERN.test(name) && !START_SPAWN_NAME_PATTERN.test(name))
        .map((name) => `"${name}" — start_<trackId>[_laps<M>] (trigger) or start_spawn_<trackId> (info_target)?`);
    assert.deepEqual(bad, []);
});

test("checkpoint triggers are named exactly like the checkpoint they fire", () => {
    const bad = scriptInputs
        .filter((c) => CHECKPOINT_TRIGGER_NAME_PATTERN.test(c.param) && c.targetname.trim() !== c.param)
        .map((c) => `${Describe(c)} fires ${c.param} — the checkpoint count is read from trigger names`);
    assert.deepEqual(bad, []);
});

test("each track's checkpoint triggers run 1..N without gaps", () => {
    /** @type {Map<string, Set<number>>} */
    const perTrack = new Map();
    for (const name of entityNames) {
        const m = CHECKPOINT_TRIGGER_NAME_PATTERN.exec(name);
        if (m) {
            perTrack.set(m[1], (perTrack.get(m[1]) ?? new Set()).add(Number(m[2])));
        }
    }
    const gaps = [...perTrack].flatMap(([track, indices]) => {
        const missing = [];
        for (let i = 1; i <= Math.max(...indices); i++) {
            if (!indices.has(i)) {
                missing.push(`track ${track}: no checkpoint_${track}_${i}`);
            }
        }
        return missing;
    });
    assert.deepEqual(gaps, []);
});

// Checkpoint respawn points: an info_target checkpoint_spawn_<t>_<i> is only
// used by the checkpoint_<t>_<i> input — a typo in either name makes the
// melon silently respawn at the trigger instead.
test("every checkpoint_spawn_<trackId>_<index> belongs to a checkpoint the map fires", () => {
    const fired = new Set(scriptInputs.map((c) => c.param));
    const orphans = [...entityNames]
        .map((name) => name.match(CHECKPOINT_SPAWN_NAME_PATTERN))
        .filter((m) => m && !fired.has(`checkpoint_${m[1]}_${m[2]}`))
        .map((m) => `"${m[0]}" — no trigger fires RunScriptInput checkpoint_${m[1]}_${m[2]}`);
    assert.deepEqual(orphans, []);
});
