// Checks the Hammer I/O wiring in maps/melon_racer.vmap against what the
// script expects: every RunScriptInput names an input the script actually
// registers, and the hub's start-modal inputs only come from the hub's own
// start trigger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { ReadVmapConnections, ReadVmapEntities } from "./helpers/vmap.mjs";
import { ParseTeleportTarget } from "../src/melon_drive/logic/teleport.js";
import { HUB_TRIGGER_NAME } from "../src/melon_drive/constants/index.js";

const vmapPath = fileURLToPath(new URL("../maps/melon_racer.vmap", import.meta.url));
const connections = ReadVmapConnections(vmapPath);
const entityNames = new Set(ReadVmapEntities(vmapPath).map((e) => String(e.targetname ?? "").trim()));
const scriptInputs = connections.filter((c) => c.input === "RunScriptInput");

/** @param {{ classname: string, targetname: string, origin: number[] | undefined }} c */
function Describe(c) {
    const at = c.origin ? ` at (${c.origin.map((v) => Math.round(v)).join(", ")})` : "";
    return `${c.classname} "${c.targetname || "<unnamed>"}"${at}`;
}

// Everything src/melon_drive/ registers via Instance.OnScriptInput.
const KNOWN_INPUT = /^(checkpoint_\d+_\d+|finish_\d+|hub_enter|hub_leave|hub_teleport|melon_paint|melon_teleport|heal_enter|heal_leave|lift_enter|lift_leave|camera_enter|camera_leave)$/;

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
