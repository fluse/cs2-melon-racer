// Rules of the generic teleporters (see TELEPORT_TRIGGER_NAME_PATTERN).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ParseTeleportTarget, ParseTeleportTrigger, TeleportExitVelocity, ViewAnglesFacing } from "../src/melon_drive/logic/teleport.js";
import { TELEPORT_KEEP_SPEED } from "../src/melon_drive/constants/index.js";

test("the destination is read from the trigger's own name", () => {
    assert.equal(ParseTeleportTarget("teleport_to_tp_dest_hub_back"), "tp_dest_hub_back");
    assert.equal(ParseTeleportTarget("teleport_to_a"), "a");
});

test("stray whitespace around the trigger name is ignored", () => {
    assert.equal(ParseTeleportTarget(" teleport_to_dest "), "dest");
});

test("names that don't follow teleport_to_<destination> are rejected", () => {
    for (const name of ["", "teleport_to_", "teleport_dest", "hub_start_trigger", "my_teleport_to_dest"]) {
        assert.equal(ParseTeleportTarget(name), undefined, JSON.stringify(name));
    }
});

test("the trigger name picks per teleporter whether the melon keeps its speed", () => {
    assert.deepEqual(ParseTeleportTrigger("teleport_stop_to_tp_dest_hub_back"), { destination: "tp_dest_hub_back", keepSpeed: false });
    assert.deepEqual(ParseTeleportTrigger("teleport_keep_to_tp_dest_hub_back"), { destination: "tp_dest_hub_back", keepSpeed: true });
    assert.deepEqual(ParseTeleportTrigger("teleport_to_tp_dest_hub_back"), { destination: "tp_dest_hub_back", keepSpeed: TELEPORT_KEEP_SPEED });
    // A destination whose own name looks like a mode stays the destination.
    assert.deepEqual(ParseTeleportTrigger("teleport_to_stop_to_x"), { destination: "stop_to_x", keepSpeed: TELEPORT_KEEP_SPEED });
    for (const name of ["teleport_stop_to_", "teleport_fast_to_dest", "teleport_stop_dest"]) {
        assert.equal(ParseTeleportTrigger(name), undefined, JSON.stringify(name));
    }
});

test("keepSpeed off arrives standing still, on keeps the horizontal speed", () => {
    assert.deepEqual(TeleportExitVelocity({ x: 300, y: 400, z: -900 }, 90, false), { x: 0, y: 0, z: 0 });
    const kept = TeleportExitVelocity({ x: 300, y: 400, z: -900 }, 0, true);
    assert.ok(Math.abs(kept.x - 500) < 1e-9 && Math.abs(kept.y) < 1e-9 && kept.z === 0);
});

test("exit velocity points along the destination's facing and never keeps falling speed", () => {
    const v = TeleportExitVelocity({ x: 300, y: 400, z: -900 }, 90);
    assert.equal(v.z, 0);
    if (TELEPORT_KEEP_SPEED) {
        assert.ok(Math.abs(v.x) < 1e-9, "yaw 90 is +y");
        assert.ok(Math.abs(v.y - 500) < 1e-9, "keeps the horizontal speed (hypot 300, 400)");
    } else {
        assert.deepEqual(v, { x: 0, y: 0, z: 0 });
    }
});

test("a melon standing still arrives standing still", () => {
    const v = TeleportExitVelocity({ x: 0, y: 0, z: 0 }, 37);
    assert.ok(Math.hypot(v.x, v.y, v.z) < 1e-9);
});

// Steering follows the view's yaw, so after a teleport the player must be
// looking the way the destination faces — otherwise they keep driving the
// old direction.
test("after a teleport the view faces the destination's yaw, keeping its pitch", () => {
    assert.deepEqual(ViewAnglesFacing({ pitch: 12, yaw: 270, roll: 5 }, 90), { pitch: 12, yaw: 90, roll: 0 });
});
