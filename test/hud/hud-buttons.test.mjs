// Every button click in the HUD (hud/inputs.js, OnCustomHudClicked) against
// the fake engine in helpers/cs-script-mock.mjs: the hub modal's start, close
// and moderator-only cancel buttons, and the user menu's rows — each acting
// only for the player who clicked, and refusing what it mustn't do.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";

const { karts, SetModeratorSlot } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const flow = await import("../../src/melon_drive/race/heat/race-flow.js");
const { SetUserMenuOpen, SetUserMenuPage, USER_MENU_TOGGLES, USER_MENU_PAGES } = await import("../../src/melon_drive/hud/user-menu.js");
const { MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, INTRO_SPAWN_NAME, SPEED_HUD_ENTITY_NAME, RacePhase, COLOR_PRESETS, MELON_MAX_HEALTH } = await import("../../src/melon_drive/constants/index.js");
const C = await import("../../src/melon_drive/constants/index.js");
await import("../../src/melon_drive/index.js"); // registers OnCustomHudClicked

const HUB = { x: 250, y: -520, z: 16 };
const INTRO = { x: -2000, y: -900, z: 24 };

/** @type {FakeHud} */
let hud;
/** @type {any} */
let a;
/** @type {any} */
let b;

/** Player `slot` clicks the button `buttonId` in `layout` (default: the melon HUD). */
function Click(slot, buttonId, layout = hud) {
    const [[onClick]] = world.handlers.OnCustomHudClicked;
    onClick({ layout, buttonId, player: { GetPlayerSlot: () => slot } });
}

/** @param {any} kart */
function HorizontalSpot(kart) {
    const p = kart.melon.GetAbsOrigin();
    return [p.x, p.y];
}

beforeEach(() => {
    hud?.Remove(); // GetSpeedHud caches the layout while it's valid
    world.reset();
    karts.clear();
    SetModeratorSlot(undefined);
    flow.RestoreRaceFlowSnapshot({ phase: RacePhase.HUB, activeTrackId: undefined, phaseEndTime: 0 });
    hud = world.add(new FakeHud(SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: HUB }));
    world.add(new Entity({ name: INTRO_SPAWN_NAME, className: "info_player_start", origin: INTRO }));
    world.add(new Entity({ name: "start_1", className: "trigger_multiple", origin: { x: 3000, y: 0, z: 0 } }));
    a = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 0 })), GetHubSpawnPoint()); // the moderator: first in
    b = SetUpPlayerKart(world.add(new CSPlayerPawn({ slot: 1 })), GetHubSpawnPoint());
});

test("clicks from another layout are ignored", () => {
    a.inHub = true;
    Click(0, "hub_start_button", world.add(new FakeHud("some_other_layout")));
    assert.equal(flow.phase, RacePhase.HUB);
});

test("start button: starts a heat with whoever stands in the hub", () => {
    a.inHub = true;
    Click(1, "hub_start_button"); // anyone may click it
    assert.equal(flow.phase, RacePhase.COUNTDOWN);
    assert.equal(a.racing, true);
    assert.equal(b.racing, false);
});

test("close button: hides the modal for that player only, who still stands in the hub", () => {
    a.inHub = b.inHub = true;
    a.hubModalOpen = b.hubModalOpen = true;
    Click(0, "hub_close_button");
    assert.equal(a.hubModalOpen, false);
    assert.equal(hud.Has(0, "hub_modal", "Hidden"), true);
    assert.equal(a.inHub, true, "still pulled into the next heat");
    assert.equal(b.hubModalOpen, true);
});

test("cancel button: only the moderator can abort a running heat", () => {
    a.inHub = b.inHub = true;
    flow.TryStartRace();

    Click(1, "hub_abort_button");
    assert.equal(flow.phase, RacePhase.COUNTDOWN, "not the moderator");

    Click(0, "hub_abort_button");
    assert.equal(flow.phase, RacePhase.HUB);
    assert.equal(a.racing, false);
    assert.equal(b.racing, false);
});

test("user menu close button closes it and gives the mouse back", () => {
    SetUserMenuOpen(0, a, true);
    assert.equal(hud.inputCapture.get(0), true);
    Click(0, "usermenu_close_button");
    assert.equal(a.userMenuOpen, false);
    assert.equal(hud.Has(0, "user_menu", "Hidden"), true);
    assert.equal(hud.inputCapture.get(0), false);
});

test("respawn button: back at the respawn point, whole — but not while breaking or race-locked", () => {
    const away = { x: 7000, y: 7000, z: 0 };
    a.melon.Teleport({ position: away });
    a.health = 10;

    a.locked = true;
    Click(0, "usermenu_respawn_button");
    assert.deepEqual(HorizontalSpot(a), [away.x, away.y], "locked: on the grid or finished");
    a.locked = false;

    a.breaking = true;
    Click(0, "usermenu_respawn_button");
    assert.deepEqual(HorizontalSpot(a), [away.x, away.y], "breaking: respawns on its own");
    a.breaking = false;

    SetUserMenuOpen(0, a, true);
    Click(0, "usermenu_respawn_button");
    assert.deepEqual(HorizontalSpot(a), [a.checkpointPosition.x, a.checkpointPosition.y]);
    assert.equal(a.health, MELON_MAX_HEALTH);
    assert.equal(a.userMenuOpen, false, "the menu closes");
});

test("hub button: just this racer leaves the heat, the others keep racing", () => {
    SetUserMenuOpen(0, a, true);
    assert.equal(hud.Variable(0, "usermenu_hub_button", "hub_label"), "Return to Hub", "not in a race");
    SetUserMenuOpen(0, a, false);
    a.inHub = b.inHub = true;
    flow.TryStartRace();
    SetUserMenuOpen(0, a, true);
    assert.equal(hud.Variable(0, "usermenu_hub_button", "hub_label"), "Exit Race", "signed up for the heat");

    Click(0, "usermenu_hub_button");
    assert.equal(a.racing, false);
    assert.equal(a.userMenuOpen, false);
    assert.deepEqual(HorizontalSpot(a), [HUB.x, HUB.y]);
    assert.equal(b.racing, true);
    assert.equal(flow.phase, RacePhase.COUNTDOWN);
    SetUserMenuOpen(0, a, true);
    assert.equal(hud.Variable(0, "usermenu_hub_button", "hub_label"), "Return to Hub", "out of it again");
});

test("tutorial button: leaves the heat and goes to intro_spawn, which becomes the respawn point", () => {
    a.inHub = true;
    flow.TryStartRace();
    Click(0, "usermenu_tutorial_button");
    assert.equal(a.racing, false);
    assert.equal(a.trackId, undefined);
    assert.deepEqual(HorizontalSpot(a), [INTRO.x, INTRO.y]);
    assert.deepEqual([a.checkpointPosition.x, a.checkpointPosition.y], [INTRO.x, INTRO.y]);
});

test("toggle buttons switch that player's own setting and show ON/OFF", () => {
    const toggles = [
        ["usermenu_glow_button", "glow_state", "melonGlow"],
        ["usermenu_prediction_button", "prediction_state", "predictionLine"],
        ["usermenu_collisiondebug_button", "collisiondebug_state", "collisionDebug"],
    ];
    for (const [button, variable, field] of toggles) {
        const before = Boolean(a[field]);
        Click(0, button);
        assert.equal(Boolean(a[field]), !before, `${button} switches it`);
        assert.equal(hud.Variable(0, button, variable), before ? "OFF" : "ON");
        assert.equal(hud.Has(0, button, "ToggleOn"), !before);
        assert.equal(Boolean(b[field]), field === "melonGlow", `${button} leaves the other player alone`);
        Click(0, button);
        assert.equal(Boolean(a[field]), before, `${button} switches it back`);
    }
});

test("start in tutorial button: saved per player name, ON by default, OFF sends their next join to the hub", async () => {
    const { IsStartInTutorialOn } = await import("../../src/melon_drive/kart/join-spot.js");
    assert.equal(IsStartInTutorialOn(a), true, "on by default");
    Click(0, "usermenu_jointutorial_button");
    assert.equal(IsStartInTutorialOn(a), false);
    assert.equal(hud.Variable(0, "usermenu_jointutorial_button", "jointutorial_state"), "OFF");
    assert.equal(hud.Has(0, "usermenu_jointutorial_button", "ToggleOn"), false);
    assert.equal(IsStartInTutorialOn(b), true, "the other player's untouched");
    assert.equal(JSON.parse(world.saveData)[C.SAVE_DATA_PLAYER_SETTINGS_KEY][a.pawn.GetPlayerController().GetPlayerName()].startInTutorial, false, "in the save data");
    Click(0, "usermenu_jointutorial_button");
    assert.equal(IsStartInTutorialOn(a), true);
    assert.equal(hud.Variable(0, "usermenu_jointutorial_button", "jointutorial_state"), "ON");
});

test("free look button: switching it on closes the menu, switching it off doesn't open it", () => {
    SetUserMenuOpen(0, a, true);
    Click(0, "usermenu_freelook_button");
    assert.equal(a.freeLook, true);
    assert.equal(hud.Variable(0, "usermenu_freelook_button", "freelook_state"), "ON");
    assert.equal(a.userMenuOpen, false, "the mouse looks around right away");

    Click(0, "usermenu_freelook_button");
    assert.equal(a.freeLook, false);
    assert.equal(a.userMenuOpen, false);
});

test("free look: a ghost avatar from template_spectator_hat hangs on the flying pawn, gone again when it's off or the player leaves", async () => {
    const { DropKart } = await import("../../src/melon_drive/core/kart-registry.js");
    world.add(new PointTemplate({ name: C.SPECTATOR_HAT_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_dynamic", origin: { x: 500, y: 0, z: 0 } })] }));
    Click(0, "usermenu_freelook_button");
    const [hat] = a.spectatorHat ?? [];
    assert.ok(hat?.IsValid(), "spawned");
    assert.equal(hat.GetParent(), undefined, "moved by script, not parented (parented it sat in the camera)");
    const feet = a.pawn.GetAbsOrigin();
    const yaw = a.pawn.GetEyeAngles().yaw * Math.PI / 180;
    const at = hat.GetAbsOrigin();
    assert.ok(Math.abs(at.x - (feet.x - Math.cos(yaw) * C.SPECTATOR_HAT_BACK)) < 1e-6
        && Math.abs(at.y - (feet.y - Math.sin(yaw) * C.SPECTATOR_HAT_BACK)) < 1e-6
        && at.z === feet.z + C.SPECTATOR_HAT_HEIGHT, "at eye height, a little behind the eyes, not at its Hammer offset");
    assert.equal(b.spectatorHat, undefined, "only the free-looking player");

    const { UpdateSpectatorHat } = await import("../../src/melon_drive/dev/free-look.js");
    a.pawn.Teleport({ position: { x: 100, y: 200, z: 300 }, angles: { pitch: 0, yaw: 90, roll: 0 } });
    UpdateSpectatorHat(a);
    const moved = hat.GetAbsOrigin();
    assert.ok(Math.abs(moved.x - 100) < 1e-6 && Math.abs(moved.y - (200 - C.SPECTATOR_HAT_BACK)) < 1e-6
        && moved.z === 300 + C.SPECTATOR_HAT_HEIGHT, "follows the flying pawn, behind its current view");

    a.pawn.Teleport({ angles: { pitch: 30, yaw: 90, roll: 0 } });
    UpdateSpectatorHat(a);
    const tilted = hat.GetAbsOrigin();
    const down = 30 * Math.PI / 180;
    assert.ok(Math.abs(tilted.y - (200 - Math.cos(down) * C.SPECTATOR_HAT_BACK)) < 1e-6
        && Math.abs(tilted.z - (300 + C.SPECTATOR_HAT_HEIGHT + Math.sin(down) * C.SPECTATOR_HAT_BACK)) < 1e-6,
        "looking down it swings up behind the eyes, around them");
    assert.equal(hat.GetAbsAngles().pitch, 30, "tilted with the view");

    Click(0, "usermenu_freelook_button");
    assert.equal(hat.IsValid(), false, "removed when free look goes off");
    assert.equal(a.spectatorHat, undefined);

    Click(0, "usermenu_freelook_button");
    const [again] = a.spectatorHat;
    DropKart(0, a);
    assert.equal(again.IsValid(), false, "removed when the player leaves");
});

test("free look: the respawn and restart buttons end it and put the chase camera back on the melon", async () => {
    const { CustomCameraMode } = await import("../helpers/cs-script-mock.mjs");
    Click(0, "usermenu_freelook_button");
    assert.equal(a.freeLook, true);
    SetUserMenuOpen(0, a, true);
    Click(0, "usermenu_respawn_button");
    assert.equal(a.freeLook, false, "respawn");
    assert.equal(a.pawn.GetCustomCamera().GetMode(), CustomCameraMode.FOLLOW_POSITION);

    a.trackId = 1; // on track 1, in a free-roaming time trial
    a.racing = false;
    world.add(new Entity({ name: "start_spawn_1", className: "info_target", origin: { x: 3000, y: 0, z: 0 } }));
    Click(0, "usermenu_freelook_button");
    Click(0, "usermenu_restart_button");
    assert.equal(a.freeLook, false, "restart");
    assert.equal(a.pawn.GetCustomCamera().GetMode(), CustomCameraMode.FOLLOW_POSITION);
});

test("free look without template_spectator_hat in the map: no avatar, free look still works", () => {
    Click(0, "usermenu_freelook_button");
    assert.equal(a.freeLook, true);
    assert.deepEqual(a.spectatorHat, []);
});

test("test triggers button: its page in place of the columns, Back and reopening swap them back", () => {
    SetUserMenuOpen(0, a, true);
    Click(0, "usermenu_triggers_button");
    assert.ok(hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(!hud.Has(0, "usermenu_triggers_page", "Hidden"));
    assert.ok(!hud.Has(1, "usermenu_main_page", "Hidden"), "only for the clicking player");
    Click(0, "triggers_back_button");
    assert.ok(!hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(hud.Has(0, "usermenu_triggers_page", "Hidden"));

    Click(0, "usermenu_triggers_button");
    Click(0, "usermenu_testcountdown_button"); // a trigger closes the menu…
    assert.equal(a.userMenuOpen, false);
    SetUserMenuOpen(0, a, true); // …and it reopens on its columns
    assert.ok(!hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(hud.Has(0, "usermenu_triggers_page", "Hidden"));
});

test("test break/bounce/heal: on the clicking player's own melon, menu closed — never while racing", async () => {
    a.health = 10;
    SetUserMenuOpen(0, a, true);
    Click(0, "usermenu_testheal_button");
    assert.equal(a.health, MELON_MAX_HEALTH, "health refilled");
    assert.equal(a.userMenuOpen, false);

    Click(0, "usermenu_testbounce_button");
    assert.ok(a.lastBounceTime !== undefined && a.lastBounceInfo.angleFactor === 1, "a PERFECT bounce for the panel");
    assert.equal(b.lastBounceInfo, undefined, "only the clicking player");

    Click(0, "usermenu_testbreak_button");
    assert.equal(a.breaking, true);
    assert.ok(!b.breaking);
    Click(0, "usermenu_testbreak_button"); // already broken: ignored, no throw

    b.racing = true;
    b.health = 10;
    Click(1, "usermenu_testheal_button");
    Click(1, "usermenu_testbreak_button");
    assert.equal(b.health, 10, "not while racing");
    assert.ok(!b.breaking);
});

test("every ON/OFF setting: a click flips it and its pill, a second click back", () => {
    for (const [buttonId, { variable, isOn }] of Object.entries(USER_MENU_TOGGLES)) {
        const before = isOn(a);
        Click(0, buttonId);
        assert.equal(isOn(a), !before, buttonId);
        assert.equal(hud.Variable(0, buttonId, variable), before ? "OFF" : "ON", `${buttonId} pill`);
        assert.equal(hud.Has(0, buttonId, "ToggleOn"), !before, `${buttonId} highlight`);
        Click(0, buttonId);
        assert.equal(isOn(a), before, `${buttonId} back`);
    }
});

test("SetUserMenuPage: one developer page at a time, undefined shows the columns again", () => {
    const pages = Object.keys(USER_MENU_PAGES);
    for (const page of pages) {
        SetUserMenuPage(0, a, page);
        assert.equal(a.userMenuPage, page);
        assert.ok(hud.Has(0, "usermenu_main_page", "Hidden"), page);
        for (const other of pages) {
            assert.equal(hud.Has(0, USER_MENU_PAGES[other].panel, "Hidden"), other !== page, `${page}: ${other}`);
        }
    }
    SetUserMenuPage(0, a, undefined);
    assert.ok(!hud.Has(0, "usermenu_main_page", "Hidden"));
    assert.ok(pages.every((page) => hud.Has(0, USER_MENU_PAGES[page].panel, "Hidden")));
});

test("color buttons paint that player's melon in the preset; an unknown color does nothing", () => {
    const [key, preset] = Object.entries(COLOR_PRESETS)[0];
    Click(0, `usermenu_color_${key}`);
    assert.deepEqual(a.paintColor, preset);
    assert.deepEqual(a.melon.color, preset);
    assert.notDeepEqual(b.paintColor, preset);

    Click(0, "usermenu_color_no_such_color");
    assert.deepEqual(a.paintColor, preset);
});

test("clicks from a player without a kart are ignored", () => {
    for (const button of ["hub_close_button", "usermenu_close_button", "usermenu_respawn_button", "usermenu_restart_button", "usermenu_hub_button", "usermenu_tutorial_button", "usermenu_glow_button", "usermenu_jointutorial_button", "usermenu_freelook_button", "usermenu_color_red"]) {
        assert.doesNotThrow(() => Click(7, button), button);
    }
});

test("test podium button: the clicker on place 1, the others after — never during a heat", () => {
    const { PodiumSpawnName, PODIUM_CONFETTI_NAME } = C;
    const steps = { 1: { x: 900, y: 0, z: 64 }, 2: { x: 900, y: 120, z: 48 }, 3: { x: 900, y: -120, z: 32 } };
    for (const place of [1, 2, 3]) {
        world.add(new Entity({ name: PodiumSpawnName(place), className: "info_target", origin: steps[place] }));
    }
    a.inHub = b.inHub = true;
    flow.TryStartRace();
    Click(1, "usermenu_podium_button");
    assert.equal(b.podium, undefined, "ignored while a heat runs");
    assert.equal(a.racing, true, "and nobody was pulled out of it");
    flow.TryAbortRace();

    SetUserMenuOpen(1, b, true);
    Click(1, "usermenu_podium_button");
    assert.equal(b.userMenuOpen, false);
    assert.equal(b.podium?.place, 1, "the clicker wins");
    assert.equal(a.podium?.place, 2);
    assert.deepEqual(HorizontalSpot(b), [steps[1].x, steps[1].y]);
    assert.ok(world.fired.some((f) => f.name === PODIUM_CONFETTI_NAME && f.input === "Start"), "confetti");
});

/** Runs the race flow (and with it the test previews) at `time`. @param {number} time */
function FlowAt(time) {
    world.time = time;
    flow.UpdateRaceFlow(time);
}

test("test countdown button: 3…2…1…GO for the clicker alone, held until GO — no heat", () => {
    world.time = 50;
    SetUserMenuOpen(1, b, true);
    Click(1, "usermenu_testcountdown_button");
    assert.equal(b.userMenuOpen, false, "the menu closes");
    assert.equal(flow.phase, RacePhase.HUB, "no heat started");
    assert.equal(b.locked, true, "held like on the start grid");
    FlowAt(50 + 0.5);
    assert.equal(hud.Has(1, "countdown_panel", "Hidden"), false);
    assert.equal(hud.Has(1, `count_${Math.ceil(C.COUNTDOWN_SECONDS - 0.5)}`, "In"), true);
    assert.equal(hud.Has(0, "countdown_panel", "Hidden"), undefined, "the other player sees nothing");
    assert.equal(a.locked, false);
    FlowAt(50 + C.COUNTDOWN_SECONDS);
    assert.equal(hud.Has(1, "count_go", "In"), true, "GO");
    assert.equal(b.locked, false, "let go at GO");
    FlowAt(50 + C.COUNTDOWN_SECONDS + C.GO_DISPLAY_SECONDS + 0.01);
    assert.equal(hud.Has(1, "countdown_panel", "Hidden"), true, "hidden again after GO");
    assert.equal(b.testPreview, undefined);
});

test("test finish button: FINISH, the place and the break countdown for the clicker alone, held meanwhile", () => {
    world.time = 50;
    Click(1, "usermenu_testfinish_button");
    assert.equal(flow.phase, RacePhase.HUB, "no heat started");
    assert.equal(b.locked, true, "parked like a finished racer");
    assert.equal(hud.Has(1, "finish_image", "Hidden"), false);
    assert.ok(hud.Variable(1, "finish_place", "place").includes(`+${C.HEAT_POINTS[0]} PTS`), "1st place's points under it");
    FlowAt(50 + 0.5);
    assert.equal(hud.Has(1, "break_countdown", "Hidden"), false, "the break countdown runs");
    assert.equal(hud.Has(0, "finish_image", "Hidden"), undefined, "the other player sees nothing");
    FlowAt(50 + C.BREAK_SECONDS);
    assert.equal(hud.Has(1, "finish_image", "Hidden"), true, "hidden again");
    assert.equal(hud.Has(1, "break_countdown", "Hidden"), true);
    assert.equal(b.locked, false, "let go");
    assert.equal(b.testPreview, undefined);
});

test("test countdown/finish buttons: ignored while racing; the hub button ends a preview", () => {
    a.inHub = b.inHub = true;
    flow.TryStartRace();
    Click(1, "usermenu_testcountdown_button");
    Click(1, "usermenu_testfinish_button");
    assert.equal(b.testPreview, undefined, "ignored in a heat");
    flow.TryAbortRace();

    Click(1, "usermenu_testfinish_button");
    assert.equal(b.testPreview?.kind, "finish");
    Click(1, "usermenu_hub_button");
    assert.equal(b.testPreview, undefined, "the hub button ends it");
    assert.equal(b.locked, false);
    assert.equal(hud.Has(1, "finish_image", "Hidden"), true);
});

test("test intro button: the join logo for the clicker alone, held behind it", () => {
    world.time = 50;
    Click(1, "usermenu_testintro_button");
    assert.equal(hud.Has(1, "intro_logo", "Hidden"), false, "the logo shows");
    assert.equal(hud.Has(0, "intro_logo", "Hidden"), undefined, "the other player sees nothing");
    assert.equal(b.locked, true);
    FlowAt(50 + C.INTRO_LOGO_SECONDS / 2);
    assert.equal(hud.Has(1, "intro_logo", "Hidden"), false, "still up");
    FlowAt(50 + C.INTRO_LOGO_SECONDS);
    assert.equal(hud.Has(1, "intro_logo", "Hidden"), true, "hidden again");
    assert.equal(b.locked, false, "let go");
    assert.equal(b.testPreview, undefined);
});

// Regression: a heat starting while Test Finish ran left its break
// countdown on screen through the heat.
test("a heat starting ends a running preview and hides all of it", () => {
    world.time = 50;
    Click(1, "usermenu_testfinish_button");
    FlowAt(50 + 0.5);
    assert.equal(hud.Has(1, "break_countdown", "Hidden"), false, "setup: the break countdown runs");
    b.inHub = true;
    flow.TryStartRace();
    assert.equal(b.testPreview, undefined);
    assert.equal(hud.Has(1, "break_countdown", "Hidden"), true, "no leftover break countdown");
    assert.equal(hud.Has(1, "finish_image", "Hidden"), true);
    assert.equal(b.locked, true, "held for the real countdown");
});
