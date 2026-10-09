// Every button click in the HUD layout (OnCustomHudClicked): the hub modal's
// start/close/abort buttons and the user menu's rows.
import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { karts, IsModerator } from "../core/kart-registry.js";
import { RespawnKartAtCheckpoint } from "../kart/teleport.js";
import { IsMelonGlowOn, SetMelonGlow, SetKartPaintColor } from "../kart/look.js";
import { IsStartInTutorialOn, SetStartInTutorial } from "../kart/join-spot.js";
import { IsPredictionOn, SetPrediction } from "../fx/prediction/prediction.js";
import { IsCollisionDebugOn, SetCollisionDebug } from "../dev/collision-debug.js";
import { IsFreeLookOn, SetFreeLook } from "../dev/free-look.js";
import { phase, TryStartRace, TryAbortRace, ReturnAllToHub, SendKartToTutorial, TestCountdown, TestFinish, TestIntro } from "../race/heat/race-flow.js";
import { RestartTimeTrial } from "../race/checkpoints/checkpoints.js";
import { PlaceOnPodium, TestGrandPrix } from "../race/podium/podium.js";
import { GetSpeedHud } from "./layout.js";
import { HideHubModal } from "./hub-modal/hub-modal.js";
import { SetUserMenuOpen, UpdateCollisionDebugHud, UpdateFreeLookHud, UpdateMelonGlowHud, UpdatePredictionHud, UpdateStartInTutorialHud } from "./user-menu.js";
import { COLOR_PRESETS, RacePhase } from "../constants/index.js";

export function RegisterHudInputs() {
    Instance.OnCustomHudClicked((event) => {
        if (event.layout !== GetSpeedHud()) {
            return;
        }
        if (event.buttonId === "hub_start_button") {
            TryStartRace();
        } else if (event.buttonId === "hub_close_button") {
            // Dismiss just for the player who clicked it — doesn't touch
            // kart.inHub, so they're still pulled into the next heat that starts
            // while they're standing in hub_start_trigger, same as before.
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (kart) {
                HideHubModal(slot, kart);
            }
        } else if (event.buttonId === "hub_abort_button") {
            const slot = event.player.GetPlayerSlot();
            if (IsModerator(slot)) {
                TryAbortRace();
            } else {
                Debug(`hub_abort_button: slot ${slot} clicked but isn't the moderator, ignoring`);
            }
        } else if (event.buttonId === "usermenu_close_button") {
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (kart) {
                SetUserMenuOpen(slot, kart, false);
            }
        } else if (event.buttonId === "usermenu_respawn_button") {
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (!kart) {
                return;
            }
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
            RespawnKartAtCheckpoint(kart);
            SetUserMenuOpen(slot, kart, false);
        } else if (event.buttonId === "usermenu_restart_button") {
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (kart && RestartTimeTrial(kart)) {
                SetUserMenuOpen(slot, kart, false);
            }
        } else if (event.buttonId === "usermenu_hub_button") {
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (!kart) {
                return;
            }
            // Self-service pull-out: just this racer leaves the heat, everyone
            // else keeps going — unlike hub_abort_button, which is moderator-only
            // and ends it for the whole group. ReturnAllToHub already supports a
            // single-kart list (it's the same path a disconnecting racer takes).
            Debug(`usermenu_hub_button: slot ${slot} returning to hub (racing=${kart.racing}, phase=${phase})`);
            SetUserMenuOpen(slot, kart, false);
            ReturnAllToHub([kart]);
        } else if (event.buttonId === "usermenu_tutorial_button") {
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (!kart) {
                return;
            }
            // Same self-service pull-out as the hub button above, to intro_spawn.
            Debug(`usermenu_tutorial_button: slot ${slot} going to the tutorial (racing=${kart.racing}, phase=${phase})`);
            SetUserMenuOpen(slot, kart, false);
            SendKartToTutorial(kart);
        } else if (event.buttonId === "usermenu_glow_button") {
            // Per player: only this player's own melon (everyone still sees
            // whatever glow a melon has — the engine's Glow isn't per viewer).
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (kart) {
                SetMelonGlow(kart, !IsMelonGlowOn(kart));
                UpdateMelonGlowHud(slot, kart);
            }
        } else if (event.buttonId === "usermenu_jointutorial_button") {
            // Where this player's melon appears next time they join: the
            // tutorial or the hub. Saved per player name (kart/join-spot.js).
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (kart) {
                SetStartInTutorial(kart, !IsStartInTutorialOn(kart));
                UpdateStartInTutorialHud(slot, kart);
            }
        } else if (event.buttonId === "usermenu_prediction_button") {
            // Per player: only this player's melon gets the line (drawn with
            // DebugLine in the default render mode, so tools mode only).
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (kart) {
                SetPrediction(kart, !IsPredictionOn(kart));
                UpdatePredictionHud(slot, kart);
            }
        } else if (event.buttonId === "usermenu_collisiondebug_button") {
            // Per player: only this player's melon is drawn/logged (debug
            // draws themselves only show in tools mode).
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (kart) {
                SetCollisionDebug(kart, !IsCollisionDebugOn(kart));
                UpdateCollisionDebugHud(slot, kart);
            }
        } else if (event.buttonId === "usermenu_freelook_button") {
            // Per player: this player flies their own pawn around, their
            // melon waits frozen (dev/free-look.js). Switching it on closes
            // the menu so the mouse looks around right away.
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (kart) {
                const on = SetFreeLook(kart, !IsFreeLookOn(kart));
                UpdateFreeLookHud(slot, kart);
                if (on) {
                    SetUserMenuOpen(slot, kart, false);
                }
            }
        } else if (event.buttonId === "usermenu_podium_button") {
            // Developer: the end of a Grand Prix without racing one — everyone
            // to the hub, then the clicking player onto place 1 and the others
            // in join order onto 2 and 3, held there, confetti on. Not while
            // a heat runs (it would pull its racers out).
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (!kart) {
                return;
            }
            if (phase !== RacePhase.HUB) {
                Debug(`usermenu_podium_button: slot ${slot}, ignored — a heat is running (phase=${phase})`);
                return;
            }
            const racers = [kart, ...[...karts.values()].filter((other) => other !== kart && other.melon.IsValid())];
            Debug(`usermenu_podium_button: slot ${slot} plays the podium with ${racers.length} player(s)`);
            SetUserMenuOpen(slot, kart, false);
            ReturnAllToHub(racers);
            PlaceOnPodium(TestGrandPrix(racers), racers);
        } else if (
            event.buttonId === "usermenu_testcountdown_button" ||
            event.buttonId === "usermenu_testfinish_button" ||
            event.buttonId === "usermenu_testintro_button"
        ) {
            // Developer: the heat's countdown, what a racer sees at the
            // finish, or the join logo, for the clicking player only — no
            // heat, nobody else. Not while they race (the heat's HUD is
            // theirs then).
            const slot = event.player.GetPlayerSlot();
            const kart = karts.get(slot);
            if (!kart) {
                return;
            }
            const preview =
                event.buttonId === "usermenu_testcountdown_button" ? TestCountdown : event.buttonId === "usermenu_testfinish_button" ? TestFinish : TestIntro;
            if (preview(kart)) {
                SetUserMenuOpen(slot, kart, false);
            } else {
                Debug(`${event.buttonId}: slot ${slot}, ignored (racing=${kart.racing}, breaking=${kart.breaking}, preview=${kart.testPreview?.kind})`);
            }
        } else if (event.buttonId.startsWith("usermenu_color_")) {
            const key = event.buttonId.slice("usermenu_color_".length);
            const preset = COLOR_PRESETS[key];
            if (!preset) {
                Debug(`usermenu_color_${key}: no such color preset, ignoring`);
                return;
            }
            const kart = karts.get(event.player.GetPlayerSlot());
            if (kart) {
                SetKartPaintColor(kart, preset);
            }
        }
    });
}
