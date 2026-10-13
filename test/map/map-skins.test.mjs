// The melon skins (MELON_SKINS, kart/skin.js) against the files and the map:
// each skin's model and its user menu preview exist, the menu has exactly
// one button per skin, and every skin model is used by some entity in the
// .vmap — the script only reaches them by SetModel, and a map ships only the
// models it uses itself (place a prop with each skin in the map, e.g. on
// show in the hub).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ReadVmapEntities } from "../helpers/vmap.mjs";
import { MELON_SKINS } from "../../src/melon_drive/constants/index.js";

const addon = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const entities = ReadVmapEntities(addon("maps/melon_racer.vmap"));
const usedModels = new Set(entities.map((e) => String(e.model ?? "").replaceAll("\\", "/").toLowerCase()));

test("skins: every skin's model and menu preview exist", () => {
    for (const [skin, model] of Object.entries(MELON_SKINS)) {
        assert.ok(existsSync(addon(model)), `${skin}: ${model} is missing — run node tools/materials/make-melon-skins.mjs`);
        assert.ok(existsSync(addon(`panorama/images/custom_game/skins/skin_${skin}.png`)), `${skin}: its preview is missing — run node tools/materials/make-melon-skins.mjs`);
    }
});

// CS2's own melon has a fixed mass (2.0, not from its volume), which the
// decompiler didn't carry over — without it the melon drove heavier.
const MELON_MASS = 2.0;

test("skins: every skin model weighs the same fixed mass as CS2's melon", () => {
    for (const [skin, model] of Object.entries(MELON_SKINS)) {
        const mass = readFileSync(addon(model), "utf8").match(/mass_override\s*=\s*([\d.]+)/)?.[1];
        assert.equal(Number(mass), MELON_MASS, `${skin}: ${model} needs a PhysicsBodyMarkup with mass_override = ${MELON_MASS}`);
    }
});

test("skins: the user menu has one button per skin, and no others", () => {
    const xml = readFileSync(addon("panorama/layout/custom_game/melon_racer.xml"), "utf8");
    const buttons = [...xml.matchAll(/id="usermenu_skin_([a-z0-9_]+)"/g)].map((m) => m[1]);
    assert.deepEqual(buttons.sort(), Object.keys(MELON_SKINS).sort());
});

test("skins: every skin model is used in the map, so the map ships it", () => {
    const missing = Object.entries(MELON_SKINS).filter(([, model]) => !usedModels.has(model.toLowerCase()));
    assert.deepEqual(missing.map(([skin, model]) => `${skin} (${model})`), [], "place an entity with these models in the map (e.g. a prop_dynamic showing the skin in the hub)");
});
