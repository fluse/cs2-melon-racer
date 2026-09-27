// Rules of the generic teleporters (see TELEPORT_TRIGGER_NAME_PATTERN).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ParseTeleportTarget, TeleportExitVelocity, ViewAnglesFacing } from "../src/melon_drive/logic/teleport.js";
import { TELEPORT_KEEP_SPEED } from "../src/melon_drive/constants.js";

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
