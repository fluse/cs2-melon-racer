// Checks the Hammer I/O wiring in maps/melon_racer.vmap against what the
// script expects: every RunScriptInput names an input the script actually
// registers, and the hub's start-modal inputs only come from the hub's own
// start trigger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { ReadVmapConnections } from "./helpers/vmap.mjs";
import { HUB_TRIGGER_NAME } from "../src/melon_drive/constants.js";

const connections = ReadVmapConnections(fileURLToPath(new URL("../maps/melon_racer.vmap", import.meta.url)));
const scriptInputs = connections.filter((c) => c.input === "RunScriptInput");

/** @param {{ classname: string, targetname: string, origin: number[] | undefined }} c */
function Describe(c) {
    const at = c.origin ? ` at (${c.origin.map((v) => Math.round(v)).join(", ")})` : "";
    return `${c.classname} "${c.targetname || "<unnamed>"}"${at}`;
}

// Everything src/melon_drive/ registers via Instance.OnScriptInput.
const KNOWN_INPUT = /^(checkpoint_\d+_\d+|finish_\d+|hub_enter|hub_leave|hub_teleport|melon_paint)$/;

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
