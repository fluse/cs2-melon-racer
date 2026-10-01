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
const source = readdirSync(srcDir, { recursive: true })
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(new URL(f.replaceAll("\\", "/"), srcDir), "utf8"))
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

test("every button in speedometer.xml has a click handler in the script", () => {
    const buttonIds = [...layout.matchAll(/<Button\s+id="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(buttonIds.includes("usermenu_tutorial_button"), "sanity: the tutorial button is in the layout");
    const exact = new Set([...source.matchAll(/buttonId === "([^"]+)"/g)].map((m) => m[1]));
    const prefixes = [...source.matchAll(/buttonId\.startsWith\("([^"]+)"\)/g)].map((m) => m[1]);
    const unhandled = buttonIds.filter((id) => !exact.has(id) && !prefixes.some((p) => id.startsWith(p)));
    assert.deepEqual(unhandled, []);
});

// Numbered panels the script addresses by a template ("cp_slot_<i>") aren't
// caught by the literal-id check above.
test("the checkpoint strip has CHECKPOINT_HUD_SLOTS slots, each with its line", async () => {
    const { CHECKPOINT_HUD_SLOTS } = await import("../src/melon_drive/constants/index.js");
    const missing = [];
    for (let i = 0; i < CHECKPOINT_HUD_SLOTS; i++) {
        for (const id of [`cp_slot_${i}`, `cp_link_${i}`]) {
            if (!layoutIds.has(id)) missing.push(id);
        }
    }
    assert.deepEqual(missing, []);
    assert.ok(!layoutIds.has(`cp_slot_${CHECKPOINT_HUD_SLOTS}`), "no slot the script never updates");
});
