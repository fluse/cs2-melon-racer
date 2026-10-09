// Every button click in the HUD layout (OnCustomHudClicked): the hub modal's
// start/close/abort buttons and the user menu's rows. One table per kind of
// button — plain actions, ON/OFF settings, developer pages, test triggers,
// and id prefixes — and one dispatcher (HandleHudClick) that looks up the
// clicking player's kart for them once.
import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { karts, IsModerator } from "../core/kart-registry.js";
import { RespawnKartAtCheckpoint } from "../kart/teleport.js";
import { IsMelonGlowOn, SetMelonGlow, SetKartPaintColor } from "../kart/look.js";
import { IsStartInTutorialOn, SetStartInTutorial } from "../kart/join-spot.js";
import { IsPredictionOn, SetPrediction } from "../fx/prediction/prediction.js";
import { IsCollisionDebugOn, SetCollisionDebug } from "../dev/collision-debug.js";
import { IsFreeLookOn, SetFreeLook } from "../dev/free-look.js";
import { HandleCameraTuningClick } from "../dev/camera-tuning.js";
import { HandlePhysicsTuningClick } from "../dev/physics-tuning.js";
import { TestBreak, TestHeal, TestPerfectBounce } from "../dev/test-effects.js";
import { phase, TryStartRace, TryAbortRace, ReturnAllToHub, SendKartToTutorial, TestCountdown, TestFinish, TestIntro } from "../race/heat/race-flow.js";
import { RestartTimeTrial } from "../race/checkpoints/checkpoints.js";
import { PlaceOnPodium, TestGrandPrix } from "../race/podium/podium.js";
import { GetSpeedHud } from "./layout.js";
import { HideHubModal } from "./hub-modal/hub-modal.js";
import { SetUserMenuOpen, SetUserMenuPage, UpdateToggleHud } from "./user-menu.js";
import { COLOR_PRESETS, RacePhase } from "../constants/index.js";

/** @typedef {import("../core/kart-registry.js").Kart} Kart */

/**
 * Buttons that don't need the clicker to have a kart.
 * @type {Record<string, (slot: number) => void>}
 */
const SLOT_BUTTONS = {
    hub_start_button: () => TryStartRace(),
    // Moderator only: ends the running Grand Prix for everyone.
    hub_abort_button: (slot) => {
        if (IsModerator(slot)) {
            TryAbortRace();
        } else {
            Debug(`hub_abort_button: slot ${slot} clicked but isn't the moderator, ignoring`);
        }
    },
};

/**
 * Plain actions on the clicker's own kart.
 * @type {Record<string, (slot: number, kart: Kart) => void>}
 */
const KART_BUTTONS = {
    // Dismiss just for the player who clicked it — doesn't touch kart.inHub,
    // so they're still pulled into the next heat that starts while they're
    // standing in hub_start_trigger.
    hub_close_button: (slot, kart) => HideHubModal(slot, kart),
    usermenu_close_button: (slot, kart) => SetUserMenuOpen(slot, kart, false),
    usermenu_respawn_button: (slot, kart) => {
        if (kart.breaking) {
            // Already mid-respawn from a break — it's about to land at this
            // same checkpoint on its own, nothing for this click to do.
            Debug(`usermenu_respawn_button: slot ${slot} kart is already breaking/respawning, ignoring`);
            return;
        }
        if (kart.locked) {
            // Held on the start grid for the countdown, or parked after
            // finishing — it isn't going anywhere that respawning would fix,
            // and mid-countdown it'd just teleport a racer around the grid.
            Debug(`usermenu_respawn_button: slot ${slot} kart is locked, ignoring`);
            return;
        }
        // Back to driving: a free-looking player's respawn ends free look
        // (pawn back on its anchor, chase camera on the melon) first.
        SetFreeLook(kart, false);
        RespawnKartAtCheckpoint(kart);
        SetUserMenuOpen(slot, kart, false);
    },
    usermenu_restart_button: (slot, kart) => {
        if (RestartTimeTrial(kart)) {
            SetUserMenuOpen(slot, kart, false);
        }
    },
    // Self-service pull-out: just this racer leaves the heat, everyone else
    // keeps going — unlike hub_abort_button, which is moderator-only and ends
    // it for the whole group. ReturnAllToHub already supports a single-kart
    // list (it's the same path a disconnecting racer takes).
    usermenu_hub_button: (slot, kart) => {
        Debug(`usermenu_hub_button: slot ${slot} returning to hub (racing=${kart.racing}, phase=${phase})`);
        SetUserMenuOpen(slot, kart, false);
        ReturnAllToHub([kart]);
    },
    // Same self-service pull-out as the hub button above, to intro_spawn.
    usermenu_tutorial_button: (slot, kart) => {
        Debug(`usermenu_tutorial_button: slot ${slot} going to the tutorial (racing=${kart.racing}, phase=${phase})`);
        SetUserMenuOpen(slot, kart, false);
        SendKartToTutorial(kart);
    },
};

/**
 * The ON/OFF settings (their pills: USER_MENU_TOGGLES in user-menu.js): what
 * a click switches. Returns whether the menu should close.
 * @type {Record<string, (kart: Kart) => boolean | void>}
 */
const TOGGLE_BUTTONS = {
    // Only this player's own melon (everyone still sees whatever glow a melon
    // has — the engine's Glow isn't per viewer).
    usermenu_glow_button: (kart) => void SetMelonGlow(kart, !IsMelonGlowOn(kart)),
    // Where this player's melon appears next time they join. Saved per
    // player name (kart/join-spot.js).
    usermenu_jointutorial_button: (kart) => void SetStartInTutorial(kart, !IsStartInTutorialOn(kart)),
    // Only this player's melon gets the line (DebugLine in the default
    // render mode, so tools mode only).
    usermenu_prediction_button: (kart) => void SetPrediction(kart, !IsPredictionOn(kart)),
    // Only this player's melon is drawn/logged (tools mode only).
    usermenu_collisiondebug_button: (kart) => void SetCollisionDebug(kart, !IsCollisionDebugOn(kart)),
    // This player flies their own pawn around, their melon waits frozen.
    // Switching it on closes the menu so the mouse looks around right away.
    usermenu_freelook_button: (kart) => SetFreeLook(kart, !IsFreeLookOn(kart)), // true = it is on now
};

/**
 * Buttons that open a developer page in place of the menu's columns
 * (SetUserMenuPage), and each page's Back button.
 * @type {Record<string, import("./user-menu.js").UserMenuPage | undefined>}
 */
const PAGE_BUTTONS = {
    usermenu_camera_button: "camera",
    usermenu_physics_button: "physics",
    usermenu_triggers_button: "triggers",
    camtune_back_button: undefined,
    phytune_back_button: undefined,
    triggers_back_button: undefined,
};

/**
 * The "Test Triggers" page: each plays something for the clicking player
 * and returns whether it started — then the menu closes so it's in view.
 * Not while they race (the heat's HUD and melon are theirs then).
 * @type {Record<string, (slot: number, kart: Kart) => boolean>}
 */
const TEST_TRIGGER_BUTTONS = {
    // The end of a Grand Prix without racing one — everyone to the hub, then
    // the clicking player onto place 1 and the others in join order onto 2
    // and 3, held there, confetti on. Not while a heat runs (it would pull
    // its racers out).
    usermenu_podium_button: (slot, kart) => {
        if (phase !== RacePhase.HUB) {
            return false;
        }
        const racers = [kart, ...[...karts.values()].filter((other) => other !== kart && other.melon.IsValid())];
        Debug(`usermenu_podium_button: slot ${slot} plays the podium with ${racers.length} player(s)`);
        ReturnAllToHub(racers);
        PlaceOnPodium(TestGrandPrix(racers), racers);
        return true;
    },
    // The heat's countdown, what a racer sees at the finish, or the join logo
    // (race/heat/race-flow.js).
    usermenu_testcountdown_button: (slot, kart) => TestCountdown(kart),
    usermenu_testfinish_button: (slot, kart) => TestFinish(kart),
    usermenu_testintro_button: (slot, kart) => TestIntro(kart),
    // A break, a PERFECT bounce's feedback or the heal effect on the melon
    // (dev/test-effects.js).
    usermenu_testbreak_button: (slot, kart) => TestBreak(slot, kart),
    usermenu_testbounce_button: (slot, kart) => TestPerfectBounce(kart),
    usermenu_testheal_button: (slot, kart) => TestHeal(kart),
};

/**
 * Buttons handled by id prefix: the color swatches and the tuning pages'
 * controls. Each returns whether the id was one of its buttons.
 * @type {[string, (slot: number, kart: Kart, buttonId: string) => boolean][]}
 */
const PREFIX_BUTTONS = [
    [
        "usermenu_color_",
        (slot, kart, buttonId) => {
            const preset = COLOR_PRESETS[buttonId.slice("usermenu_color_".length)];
            if (preset) {
                SetKartPaintColor(kart, preset);
            }
            return Boolean(preset);
        },
    ],
    ["camtune_", HandleCameraTuningClick], // dev/camera-tuning.js
    ["phytune_", HandlePhysicsTuningClick], // dev/physics-tuning.js
];

/**
 * Whether a button id has a handler here (exactly, or by prefix) — every
 * button in speedometer.xml must (test/hud/hud-layout.test.mjs).
 * @param {string} buttonId
 */
export function IsHandledButton(buttonId) {
    return (
        buttonId in SLOT_BUTTONS ||
        buttonId in KART_BUTTONS ||
        buttonId in TOGGLE_BUTTONS ||
        buttonId in PAGE_BUTTONS ||
        buttonId in TEST_TRIGGER_BUTTONS ||
        PREFIX_BUTTONS.some(([prefix]) => buttonId.startsWith(prefix))
    );
}

/**
 * One click on the melon HUD by the player in `slot`.
 * @param {number} slot @param {string} buttonId
 */
export function HandleHudClick(slot, buttonId) {
    if (buttonId in SLOT_BUTTONS) {
        SLOT_BUTTONS[buttonId](slot);
        return;
    }
    const kart = karts.get(slot);
    if (!kart) {
        return; // every other button acts on the clicker's own kart
    }
    if (buttonId in KART_BUTTONS) {
        KART_BUTTONS[buttonId](slot, kart);
    } else if (buttonId in TOGGLE_BUTTONS) {
        const close = TOGGLE_BUTTONS[buttonId](kart);
        UpdateToggleHud(slot, kart, buttonId);
        if (close) {
            SetUserMenuOpen(slot, kart, false);
        }
    } else if (buttonId in PAGE_BUTTONS) {
        SetUserMenuPage(slot, kart, PAGE_BUTTONS[buttonId]);
    } else if (buttonId in TEST_TRIGGER_BUTTONS) {
        if (TEST_TRIGGER_BUTTONS[buttonId](slot, kart)) {
            SetUserMenuOpen(slot, kart, false);
        } else {
            Debug(`${buttonId}: slot ${slot}, ignored (racing=${kart.racing}, breaking=${kart.breaking}, phase=${phase}, preview=${kart.testPreview?.kind})`);
        }
    } else {
        const entry = PREFIX_BUTTONS.find(([prefix]) => buttonId.startsWith(prefix));
        if (!entry?.[1](slot, kart, buttonId)) {
            Debug(`${buttonId}: no such button, ignoring`);
        }
    }
}

export function RegisterHudInputs() {
    Instance.OnCustomHudClicked((event) => {
        if (event.layout === GetSpeedHud()) {
            HandleHudClick(event.player.GetPlayerSlot(), event.buttonId);
        }
    });
}
