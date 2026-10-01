// The wall-bounce guide line (src/melon_drive/fx/prediction/prediction.js) against the
// fake engine: off by default, drawn only once the player switches it on
// in the user menu.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity } from "./helpers/cs-script-mock.mjs";

const { UpdatePrediction, IsPredictionOn, SetPrediction } = await import("../src/melon_drive/fx/prediction/prediction.js");
const { PREDICTION_MIN_SPEED, PREDICTION_RENDER_MODE } = await import("../src/melon_drive/constants/index.js");

/** A kart as kart/spawn.js creates it, moving fast enough for a line. */
function MovingKart() {
    const melon = world.add(new Entity({ className: "prop_physics" }));
    melon.velocity = { x: PREDICTION_MIN_SPEED * 3, y: 0, z: 0 };
    return /** @type {any} */ ({ melon, pawn: new Entity(), locked: false, breaking: false, predictionLine: false });
}

beforeEach(() => world.reset());

test("guide line: off by default, drawn only once switched on", () => {
    assert.equal(PREDICTION_RENDER_MODE, "debug", "this test checks the DebugLine mode");
    const kart = MovingKart();
    assert.equal(IsPredictionOn(kart), false);
    UpdatePrediction(kart, 1 / 64);
    assert.equal(world.debugLines.length, 0, "nothing drawn while off");

    SetPrediction(kart, true);
    UpdatePrediction(kart, 1 / 64);
    assert.ok(world.debugLines.length > 0, "drawn once on");

    SetPrediction(kart, false);
    world.debugLines = [];
    UpdatePrediction(kart, 1 / 64);
    assert.equal(world.debugLines.length, 0, "nothing drawn after switching off again");
});
