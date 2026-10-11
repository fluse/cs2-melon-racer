// The user menu's skin grid in pages (kart/skin-logic.js): MELON_SKINS_PER_PAGE
// skins each, in MELON_SKINS order, ◀ ▶ wrapping around — and speedometer.xml
// laid out the same way, every page with all of its places.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SkinPageCount, SkinPageLabel, SkinPageOf, StepSkinPage } from "../../src/melon_drive/kart/skin-logic.js";
import { MELON_SKINS, MELON_SKINS_PER_PAGE } from "../../src/melon_drive/constants/index.js";

const KEYS = Object.keys(MELON_SKINS);

test("pages: MELON_SKINS_PER_PAGE skins each, in MELON_SKINS order", () => {
    assert.equal(SkinPageCount(), Math.ceil(KEYS.length / MELON_SKINS_PER_PAGE));
    assert.equal(SkinPageOf(KEYS[0]), 0);
    assert.equal(SkinPageOf(KEYS[KEYS.length - 1]), SkinPageCount() - 1);
    if (KEYS.length > MELON_SKINS_PER_PAGE) {
        assert.equal(SkinPageOf(KEYS[MELON_SKINS_PER_PAGE - 1]), 0);
        assert.equal(SkinPageOf(KEYS[MELON_SKINS_PER_PAGE]), 1);
    }
    assert.equal(SkinPageOf("no_such_skin"), 0);
});

test("paging wraps around both ways; the indicator shows page and page count", () => {
    const last = SkinPageCount() - 1;
    assert.equal(StepSkinPage(last, 1), 0);
    assert.equal(StepSkinPage(0, -1), last);
    assert.equal(SkinPageLabel(0), `1 / ${SkinPageCount()}`);
});

test("speedometer.xml: one panel per page, holding that page's skins in order, three rows of three", () => {
    const xml = readFileSync(new URL("../../panorama/layout/custom_game/speedometer.xml", import.meta.url), "utf8");
    const starts = [...xml.matchAll(/<Panel id="usermenu_skinpage_(\d+)"/g)];
    assert.deepEqual(starts.map((m) => Number(m[1])), Array.from({ length: SkinPageCount() }, (_, i) => i), "a panel for every page, none more");
    starts.forEach((start, page) => {
        const end = starts[page + 1]?.index ?? xml.indexOf("usermenu_glow_button", start.index);
        const body = xml.slice(start.index, end);
        const skins = [...body.matchAll(/id="usermenu_skin_([a-z0-9_]+)"/g)].map((m) => m[1]);
        assert.deepEqual(skins, KEYS.slice(page * MELON_SKINS_PER_PAGE, (page + 1) * MELON_SKINS_PER_PAGE), `page ${page + 1}`);
        const places = (body.match(/class="SkinButton/g) ?? []).length;
        assert.equal(places, MELON_SKINS_PER_PAGE, `page ${page + 1}: every place there, empty ones as SkinSlotEmpty`);
    });
    for (const id of ["usermenu_skinpager", "usermenu_skinpage_prev", "usermenu_skinpage_next"]) {
        assert.ok(xml.includes(`id="${id}"`), id);
    }
});
