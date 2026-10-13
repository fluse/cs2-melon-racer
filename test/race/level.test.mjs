// Leveling: the rules (race/level/logic.js — XP in the save data, levels,
// what a heat or a Grand Prix earns, the level-up message), the skins it
// unlocks (kart/skin-logic.js), and against the fake engine: XP earned and
// saved, a locked skin not pickable until the level is reached, the
// level-up message held back mid-heat.
import "../helpers/register-cs-script.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";
import { readFileSync } from "node:fs";
import { AddXp, GetXpTotals, GrandPrixXp, HeatFinishXp, LevelOf, LevelProgress, LevelUpText, XpBarFill, XpGainReasonText, XpGainView, XpToNextLevel } from "../../src/melon_drive/race/level/logic.js";
import { IsSkinUnlocked, SkinUnlockLevel, SkinsUnlockedBetween } from "../../src/melon_drive/kart/skin-logic.js";
import { NewGrandPrix, BeginGrandPrixHeat, RecordHeatFinish } from "../../src/melon_drive/race/grand-prix/logic.js";
import {
    MELON_SKINS,
    MELON_SKIN_DEFAULT,
    MELON_SKIN_LEVELS,
    MELON_SKIN_NAMES,
    SAVE_DATA_XP_KEY,
    XP_TIME_TRIAL_FINISH,
    XP_NEW_BEST,
    XP_HEAT_FINISH,
    XP_HEAT_PLACE_BONUS,
    XP_GRAND_PRIX_FINISH,
    XP_GRAND_PRIX_PLACE_BONUS,
    XP_PER_MINUTE_PLAYED,
    LEVEL_UP_HUD_SECONDS,
    XP_GAIN_HUD_SECONDS,
    XP_BAR_SEGMENTS,
    XP_GAIN_REASONS_SHOWN,
    XP_REASON_TIME_TRIAL_FINISH,
    XP_REASON_NEW_BEST,
    XP_REASON_PERFECT_BOUNCE,
    MELON_TEMPLATE_NAME,
    HUB_SPAWN_NAME,
    SPEED_HUD_ENTITY_NAME,
} from "../../src/melon_drive/constants/index.js";

test("levels: each one takes more XP than the last; the progress into a level", () => {
    for (let level = 1; level < 30; level++) {
        assert.ok(XpToNextLevel(level + 1) > XpToNextLevel(level));
    }
    assert.deepEqual(LevelProgress(0), { level: 1, into: 0, needed: XpToNextLevel(1) });
    assert.equal(LevelOf(XpToNextLevel(1) - 1), 1);
    assert.equal(LevelOf(XpToNextLevel(1)), 2, "exactly enough is the next level");
    assert.deepEqual(LevelProgress(XpToNextLevel(1) + XpToNextLevel(2) + 10), { level: 3, into: 10, needed: XpToNextLevel(3) });
    assert.equal(XpBarFill({ into: 0, needed: 100 }, 20), 0);
    assert.equal(XpBarFill({ into: 50, needed: 100 }, 20), 10);
    assert.equal(XpBarFill({ into: 99.9, needed: 100 }, 20), 19, "full only on the level-up");
});

test("XP in the save data: junk dropped; adding ignores an empty name and non-positive amounts", () => {
    assert.deepEqual(GetXpTotals({ [SAVE_DATA_XP_KEY]: { Anna: 120, Ben: -3, Cleo: "9", Dan: NaN } }), { Anna: 120 });
    assert.deepEqual(GetXpTotals({}), {});
    const totals = { Anna: 10 };
    assert.equal(AddXp(totals, "Anna", 5), true);
    assert.equal(AddXp(totals, "", 5), false);
    assert.equal(AddXp(totals, "Anna", 0), false);
    assert.equal(AddXp(totals, "Anna", -4), false);
    assert.deepEqual(totals, { Anna: 15 });
});

test("a Grand Prix earns clearly more than time trials: every heat finish beats a time trial's, the Grand Prix's end more again", () => {
    assert.equal(HeatFinishXp(1), XP_HEAT_FINISH + XP_HEAT_PLACE_BONUS[0]);
    assert.equal(HeatFinishXp(XP_HEAT_PLACE_BONUS.length + 1), XP_HEAT_FINISH, "no bonus past the bonus places");
    assert.ok(HeatFinishXp(99) > XP_TIME_TRIAL_FINISH);
    assert.equal(GrandPrixXp(1), XP_GRAND_PRIX_FINISH + XP_GRAND_PRIX_PLACE_BONUS[0]);
    assert.equal(GrandPrixXp(99), XP_GRAND_PRIX_FINISH);
    assert.ok(GrandPrixXp(1) > GrandPrixXp(2) && GrandPrixXp(2) > GrandPrixXp(3) && GrandPrixXp(3) > GrandPrixXp(4));
    assert.ok(GrandPrixXp(99) > XP_TIME_TRIAL_FINISH + XP_NEW_BEST);
});

test("skins: three free from the start, the default among them; each locked one needs a level", () => {
    assert.deepEqual(Object.keys(MELON_SKIN_LEVELS).sort(), Object.keys(MELON_SKINS).sort(), "a level for every skin, no other");
    const free = Object.keys(MELON_SKINS).filter((skin) => IsSkinUnlocked(skin, 1));
    assert.equal(free.length, 3);
    assert.ok(free.includes(MELON_SKIN_DEFAULT));
    for (const skin of Object.keys(MELON_SKINS)) {
        if (SkinUnlockLevel(skin) > 1) {
            assert.ok(!IsSkinUnlocked(skin, SkinUnlockLevel(skin) - 1), `${skin} locked below its level`);
        }
        assert.ok(IsSkinUnlocked(skin, SkinUnlockLevel(skin)));
    }
    const [locked] = Object.keys(MELON_SKINS).filter((skin) => SkinUnlockLevel(skin) > 1);
    const level = SkinUnlockLevel(locked);
    assert.ok(SkinsUnlockedBetween(level - 1, level).includes(locked));
    assert.ok(!SkinsUnlockedBetween(level, level + 1).includes(locked), "already unlocked before");
    assert.deepEqual(SkinsUnlockedBetween(0, 1).sort(), free.sort());
});

test("the skin grid is sorted by level: the free skins first, the highest level last", () => {
    const levels = Object.keys(MELON_SKINS).map(SkinUnlockLevel);
    assert.deepEqual(levels, [...levels].sort((x, y) => x - y), `MELON_SKINS order: ${Object.keys(MELON_SKINS).join(", ")}`);
});

test("the level-up message: the level, and the skins it unlocked by name", () => {
    assert.deepEqual(LevelUpText({ level: 4, skins: [] }), { level: "LEVEL 4", skins: "" });
    assert.equal(LevelUpText({ level: 5, skins: ["camo"] }).skins, `NEW SKIN: ${MELON_SKIN_NAMES.camo.toUpperCase()}`);
    assert.equal(LevelUpText({ level: 5, skins: ["camo", "golf"] }).skins, `NEW SKINS: ${MELON_SKIN_NAMES.camo.toUpperCase()}, ${MELON_SKIN_NAMES.golf.toUpperCase()}`);
});

test("in the game: XP earned and saved, a locked skin pickable only from its level, the level-up shown after a heat", async () => {
    const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
    const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
    const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
    const { SetUserMenuOpen } = await import("../../src/melon_drive/hud/user-menu.js");
    const { HandleHudClick } = await import("../../src/melon_drive/hud/inputs.js");
    const { UpdateLevelUpHud } = await import("../../src/melon_drive/hud/level-up-panel.js");
    const { FinishRun } = await import("../../src/melon_drive/race/time-trial/time-trial.js");
    const level = await import("../../src/melon_drive/race/level/level.js");
    world.reset();
    karts.clear();
    const hud = world.add(new FakeHud(SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 16 } }));
    const kart = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0, playerName: "Anna" })), GetHubSpawnPoint());
    const other = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 1, playerName: "Ben" })), GetHubSpawnPoint());
    assert.equal(level.GetKartLevel(kart), 1, "no XP yet: level 1");

    // A locked skin: marked with the level it needs, a click changes nothing.
    const locked = Object.keys(MELON_SKINS).find((skin) => SkinUnlockLevel(skin) > 1) ?? "";
    SetUserMenuOpen(0, kart, true);
    assert.ok(hud.Has(0, `usermenu_skin_${locked}`, "SkinLocked"));
    assert.equal(hud.Variable(0, `usermenu_skin_${locked}`, "skin_lock"), `LV ${SkinUnlockLevel(locked)}`);
    assert.ok(!hud.Has(0, `usermenu_skin_${MELON_SKIN_DEFAULT}`, "SkinLocked"));
    HandleHudClick(0, `usermenu_skin_${locked}`);
    assert.equal(kart.melon.GetModelName(), MELON_SKINS[MELON_SKIN_DEFAULT]);

    // A time trial's finish with a new best.
    kart.runStartTime = world.time - 30;
    FinishRun(kart, 1);
    assert.equal(level.GetKartXp(kart), XP_TIME_TRIAL_FINISH + XP_NEW_BEST);

    // Time on the server: XP_PER_MINUTE_PLAYED a minute, spread over the ticks.
    const before = level.GetKartXp(other);
    level.UpdateLevel(world.time, 30);
    assert.equal(level.GetKartXp(other) - before, XP_PER_MINUTE_PLAYED / 2);

    // Enough XP for the locked skin's level, mid-heat: the level-up waits.
    let needed = 0;
    for (let l = 1; l < SkinUnlockLevel(locked); l++) needed += XpToNextLevel(l);
    kart.racing = true;
    level.GrantXp(kart, needed - level.GetKartXp(kart), "test");
    assert.equal(level.GetKartLevel(kart), SkinUnlockLevel(locked));
    assert.equal(kart.levelUp?.level, SkinUnlockLevel(locked));
    assert.ok(kart.levelUp?.skins.includes(locked));
    UpdateLevelUpHud(0, kart, world.time);
    assert.ok(hud.Has(0, "levelup_panel", "Hidden"), "not in the middle of a heat");
    kart.finished = true;
    UpdateLevelUpHud(0, kart, world.time);
    assert.ok(!hud.Has(0, "levelup_panel", "Hidden"), "once finished");
    assert.equal(hud.Variable(0, "levelup_panel", "levelup_level"), `LEVEL ${SkinUnlockLevel(locked)}`);
    assert.ok(!hud.Has(0, "levelup_skins", "Hidden"));
    UpdateLevelUpHud(0, kart, world.time + LEVEL_UP_HUD_SECONDS);
    assert.ok(hud.Has(0, "levelup_panel", "Hidden"), "gone after LEVEL_UP_HUD_SECONDS");
    assert.equal(kart.levelUp, undefined);

    // Now the skin can be picked; the open menu took the lock off.
    kart.racing = false;
    kart.finished = false;
    SetUserMenuOpen(0, kart, true);
    assert.ok(!hud.Has(0, `usermenu_skin_${locked}`, "SkinLocked"));
    HandleHudClick(0, `usermenu_skin_${locked}`);
    assert.equal(kart.melon.GetModelName(), MELON_SKINS[locked]);

    // Saved per player name.
    level.SaveXp();
    assert.equal(JSON.parse(world.saveData)[SAVE_DATA_XP_KEY].Anna, level.GetKartXp(kart));
});

test("a Grand Prix run to its end: XP by place for the racers still in it; nothing for a cancelled one", async () => {
    const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
    const level = await import("../../src/melon_drive/race/level/level.js");
    const { PlayerKey } = await import("../../src/melon_drive/race/grand-prix/grand-prix.js");
    const anna = [...karts.values()].find((k) => k.pawn.GetPlayerController()?.GetPlayerName() === "Anna");
    const ben = [...karts.values()].find((k) => k.pawn.GetPlayerController()?.GetPlayerName() === "Ben");
    assert.ok(anna && ben, "the karts from the test before");
    const racers = [anna, ben].map((k) => ({ key: PlayerKey(k), name: k.pawn.GetPlayerController()?.GetPlayerName() ?? "" }));
    const gp = NewGrandPrix(racers, 1);
    BeginGrandPrixHeat(gp, 1);
    RecordHeatFinish(gp, 1, racers[1], 60); // Ben wins
    RecordHeatFinish(gp, 1, racers[0], 70);
    const [annaBefore, benBefore] = [level.GetKartXp(anna), level.GetKartXp(ben)];
    level.GrantGrandPrixXp({ ...gp, cancelled: true }, [anna, ben]);
    assert.equal(level.GetKartXp(anna), annaBefore, "cancelled: nothing");
    level.GrantGrandPrixXp(gp, [anna, ben]);
    assert.equal(level.GetKartXp(ben) - benBefore, GrandPrixXp(1));
    assert.equal(level.GetKartXp(anna) - annaBefore, GrandPrixXp(2));
});

test("XP notifier view: the gain, the level, the bar's fill before and after", () => {
    const view = XpGainView(10, 10 + XP_NEW_BEST, XP_NEW_BEST, XP_BAR_SEGMENTS);
    assert.equal(view.amount, `+${XP_NEW_BEST} XP`);
    assert.equal(view.level, "LV 1");
    assert.equal(view.xp, `${10 + XP_NEW_BEST} / ${XpToNextLevel(1)} XP`);
    assert.equal(view.oldFill, XpBarFill(LevelProgress(10), XP_BAR_SEGMENTS));
    assert.equal(view.newFill, XpBarFill(LevelProgress(10 + XP_NEW_BEST), XP_BAR_SEGMENTS));
    const up = XpGainView(XpToNextLevel(1) - 5, XpToNextLevel(1) + 5, 10, XP_BAR_SEGMENTS);
    assert.equal(up.level, "LV 2");
    assert.equal(up.oldFill, 0, "a new level: the whole fill is the gain");
    assert.equal(XpGainView(0, 0.4, 0.4, XP_BAR_SEGMENTS).amount, "+1 XP", "never +0");
});

test("XP notifier: shown for a reward (adding up), not for the time on the server; gone after XP_GAIN_HUD_SECONDS", async () => {
    const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
    const { UpdateXpGainHud } = await import("../../src/melon_drive/hud/xp-gain-panel.js");
    const level = await import("../../src/melon_drive/race/level/level.js");
    const hud = world.entities.find((e) => e instanceof FakeHud);
    const kart = [...karts.values()].find((k) => k.pawn.GetPlayerController()?.GetPlayerName() === "Ben");
    assert.ok(hud && kart, "the HUD and karts from the tests before");
    kart.xpGain = undefined;
    level.UpdateLevel(world.time, 1);
    assert.equal(kart.xpGain, undefined, "time on the server: no notifier");

    const before = level.GetKartXp(kart);
    level.GrantXp(kart, XP_TIME_TRIAL_FINISH, XP_REASON_TIME_TRIAL_FINISH);
    level.GrantXp(kart, XP_NEW_BEST, XP_REASON_NEW_BEST);
    UpdateXpGainHud(1, kart, world.time);
    assert.ok(!hud.Has(1, "xpgain_panel", "Hidden"));
    const view = XpGainView(before, level.GetKartXp(kart), XP_TIME_TRIAL_FINISH + XP_NEW_BEST, XP_BAR_SEGMENTS);
    assert.equal(hud.Variable(1, "xpgain_panel", "xpgain_amount"), view.amount, "both gains added up");
    assert.equal(hud.Variable(1, "xpgain_panel", "xpgain_reason"), `${XP_REASON_TIME_TRIAL_FINISH} · ${XP_REASON_NEW_BEST}`, "and why");
    assert.equal(hud.Variable(1, "xpgain_panel", "xpgain_level"), view.level);
    for (let i = 0; i < XP_BAR_SEGMENTS; i++) {
        assert.equal(hud.Has(1, `xpgain_old_${i}`, "On"), i < view.oldFill);
        assert.equal(hud.Has(1, `xpgain_new_${i}`, "On"), i >= view.oldFill && i < view.newFill);
    }
    UpdateXpGainHud(1, kart, world.time + XP_GAIN_HUD_SECONDS);
    assert.ok(hud.Has(1, "xpgain_panel", "Hidden"));
    assert.equal(kart.xpGain, undefined);
});

test("the layout has one XP notifier segment pair per XP_BAR_SEGMENTS", () => {
    const xml = readFileSync(new URL("../../panorama/layout/custom_game/melon_racer.xml", import.meta.url), "utf8");
    for (let i = 0; i < XP_BAR_SEGMENTS; i++) {
        assert.ok(xml.includes(`id="xpgain_old_${i}"`) && xml.includes(`id="xpgain_new_${i}"`), `segment ${i}`);
    }
    assert.ok(!xml.includes(`id="xpgain_old_${XP_BAR_SEGMENTS}"`));
});

test("XP notifier reasons: in order, repeats counted, the rest cut off", () => {
    assert.equal(XpGainReasonText([]), "");
    assert.equal(XpGainReasonText([XP_REASON_NEW_BEST]), XP_REASON_NEW_BEST);
    assert.equal(
        XpGainReasonText([XP_REASON_PERFECT_BOUNCE, XP_REASON_TIME_TRIAL_FINISH, XP_REASON_PERFECT_BOUNCE]),
        `${XP_REASON_PERFECT_BOUNCE} \u00d72 \u00b7 ${XP_REASON_TIME_TRIAL_FINISH}`,
    );
    const many = Array.from({ length: XP_GAIN_REASONS_SHOWN + 1 }, (_, i) => `R${i}`);
    assert.ok(XpGainReasonText(many).endsWith("+ MORE"));
    assert.ok(!XpGainReasonText(many).includes(`R${XP_GAIN_REASONS_SHOWN}`));
});
