// The user menu's profile (top of the right column): its rules
// (hud/profile/logic.js — name, skin, level and XP, every stat with its rank), that
// speedometer.xml has an image per skin and a tile per stat, and the profile
// against the fake engine (filled in on opening, the big melon follows the skin).
import "../helpers/register-cs-script.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";
import { BuildProfile } from "../../src/melon_drive/hud/profile/logic.js";
import { FormatStat } from "../../src/melon_drive/race/stats/logic.js";
import { XpToNextLevel } from "../../src/melon_drive/race/level/logic.js";
import {
    MELON_SKINS,
    MELON_SKIN_DEFAULT,
    MELON_SKIN_NAMES,
    MELON_SKIN_LEVELS,
    XP_BAR_SEGMENTS,
    STAT_SLIDES,
    SAVE_DATA_STATS_KEY,
    MELON_TEMPLATE_NAME,
    HUB_SPAWN_NAME,
    SPEED_HUD_ENTITY_NAME,
} from "../../src/melon_drive/constants/index.js";

const XML = readFileSync(new URL("../../panorama/layout/custom_game/speedometer.xml", import.meta.url), "utf8");
const A = { key: "0:Anna", name: "Anna" };
const B = { key: "1:Ben", name: "Ben" };
const [FIRST, SECOND] = STAT_SLIDES;

test("profile: the player's name and skin name, every stat in STAT_SLIDES order formatted like the leaderboards", () => {
    const profile = BuildProfile({ self: A, players: [A, B], skin: "gold", xp: 0, statTotals: { [FIRST.key]: { Anna: 125 } } });
    assert.equal(profile.name, "Anna");
    assert.equal(profile.skin, MELON_SKIN_NAMES.gold.toUpperCase());
    assert.deepEqual(profile.stats.map((s) => s.key), STAT_SLIDES.map((s) => s.key));
    assert.equal(profile.stats[0].value, FormatStat(FIRST, 125));
    assert.equal(profile.stats[1].value, FormatStat(SECOND, 0), "no total yet reads as 0");
});

test("ranks: among everyone with a total, saved players included, ties shared; none while the total is 0", () => {
    const totals = { [FIRST.key]: { Anna: 5, Ben: 9, Gone: 20 }, [SECOND.key]: { Anna: 3, Ben: 3 } };
    const profile = BuildProfile({ self: A, players: [A, B], skin: MELON_SKIN_DEFAULT, xp: 0, statTotals: totals });
    assert.equal(profile.stats[0].rank, "#3", "behind Ben and a player who isn't on the map");
    assert.equal(profile.stats[1].rank, "#1", "a tie shares the rank");
    assert.equal(profile.stats[2].rank, "", "nothing yet: no rank");
});

test("level and XP: the level, the XP into it, the bar filled in proportion", () => {
    const xp = XpToNextLevel(1) + XpToNextLevel(2) / 2;
    const profile = BuildProfile({ self: A, players: [A], skin: MELON_SKIN_DEFAULT, xp, statTotals: {} });
    assert.equal(profile.level, "LV 2");
    assert.equal(profile.xp, `${Math.floor(XpToNextLevel(2) / 2)} / ${XpToNextLevel(2)} XP`);
    assert.equal(profile.xpFill, Math.floor(XP_BAR_SEGMENTS / 2));
});

test("an unknown skin shows the default's name", () => {
    assert.equal(BuildProfile({ self: A, players: [A], skin: "gone", xp: 0, statTotals: {} }).skin, MELON_SKIN_NAMES[MELON_SKIN_DEFAULT].toUpperCase());
});

test("speedometer.xml: a profile image per skin, a tile per stat; every skin's name matches its button in the grid", () => {
    assert.deepEqual(Object.keys(MELON_SKIN_NAMES), Object.keys(MELON_SKINS), "a name for every skin");
    for (const key of Object.keys(MELON_SKINS)) {
        assert.ok(XML.includes(`id="usermenu_profile_skin_${key}"`), `profile image for ${key}`);
        const button = XML.match(new RegExp(`id="usermenu_skin_${key}"[\\s\\S]*?class="SkinName" text="([^"]*)"`));
        assert.equal(button?.[1], MELON_SKIN_NAMES[key], `the grid's name for ${key}`);
    }
    for (const slide of STAT_SLIDES) {
        assert.ok(XML.includes(`id="usermenu_profile_stat_${slide.key}"`), `tile for ${slide.key}`);
    }
    for (let i = 0; i < XP_BAR_SEGMENTS; i++) {
        assert.ok(XML.includes(`id="usermenu_profile_xp_${i}"`), `XP bar segment ${i}`);
    }
    assert.ok(!XML.includes(`id="usermenu_profile_xp_${XP_BAR_SEGMENTS}"`), "no more segments than XP_BAR_SEGMENTS");
});

test("the profile: filled in when the menu opens, its big melon following the skin picked", async () => {
    const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
    const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
    const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
    const { SetUserMenuOpen } = await import("../../src/melon_drive/hud/user-menu.js");
    const { HandleHudClick } = await import("../../src/melon_drive/hud/inputs.js");
    world.reset();
    karts.clear();
    world.saveData = JSON.stringify({ [SAVE_DATA_STATS_KEY]: { Anna: { [SECOND.key]: 4 }, Ben: { [SECOND.key]: 7 } } });
    const hud = world.add(new FakeHud(SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 16 } }));
    const kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0, playerName: "Anna" })), GetHubSpawnPoint());

    SetUserMenuOpen(0, kart, true);
    assert.equal(hud.Variable(0, "usermenu_profile", "profile_name"), "Anna");
    assert.equal(hud.Variable(0, "usermenu_profile", "profile_skin"), MELON_SKIN_NAMES[MELON_SKIN_DEFAULT].toUpperCase());
    assert.equal(hud.Variable(0, `usermenu_profile_stat_${SECOND.key}`, "value"), FormatStat(SECOND, 4));
    assert.equal(hud.Variable(0, `usermenu_profile_stat_${SECOND.key}`, "rank"), "#2", "Ben's saved total is ahead");
    assert.ok(!hud.Has(0, `usermenu_profile_skin_${MELON_SKIN_DEFAULT}`, "Hidden"));
    assert.ok(hud.Has(0, "usermenu_profile_skin_gold", "Hidden"));

    const free = Object.keys(MELON_SKINS).find((key) => key !== MELON_SKIN_DEFAULT && (MELON_SKIN_LEVELS[key] ?? 1) <= 1);
    HandleHudClick(0, `usermenu_skin_${free}`);
    assert.ok(!hud.Has(0, `usermenu_profile_skin_${free}`, "Hidden"), "the picked skin shows at once");
    assert.ok(hud.Has(0, `usermenu_profile_skin_${MELON_SKIN_DEFAULT}`, "Hidden"));
    assert.equal(hud.Variable(0, "usermenu_profile", "profile_skin"), MELON_SKIN_NAMES[String(free)].toUpperCase());

    // Level and XP: a new player is level 1, nothing into it, the bar empty.
    assert.equal(hud.Variable(0, "usermenu_profile", "profile_level"), "LV 1");
    assert.equal(hud.Variable(0, "usermenu_profile", "profile_xp"), `0 / ${XpToNextLevel(1)} XP`);
    assert.ok(!hud.Has(0, "usermenu_profile_xp_0", "On"));
});
