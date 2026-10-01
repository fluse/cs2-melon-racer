// The melon's outline glow (src/melon_drive/kart/look.js) against the fake
// engine: on by default, green until painted and then in the paint color, switched per kart from the user
// menu, and off while the melon is broken.
import "./helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity } from "./helpers/cs-script-mock.mjs";

const { SetKartPaintColor } = await import("../src/melon_drive/kart/look.js");
const { ShowMelonPaint, HideMelonGlow, IsMelonGlowOn, SetMelonGlow } = await import("../src/melon_drive/kart/look.js");
const { MELON_GLOW_ENABLED, MELON_GLOW_UNPAINTED_COLOR, COLOR_PRESETS } = await import("../src/melon_drive/constants/index.js");

/** @param {boolean} [melonGlow] */
function Kart(melonGlow = true) {
    const melon = world.add(new Entity({ className: "prop_physics" }));
    return /** @type {any} */ ({ melon, paintColor: COLOR_PRESETS.red, breaking: false, melonGlow });
}

beforeEach(() => world.reset());

test("glow: on by default, green until painted, then in the chosen color", () => {
    assert.equal(MELON_GLOW_ENABLED, true, "this test checks the map-wide switch on");
    const kart = Kart();
    ShowMelonPaint(kart);
    assert.deepEqual(kart.melon.glow, MELON_GLOW_UNPAINTED_COLOR);
    SetKartPaintColor(kart, COLOR_PRESETS.blue);
    assert.deepEqual(kart.melon.glow, COLOR_PRESETS.blue);
    SetKartPaintColor(kart, COLOR_PRESETS.white);
    assert.deepEqual(kart.melon.glow, COLOR_PRESETS.white, "white chosen on purpose glows white, not green");
});

test("glow: switching it off/on only changes that kart's melon", () => {
    const mine = Kart(), other = Kart();
    ShowMelonPaint(mine);
    ShowMelonPaint(other);

    SetMelonGlow(mine, false);
    assert.equal(IsMelonGlowOn(mine), false);
    assert.equal(mine.melon.IsGlowing(), false);
    assert.equal(other.melon.IsGlowing(), true, "the other player's melon keeps its glow");

    ShowMelonPaint(mine); // e.g. a repaint or respawn keeps it off
    assert.equal(mine.melon.IsGlowing(), false);

    SetMelonGlow(mine, true);
    assert.equal(mine.melon.IsGlowing(), true);
});

test("glow: a broken melon stays dark until it respawns", () => {
    const kart = Kart();
    ShowMelonPaint(kart);
    kart.breaking = true;
    HideMelonGlow(kart);
    SetMelonGlow(kart, true); // toggled while broken
    assert.equal(kart.melon.IsGlowing(), false);
    kart.breaking = false;
    ShowMelonPaint(kart);
    assert.equal(kart.melon.IsGlowing(), true);
});
