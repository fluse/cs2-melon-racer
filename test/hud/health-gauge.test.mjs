// The health bar and the wall-jump dots in the speed panel, CSS only: every
// panel the script toggles is transparent by default and gets exactly one
// class ("On", which makes it white) — hiding white panels by a class always
// left them faintly visible in-game —, and a class is only sent when what it shows changed — several classes
// toggled on one panel every tick never showed in-game. None of it inside a
// CSS 3D transform (class changes from script never showed in there either).
// (How many are filled: HealthBarState, test/health/health.test.mjs, and
// JumpDotFills, test/hud/jump-dots.test.mjs.)
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, Entity } from "../helpers/cs-script-mock.mjs";

const { UpdateHealthHud, UpdateJumpHud } = await import("../../src/melon_drive/hud/index.js");
const { HEALTH_BAR_SEGMENTS, HUD_RESEND_SECONDS, MELON_MAX_HEALTH, WALL_JUMP_CHARGES, JUMP_DOT_FILL_STEPS, SPEED_HUD_ENTITY_NAME } = await import("../../src/melon_drive/constants/index.js");

const root = new URL("../../", import.meta.url);
const xml = readFileSync(new URL("panorama/layout/custom_game/speedometer.xml", root), "utf8");
const css = readFileSync(new URL("panorama/styles/custom_game/speedometer.css", root), "utf8");

/** A custom_hud_layout that records every class call. */
class FakeHud extends Entity {
    constructor() {
        super({ name: SPEED_HUD_ENTITY_NAME, className: "custom_hud_layout" });
        /** @type {[string, string, boolean][]} */
        this.calls = [];
        /** @type {Map<string, boolean>} "<panel>/<class>" -> set */
        this.classes = new Map();
    }
    SetHasClassForPlayer(slot, panel, cls, on) {
        this.calls.push([panel, cls, on]);
        this.classes.set(`${panel}/${cls}`, on);
    }
    Off(panel) { return this.classes.get(`${panel}/On`) !== true; }
}

/** @type {FakeHud} */
let hud;
beforeEach(() => {
    if (hud) {
        hud.valid = false; // GetSpeedHud caches the layout while it's valid
    }
    world.reset();
    hud = world.add(new FakeHud());
});

test("speedometer.xml: the outline container with the fill bar inside, one piece per segment, no images, no class set up front", () => {
    for (let i = 0; i < HEALTH_BAR_SEGMENTS; i++) {
        assert.ok(xml.includes(`<Panel id="health_seg_${i}" class="HealthSeg" />`), `health_seg_${i} missing`);
    }
    assert.ok(!xml.includes(`id="health_seg_${HEALTH_BAR_SEGMENTS}"`), "no piece beyond HEALTH_BAR_SEGMENTS");
    assert.ok(/<Panel id="health_bar" class="HealthBar">\s*<Panel id="health_fill" class="HealthFill">/.test(xml), "the fill bar sits inside the outline container");
    assert.ok(!xml.includes("health_gauge/"), "health bar images are gone — CSS only");
});

test("speedometer.xml: every jump dot is an outline with one fill inside", () => {
    for (let i = 0; i < WALL_JUMP_CHARGES; i++) {
        assert.ok(xml.includes(`<Panel class="JumpDot"><Panel id="jump_dot_${i}" class="JumpDotFill" /></Panel>`), `jump_dot_${i} missing`);
    }
    assert.ok(!xml.includes(`id="jump_dot_${WALL_JUMP_CHARGES}"`), "no dot beyond WALL_JUMP_CHARGES");
});

test("speedometer.css: transparent by default, On makes white, no transitions or effects there", () => {
    assert.ok(/\.HealthSeg \{\s*width: [^;]+;\s*height: [^;]+;\s*background-color: #00000000;/.test(css), ".HealthSeg must be transparent by default");
    assert.ok(/\.HealthSeg\.On \{\s*background-color: #ffffff;\s*\}/.test(css), ".HealthSeg.On missing");
    assert.ok(/\.JumpDotFill \{[^}]*background-color: #00000000;\s*&\.On \{\s*background-color: #ffffff;\s*\}/.test(css), ".JumpDotFill transparent + .On white missing");
    const start = css.indexOf("/* Wall-jump charges: three dots");
    const end = css.indexOf(".SpeedReadout {");
    assert.ok(start >= 0 && end > start, "sanity: found the jump dot / health bar CSS");
    assert.ok(!/transition|blur|shadow|wash-color/.test(css.slice(start, end).replace(/\/\*.*?\*\//gs, "")), "no transition, blur, shadow or tint on the bar or dots");
});

test("no CSS 3D transforms in the HUD — class changes from script don't show inside them", () => {
    assert.ok(!/rotate[XY]\(|perspective:/.test(css), "rotateX/rotateY/perspective in speedometer.css");
});

test("health bar: pieces beyond the health left are Off, and nothing is re-sent while it stays the same", () => {
    const kart = { health: MELON_MAX_HEALTH, wallJumpCharge: WALL_JUMP_CHARGES };
    UpdateHealthHud(0, kart);
    for (let i = 0; i < HEALTH_BAR_SEGMENTS; i++) {
        assert.equal(hud.Off(`health_seg_${i}`), false, `health_seg_${i} shown at full health`);
    }
    assert.ok(hud.calls.every(([, cls]) => cls === "On"), "only the On class is ever toggled");

    hud.calls = [];
    UpdateHealthHud(0, kart);
    assert.equal(hud.calls.length, 0, "unchanged health sends nothing");

    kart.health = MELON_MAX_HEALTH / 2;
    UpdateHealthHud(0, kart);
    for (let i = 0; i < HEALTH_BAR_SEGMENTS; i++) {
        assert.equal(hud.Off(`health_seg_${i}`), i >= HEALTH_BAR_SEGMENTS / 2, `health_seg_${i} at half health`);
    }

    kart.health = 0;
    UpdateHealthHud(0, kart);
    for (let i = 0; i < HEALTH_BAR_SEGMENTS; i++) {
        assert.equal(hud.Off(`health_seg_${i}`), true, `health_seg_${i} hidden at no health`);
    }
});

test("health bar and jump dots: their whole state is sent again every HUD_RESEND_SECONDS", () => {
    const kart = { health: MELON_MAX_HEALTH, wallJumpCharge: WALL_JUMP_CHARGES };
    UpdateHealthHud(0, kart);
    UpdateJumpHud(0, kart);
    hud.calls = [];
    world.time += HUD_RESEND_SECONDS / 2;
    UpdateHealthHud(0, kart);
    UpdateJumpHud(0, kart);
    assert.equal(hud.calls.length, 0, "nothing changed, not due yet: nothing sent");
    world.time += HUD_RESEND_SECONDS;
    UpdateHealthHud(0, kart);
    UpdateJumpHud(0, kart);
    for (let i = 0; i < WALL_JUMP_CHARGES; i++) {
        assert.ok(hud.calls.some(([panel, cls, on]) => panel === `jump_dot_${i}` && cls === "On" && on), `jump_dot_${i} sent again`);
    }
    assert.ok(hud.calls.some(([panel]) => panel === "health_seg_0"), "health pieces sent again");
});

test("jump dots: only a ready charge is filled, nothing while it refills, and nothing is re-sent while it stays the same", () => {
    const kart = { health: MELON_MAX_HEALTH, wallJumpCharge: WALL_JUMP_CHARGES - 0.5 };
    UpdateJumpHud(0, kart);
    for (let i = 0; i < WALL_JUMP_CHARGES - 1; i++) {
        assert.equal(hud.Off(`jump_dot_${i}`), false, `dot ${i} ready: filled`);
    }
    assert.equal(hud.Off(`jump_dot_${WALL_JUMP_CHARGES - 1}`), true, "the refilling dot: only its outline");
    assert.ok(hud.calls.every(([, cls]) => cls === "On"), "only the On class is ever toggled");

    hud.calls = [];
    kart.wallJumpCharge = WALL_JUMP_CHARGES - 0.3;
    UpdateJumpHud(0, kart);
    assert.equal(hud.calls.length, 0, "refilling further changes nothing on screen, sends nothing");

    kart.wallJumpCharge = WALL_JUMP_CHARGES;
    UpdateJumpHud(0, kart);
    assert.deepEqual(hud.calls, [[`jump_dot_${WALL_JUMP_CHARGES - 1}`, "On", true]], "only the dot that became ready is sent");
});
