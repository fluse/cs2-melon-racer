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

// The hub and the routes are the map's walls and floors: excluded from vis
// ("visexclude"), they don't block sight lines and everything behind them is
// drawn. The melon prefab (only the melon and its break pieces) doesn't
// count, nor do gates/obstacles nested inside a route.
const VIS_EXEMPT_PREFABS = ["maps/prefabs/melon.vmap"];

test("every hub/route prefab placed in the map is a vis contributor", () => {
    const excluded = prefabs
        .filter((p) => p.placedIn === "maps/melon_racer.vmap" && !VIS_EXEMPT_PREFABS.includes(p.attrs.targetMapPath))
        .filter((p) => p.attrs.visexclude)
        .map((p) => `${p.attrs.targetMapPath} [${p.node}] — excluded from vis, make it a vis contributor`);
    assert.deepEqual(excluded, []);
});
