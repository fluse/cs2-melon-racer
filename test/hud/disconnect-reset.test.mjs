// The HUD keeps classes, dialog variables and input capture per player slot,
// not per player: when a player leaves, their slot's HUD state is cleared so
// whoever joins next in that slot doesn't start with the old open menu,
// finish image or moderator button — or stuck in cursor mode. Runs the real
// OnPlayerDisconnect handler against the fake engine in helpers/cs-script-mock.mjs.
import "../helpers/register-cs-script.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { world, Entity } from "../helpers/cs-script-mock.mjs";

const { RegisterKartInputs } = await import("../../src/melon_drive/kart/inputs.js");
const { SPEED_HUD_ENTITY_NAME } = await import("../../src/melon_drive/constants/index.js");

class FakeHud extends Entity {
    /** @type {string[]} */
    calls = [];
    /** @param {number} slot @param {boolean} enabled */
    SetInputCaptureEnabled(slot, enabled) {
        this.calls.push(`SetInputCaptureEnabled(${slot}, ${enabled})`);
    }
    /** @param {number} slot */
    ResetForPlayer(slot) {
        this.calls.push(`ResetForPlayer(${slot})`);
    }
}

test("a disconnecting player's HUD slot is reset, input capture off", () => {
    world.reset();
    const hud = world.add(new FakeHud({ name: SPEED_HUD_ENTITY_NAME, className: "custom_hud_layout" }));
    RegisterKartInputs();
    const [[onDisconnect]] = world.handlers.OnPlayerDisconnect;

    onDisconnect({ playerSlot: 3 });

    assert.deepEqual(hud.calls, ["SetInputCaptureEnabled(3, false)", "ResetForPlayer(3)"]);
});
