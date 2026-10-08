// The hub window's route cards are generated from the map by
// tools/make-route-icons.mjs (icon images + route names): every
// track in maps/melon_racer.vmap must have both, or the tool wasn't re-run
// after adding a route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ReadVmapEntities } from "../helpers/vmap.mjs";
import { START_TRIGGER_NAME_PATTERN } from "../../src/melon_drive/constants/index.js";
import { ROUTE_NAMES } from "../../src/melon_drive/hud/hub-modal/routes.js";

const vmapPath = fileURLToPath(new URL("../../maps/melon_racer.vmap", import.meta.url));
const trackIds = ReadVmapEntities(vmapPath)
    .map((e) => START_TRIGGER_NAME_PATTERN.exec(String(e.targetname ?? "").trim())?.[1])
    .filter(Boolean)
    .map(Number);

test("every track has a route name and an icon — else run node tools/make-route-icons.mjs", () => {
    assert.ok(trackIds.length > 0, "sanity: found the tracks");
    const missing = trackIds
        .filter((id) => !ROUTE_NAMES[id] || !existsSync(new URL(`../../panorama/images/custom_game/routes/route_${id}.png`, import.meta.url)))
        .map((id) => `track ${id}`);
    assert.deepEqual(missing, []);
});
