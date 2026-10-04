// Checks the prefabs placed in maps/melon_racer.vmap (and nested in each
// other): "Fix Up Entity Names" must stay off. With it on, Hammer renames
// every entity inside the prefab on compile (prefixes it with the instance's
// name), so the names the script looks up — start_<trackId>, start_spawn,
// checkpoint_<trackId>_<index>, hub_start_trigger, ... — no longer match and
// the triggers silently do nothing in-game. A prefab is set to its track
// through its map variables instead (docs/mapping-api/04-tracks.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { ReadVmapPrefabs } from "../helpers/vmap.mjs";

const prefabs = ReadVmapPrefabs(fileURLToPath(new URL("../../maps/melon_racer.vmap", import.meta.url)));

test("sanity: the map places prefabs", () => {
    assert.ok(prefabs.length > 0);
});

test('no prefab instance has "Fix Up Entity Names" ticked', () => {
    const fixedUp = prefabs
        .filter((p) => p.attrs.fixupEntityNames)
        .map((p) => {
            const at = p.attrs.origin ? ` at (${p.attrs.origin.map((v) => Math.round(v)).join(", ")})` : "";
            const name = p.attrs.targetName ? ` "${p.attrs.targetName}"` : "";
            return `${p.attrs.targetMapPath}${name}${at} [${p.node}] in ${p.placedIn} — untick "Fix Up Entity Names", it renames the entities the script looks up`;
        });
    assert.deepEqual(fixedUp, []);
});
