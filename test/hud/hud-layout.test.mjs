// Checks speedometer.xml against the script and the image folder: every
// panel id the script drives by a fixed name exists in the layout, and
// every image the layout shows exists on disk — a typo in either shows
// nothing in-game, with no error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
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

test("every button in speedometer.xml has a click handler in the script", async () => {
    await import("../helpers/register-cs-script.mjs");
    const { IsHandledButton } = await import("../../src/melon_drive/hud/inputs.js");
    const buttonIds = [...layout.matchAll(/<Button\s+id="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(buttonIds.includes("usermenu_tutorial_button"), "sanity: the tutorial button is in the layout");
    assert.ok(!IsHandledButton("no_such_button"), "sanity: not everything counts as handled");
    assert.deepEqual(buttonIds.filter((id) => !IsHandledButton(id)), []);
});

// The tables in hud/user-menu.js address panels by id from a variable, which
// the literal-id check above can't see.
test("every user menu toggle and developer page in hud/user-menu.js exists in speedometer.xml", async () => {
    await import("../helpers/register-cs-script.mjs");
    const { USER_MENU_TOGGLES, USER_MENU_PAGES } = await import("../../src/melon_drive/hud/user-menu.js");
    const ids = [...Object.keys(USER_MENU_TOGGLES), ...Object.values(USER_MENU_PAGES).map((p) => p.panel), "usermenu_main_page"];
    assert.deepEqual(ids.filter((id) => !layoutIds.has(id)), []);
    for (const [id, { variable }] of Object.entries(USER_MENU_TOGGLES)) {
        assert.ok(layout.includes(`{s:${variable}}`), `${id}'s pill shows {s:${variable}}`);
    }
});

// Numbered panels the script addresses by a template ("cp_slot_<i>") aren't
// caught by the literal-id check above.
test("the checkpoint strip has CHECKPOINT_HUD_SLOTS slots, each with its line", async () => {
    const { CHECKPOINT_HUD_SLOTS } = await import("../../src/melon_drive/constants/index.js");
    const missing = [];
    for (let i = 0; i < CHECKPOINT_HUD_SLOTS; i++) {
        for (const id of [`cp_slot_${i}`, `cp_link_${i}`]) {
            if (!layoutIds.has(id)) missing.push(id);
        }
    }
    assert.deepEqual(missing, []);
    assert.ok(!layoutIds.has(`cp_slot_${CHECKPOINT_HUD_SLOTS}`), "no slot the script never updates");
});

// Regression: a stray </Panel> made resourcecompiler reject the whole
// layout ("Start-end tags mismatch") — and the HUD then stays the old one.
test("speedometer.xml's tags are balanced", () => {
    const stack = [];
    const xml = layout.replace(/<!--[\s\S]*?-->/g, "");
    for (const m of xml.matchAll(/<(\/?)([A-Za-z]+)\b[^>]*?(\/?)>/g)) {
        const [, closing, name, selfClosing] = m;
        if (selfClosing) {
            continue;
        }
        if (!closing) {
            stack.push(name);
            continue;
        }
        const line = xml.slice(0, m.index).split("\n").length;
        assert.equal(stack.pop(), name, `</${name}> on line ${line} closes the wrong tag`);
    }
    assert.deepEqual(stack, [], "unclosed tags");
});

// A misplaced closing tag can leave one button inside another and the XML
// still well-formed: the inner one's clicks then go to the outer one.
test("no button in speedometer.xml sits inside another", () => {
    const open = [];
    const nested = [];
    for (const m of layout.matchAll(/<(\/?)Button\b[^>]*?(?:id="([^"]*)")?[^>]*?(\/?)>/g)) {
        const [, closing, id = "?", selfClosing] = m;
        if (closing) {
            open.pop();
        } else {
            if (open.length > 0) {
                nested.push(`${id} inside ${open[open.length - 1]}`);
            }
            if (!selfClosing) {
                open.push(id);
            }
        }
    }
    assert.deepEqual(nested, []);
});
