// A track's config comes from the map's trigger names: laps from
// start_<trackId>[_laps<M>], the checkpoint count from its
// checkpoint_<trackId>_<index> triggers. Runs the real GetTrackConfig
// against the fake engine in helpers/cs-script-mock.mjs.
import "./helpers/register-cs-script.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { world, Entity } from "./helpers/cs-script-mock.mjs";

const { GetTrackConfig, GetTrackOrder } = await import("../src/melon_drive/race/track-config.js");
const { DEFAULT_LAPS_TO_WIN } = await import("../src/melon_drive/constants/index.js");

/** @param {string} name @param {string} [className] */
function Add(name, className = "trigger_multiple") {
    world.add(new Entity({ name, className }));
}

// One test only: GetTrackConfig caches the first non-empty scan for the
// rest of the module's life, like a map's lifetime in-game.
test("tracks are read from start_ and checkpoint_ trigger names", () => {
    world.reset();
    Add("start_1_laps3"); // loop track
    Add("checkpoint_1_1");
    Add("checkpoint_1_2");
    Add("checkpoint_1_3");
    Add("start_2"); // point-to-point, default laps
    Add("checkpoint_2_1");
    Add("finish_2");
    Add("start_4"); // no checkpoints at all
    Add("checkpoint_spawn_1_1", "info_target"); // a respawn point, not a checkpoint
    Add("checkpoint_1_9", "info_target"); // only triggers count
    Add("checkpoint_3_1"); // no start_3 -> no track 3

    const config = GetTrackConfig();
    assert.deepEqual(config[1], { checkpoints: 3, lapsToWin: 3, startEntityName: "start_1_laps3" });
    assert.deepEqual(config[2], { checkpoints: 1, lapsToWin: DEFAULT_LAPS_TO_WIN, startEntityName: "start_2" });
    assert.deepEqual(config[4], { checkpoints: 0, lapsToWin: DEFAULT_LAPS_TO_WIN, startEntityName: "start_4" });
    assert.deepEqual(GetTrackOrder(), [1, 2, 4]);
});
