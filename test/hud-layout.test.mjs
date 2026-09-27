// Checks speedometer.xml against the script and the image folder: every
// panel id the script drives by a fixed name exists in the layout, and
// every image the layout shows exists on disk — a typo in either shows
// nothing in-game, with no error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const layout = readFileSync(new URL("panorama/layout/custom_game/speedometer.xml", root), "utf8");
const layoutIds = new Set([...layout.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

const srcDir = new URL("src/melon_drive/", root);
const source = readdirSync(srcDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(new URL(f, srcDir), "utf8"))
    .join("\n");

test("every HUD panel id the script sets classes/text on exists in speedometer.xml", () => {
    const used = new Set(
        [...source.matchAll(/(?:SetHasClassForPlayer|SetDialogVariableStringForPlayer)\(\s*slot,\s*"([a-z0-9_]+)"/g)].map((m) => m[1])
    );
    assert.ok(used.has("finish_image"), "sanity: the finish image is driven from script");
    const missing = [...used].filter((id) => !layoutIds.has(id));
    assert.deepEqual(missing, []);
});

test("every image speedometer.xml shows exists in panorama/images", () => {
    const srcs = [...layout.matchAll(/src="file:\/\/\{images\}\/([^"]+)"/g)].map((m) => m[1]);
    assert.ok(srcs.includes("custom_game/word-finish.png"), "sanity: the finish image is in the layout");
    const missing = srcs.filter((p) => !existsSync(fileURLToPath(new URL(`panorama/images/${p}`, root))));
    assert.deepEqual(missing, []);
});
