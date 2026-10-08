// The hub's "Start Grand Prix" window: the rules for its heat cards and racer
// list (hud/hub-modal/logic.js), its panels in speedometer.xml (and a route
// image per card), and what the real hud/hub-modal/hub-modal.js sends each
// player, against the fake engine.
import "../helpers/register-cs-script.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { world, Entity, CSPlayerPawn, PointTemplate } from "../helpers/cs-script-mock.mjs";
import { FakeHud } from "../helpers/fake-hud.mjs";
import { BuildHubRacerList, BuildHeatCards, HeatsTitle } from "../../src/melon_drive/hud/hub-modal/logic.js";

const { karts } = await import("../../src/melon_drive/core/kart-registry.js");
const { SetUpPlayerKart } = await import("../../src/melon_drive/kart/spawn.js");
const { GetHubSpawnPoint } = await import("../../src/melon_drive/kart/spawn-points.js");
const { ShowHubModal, ApplyHubModalState } = await import("../../src/melon_drive/hud/hub-modal/hub-modal.js");
const { ROUTE_NAMES } = await import("../../src/melon_drive/hud/hub-modal/routes.js");
const { HUB_RACER_ROWS, HUD_RESEND_SECONDS, MELON_TEMPLATE_NAME, HUB_SPAWN_NAME, SPEED_HUD_ENTITY_NAME, RacePhase, MAX_TRACKS } = await import("../../src/melon_drive/constants/index.js");

/** @param {string[]} names */
const Players = (names) => names.map((name, i) => ({ key: String(i), name }));

test("everyone in the start area is listed in join order, the viewer marked", () => {
    const list = BuildHubRacerList(Players(["Anna", "Ben", "Cleo"]), "1", HUB_RACER_ROWS);
    assert.deepEqual(list.rows, [
        { name: "Anna", self: false },
        { name: "Ben", self: true },
        { name: "Cleo", self: false },
    ]);
    assert.equal(list.title, "RACERS · 3");
    assert.equal(list.more, "");
});

test("more players than rows: the rest counted, the viewer always listed", () => {
    const names = Array.from({ length: HUB_RACER_ROWS + 3 }, (_, i) => `P${i}`);
    const last = String(names.length - 1);
    const list = BuildHubRacerList(Players(names), last, HUB_RACER_ROWS);
    assert.equal(list.rows.length, HUB_RACER_ROWS);
    assert.deepEqual(list.rows[HUB_RACER_ROWS - 1], { name: names[names.length - 1], self: true });
    assert.equal(list.rows[0].name, "P0");
    assert.equal(list.more, "+3 MORE");

    const front = BuildHubRacerList(Players(names), "0", HUB_RACER_ROWS);
    assert.equal(front.rows[HUB_RACER_ROWS - 1].name, `P${HUB_RACER_ROWS - 1}`);
    assert.equal(front.more, "+3 MORE");
});

test("a heat card per track in race order: number, route name, laps and checkpoints", () => {
    const cards = BuildHeatCards([1, 3], { 1: { checkpoints: 4, lapsToWin: 3 }, 3: { checkpoints: 1, lapsToWin: 1 } }, { 1: "Canals" });
    assert.deepEqual(cards, [
        { trackId: 1, heat: "HEAT 1", name: "CANALS", info: "3 LAPS  ·  4 CHECKPOINTS" },
        { trackId: 3, heat: "HEAT 2", name: "ROUTE 3", info: "1 LAP  ·  1 CHECKPOINT" },
    ]);
    assert.equal(BuildHeatCards([2], { 2: { checkpoints: 0, lapsToWin: 1 } }, {})[0].info, "1 LAP  ·  NO CHECKPOINTS");
    assert.equal(HeatsTitle(3), "HEATS · 3");
});

const layout = readFileSync(new URL("../../panorama/layout/custom_game/speedometer.xml", import.meta.url), "utf8");
const css = readFileSync(new URL("../../panorama/styles/custom_game/speedometer.css", import.meta.url), "utf8");

test("speedometer.xml has a heat card for every track id, each with its route image", () => {
    const modal = layout.match(/<Panel id="hub_modal"[\s\S]*?<Button id="hub_start_button"/);
    assert.ok(modal, "hub_modal");
    assert.match(modal[0], /<Panel id="hub_heats"[^>]*>\s*<Label[^>]*text="\{s:title\}"/);
    for (let id = 1; id <= MAX_TRACKS; id++) {
        const card = modal[0].match(new RegExp(`<Panel id="hub_heat_${id}"[^>]*>([\\s\\S]*?)</Panel>\\s*<Label[^>]*\\{s:name\\}[\\s\\S]*?\\{s:info\\}`));
        assert.ok(card, `hub_heat_${id} with name and info`);
        assert.ok(card[1].includes(`routes/route_${id}.png`) && card[1].includes("{s:heat}"), `hub_heat_${id} shows route_${id}.png and the heat number`);
        assert.ok(existsSync(new URL(`../../panorama/images/custom_game/routes/route_${id}.png`, import.meta.url)), `route_${id}.png exists (node tools/make-route-icons.mjs)`);
    }
    assert.ok(!layout.includes(`id="hub_heat_${MAX_TRACKS + 1}"`), "no card the script never fills");
});

// Found in-game: texturewidth/textureheight on an Image made the whole
// custom HUD disappear, with no console error and resourcecompiler "OK".
test("no Image in speedometer.xml sets texturewidth/textureheight", () => {
    assert.doesNotMatch(layout, /texture(width|height)=/);
});

test("speedometer.xml has the racer list inside the hub window, HUB_RACER_ROWS rows", () => {
    const modal = layout.match(/<Panel id="hub_modal"[\s\S]*?<Button id="hub_start_button"/);
    assert.ok(modal, "hub_modal");
    assert.match(modal[0], /<Panel id="hub_racers"[^>]*>\s*<Label[^>]*text="\{s:title\}"/);
    for (let i = 0; i < HUB_RACER_ROWS; i++) {
        const row = modal[0].match(new RegExp(`<Panel id="hub_racer_${i}"[^>]*>([\\s\\S]*?)</Panel>`));
        assert.ok(row?.[1].includes("{s:name}"), `hub_racer_${i} shows the name`);
    }
    assert.ok(!layout.includes(`id="hub_racer_${HUB_RACER_ROWS}"`), "no row the script never fills");
    assert.match(modal[0], /id="hub_racers_more"[^>]*text="\{s:more\}"/);
    // (nested blocks: up to the block's own closing brace at the line start)
    assert.match(css, /\.HubModal\.WaitingForOthers \{(?:(?!\n\})[\s\S])*?\.HubSection \{\s*visibility: collapse;/, "heats, racers and start hidden while a heat runs");
});

/** @type {FakeHud} */
let hud;

/** @param {number} slot @param {string} playerName */
function AddKart(slot, playerName) {
    const pawn = world.add(new CSPlayerPawn({ slot, playerName }));
    world.playerPawns.push(pawn);
    return SetUpPlayerKart(pawn, GetHubSpawnPoint());
}

beforeEach(() => {
    hud?.Remove();
    world.reset();
    karts.clear();
    hud = world.add(new FakeHud(SPEED_HUD_ENTITY_NAME));
    world.add(new PointTemplate({ name: MELON_TEMPLATE_NAME, spawn: () => [new Entity({ className: "prop_physics_multiplayer" })] }));
    world.add(new Entity({ name: HUB_SPAWN_NAME, className: "info_player_start", origin: { x: 0, y: 0, z: 16 } }));
    // Two tracks: 1 (3 laps, 2 checkpoints) and 2 (1 lap, none).
    for (const name of ["start_1_laps3", "checkpoint_1_1", "checkpoint_1_2", "start_2"]) {
        world.add(new Entity({ name, className: "trigger_multiple" }));
    }
});

test("the heat cards: one per track, the rest collapsed", () => {
    const anna = AddKart(0, "Anna");
    anna.inHub = true;
    ShowHubModal(0, anna, RacePhase.HUB);
    assert.equal(hud.Variable(0, "hub_heats", "title"), "HEATS · 2");
    assert.equal(hud.Variable(0, "hub_heat_1", "heat"), "HEAT 1");
    assert.equal(hud.Variable(0, "hub_heat_1", "name"), (ROUTE_NAMES[1] ?? "Route 1").toUpperCase());
    assert.equal(hud.Variable(0, "hub_heat_1", "info"), "3 LAPS  ·  2 CHECKPOINTS");
    assert.equal(hud.Variable(0, "hub_heat_2", "heat"), "HEAT 2");
    assert.equal(hud.Has(0, "hub_heat_1", "Unused"), false);
    assert.equal(hud.Has(0, "hub_heat_3", "Unused"), true);
});

test("each player in the start area sees who rides along — not who's elsewhere", () => {
    const [anna, ben, cleo] = [AddKart(0, "Anna"), AddKart(1, "Ben"), AddKart(2, "Cleo")];
    anna.inHub = true;
    cleo.inHub = true;
    ShowHubModal(0, anna, RacePhase.HUB);
    ShowHubModal(2, cleo, RacePhase.HUB);
    assert.equal(ben.inHub, false);

    assert.equal(hud.Variable(0, "hub_racers", "title"), "RACERS · 2");
    assert.equal(hud.Variable(0, "hub_racer_0", "name"), "Anna");
    assert.equal(hud.Variable(0, "hub_racer_1", "name"), "Cleo");
    assert.equal(hud.Has(0, "hub_racer_0", "Self"), true);
    assert.equal(hud.Has(0, "hub_racer_1", "Self"), false);
    assert.equal(hud.Has(0, "hub_racer_2", "Unused"), true);
    assert.equal(hud.Has(2, "hub_racer_1", "Self"), true);
    assert.equal(hud.Has(0, "hub_racers_more", "Unused"), true);
});

test("the list follows players walking in and out, re-sent on its own", () => {
    const [anna, ben] = [AddKart(0, "Anna"), AddKart(1, "Ben")];
    anna.inHub = true;
    ShowHubModal(0, anna, RacePhase.HUB);
    assert.equal(hud.Has(0, "hub_racer_1", "Unused"), true);

    ben.inHub = true;
    ApplyHubModalState(0, RacePhase.HUB);
    assert.equal(hud.Variable(0, "hub_racer_1", "name"), "Ben");
    assert.equal(hud.Has(0, "hub_racer_1", "Unused"), false);

    ben.inHub = false;
    ApplyHubModalState(0, RacePhase.HUB);
    assert.equal(hud.Has(0, "hub_racer_1", "Unused"), true);
    assert.equal(hud.Variable(0, "hub_racers", "title"), "RACERS · 1");

    // A value lost before the HUD had loaded comes back with the next resend.
    hud.SetDialogVariableStringForPlayer(0, "hub_racer_0", "name", "");
    world.time += HUD_RESEND_SECONDS;
    ApplyHubModalState(0, RacePhase.HUB);
    assert.equal(hud.Variable(0, "hub_racer_0", "name"), "Anna");
});
