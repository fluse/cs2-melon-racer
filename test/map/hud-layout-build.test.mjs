// The HUD layouts in panorama/layout/custom_game/ are built from their parts
// in src/panorama/ (build-panorama.mjs): the file the game reads has to be
// what the parts make, or an edit to a part never reached it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layouts, BuildLayout, LayoutOutputPath } from "../../build-panorama.mjs";

for (const name of layouts) {
    test(`panorama/layout/custom_game/${name}.xml is built from src/panorama/${name}/ (npm run build)`, async () => {
        const built = await BuildLayout(name);
        const current = readFileSync(LayoutOutputPath(name), "utf8").replace(/\r\n/g, "\n");
        assert.ok(built === current, `${name}.xml is out of date — run npm run build`);
    });
}

// The map's custom_hud_layout (speed_hud) loads one of them — not a layout
// that's been renamed or removed since. The .vmap is binary, but the asset
// path is stored as plain text in it.
test("the map's custom_hud_layout loads a layout built here", () => {
    const vmap = readFileSync(new URL("../../maps/melon_racer.vmap", import.meta.url)).toString("latin1");
    const used = [...new Set(vmap.match(/panorama\/layout\/custom_game\/[\w-]+\.vxml/g) ?? [])];
    const built = layouts.map(name => `panorama/layout/custom_game/${name}.vxml`);
    assert.ok(used.length > 0, "no custom_hud_layout with a layout in maps/melon_racer.vmap");
    for (const layout of used) {
        assert.ok(built.includes(layout), `maps/melon_racer.vmap loads ${layout} — set the custom_hud_layout's layout to one of ${built.join(", ")}`);
    }
});
