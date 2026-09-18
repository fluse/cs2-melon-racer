import { Instance, CSMoveType } from "cs_script/point_script";

// Free-look melon driving: each player gets their own prop_physics melon
// (spawned from a point_template placed in Hammer). Steering direction comes
// from where the player is looking (mouse), not a separate turn control:
// W/S push the melon forward/back along the camera's look direction, A/D
// strafe it left/right relative to that same direction, and Space jumps.
// The player's own pawn is frozen (and hidden) at its spawn position and
// left there — it deliberately does NOT track the melon's position. Doing
// that used to make the pawn's solid hitbox constantly overlap the melon's
// physics collision, and the two would fight/shove each other every tick.
// The camera follows the melon directly (CustomPlayerCamera), so the pawn
// doesn't need to be anywhere near it for the view to work.
//
// This file only wires cs_script's entity-lifecycle/input callbacks to the
// logic in the sibling modules below — see constants.js for tunables,
// kart-registry.js for the kart/moderator bookkeeping, race-flow.js for the
// hub/countdown/racing/break state machine, kart-spawn.js/kart-physics.js
// for melon spawning and per-tick movement/damage, hud.js/camera.js for the
// speedometer/HUD and chase camera, checkpoints.js for lap tracking, and
// think.js for the per-tick driver.

import { Debug } from "./debug.js";
import { PAINT_TRIGGER_NAME_PATTERN, COLOR_PRESETS, CAMERA_DISTANCE_STEPS } from "./constants.js";
import { karts, EnsureModerator, IsModerator, FindKartByMelon, moderatorSlot, SetModeratorSlot } from "./kart-registry.js";
import { GetOrCreateKart, ParkPawn } from "./kart-spawn.js";
import { RespawnKartAtCheckpoint, SetKartPaintColor } from "./kart-physics.js";
import { GetSpeedHud, ShowHubModal, HideHubModal, SetUserMenuOpen } from "./hud.js";
import { SetCameraDistance } from "./camera.js";
import { phase, activeTrackId, phaseEndTime, TryStartRace, TryAbortRace, RestoreRaceFlowSnapshot } from "./race-flow.js";
import { RegisterCheckpointAndFinishInputs } from "./checkpoints.js";
import { Think } from "./think.js";

Instance.SetThink(Think);
Instance.SetNextThink(Instance.GetGameTime());

// Tools-mode hot reload re-runs this whole file top-to-bottom, which would
// otherwise reset `karts` to an empty Map while the previously spawned
// melons are still alive in the world — the next respawn would then spawn
// a *second* melon on top of the orphaned one and the two would violently
// shove each other apart. Carry the existing tracking across the reload.
// Race-flow phase/activeTrackId/phaseEndTime are carried the same way, so
// reloading mid-heat during dev iteration doesn't strand locked racers in a
// phase that's forgotten it's supposed to unlock/advance them.
Instance.OnScriptReload({
    before: () => ({ karts, phase, activeTrackId, phaseEndTime, moderatorSlot }),
    after: (memory) => {
        if (memory?.karts) {
            for (const [slot, kart] of memory.karts) {
                karts.set(slot, kart);
            }
            RestoreRaceFlowSnapshot(memory);
            SetModeratorSlot(memory.moderatorSlot);
            Debug(`OnScriptReload: restored ${karts.size} kart(s), phase=${phase}, activeTrackId=${activeTrackId}, moderatorSlot=${moderatorSlot}`);
        }
    },
});

Instance.OnPlayerReset(({ player }) => {
    Debug(`OnPlayerReset: slot=${player.GetPlayerController()?.GetPlayerSlot()}`);
    player.SetMoveType(CSMoveType.NONE);
    const kart = GetOrCreateKart(player);
    // Only park once we actually have a melon to anchor against — see
    // ParkPawn's comment. If GetOrCreateKart failed (e.g. melon_template
    // isn't spawned in yet), leave the pawn at its real origin so the next
    // OnPlayerReset retry captures a valid ground position instead of an
    // already-parked one.
    if (kart) {
        ParkPawn(player, kart.melon);
    }
});

Instance.OnPlayerDisconnect(({ playerSlot }) => {
    const kart = karts.get(playerSlot);
    if (kart) {
        kart.melon.Remove();
        karts.delete(playerSlot);
    }
    // Promotes the next-oldest remaining player (Map preserves insertion
    // order) so there's always a moderator whenever anyone's still on the
    // map — see EnsureModerator's comment for why this can't just wait for
    // the next Think tick to notice.
    EnsureModerator();
});

RegisterCheckpointAndFinishInputs();

// Hub: place a trigger_multiple named "hub_start_trigger" in the hub area,
// filtered to prop_physics like the checkpoints, with OnStartTouch/OnEndTouch
// calling RunScriptInput "hub_enter"/"hub_leave" on this point_script. While a
// kart is inside it, that player sees the "Jetzt starten" modal (or a
// "race in progress" message if a heat is already running) — see
// GAMEPLAY.md's "Hub -> race -> next-track flow".
Instance.OnScriptInput("hub_enter", ({ activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart) {
        Debug("hub_enter: activator wasn't a tracked melon, ignoring");
        return;
    }
    kart.inHub = true;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        ShowHubModal(slot, phase);
    }
});

Instance.OnScriptInput("hub_leave", ({ activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart) {
        return;
    }
    kart.inHub = false;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        HideHubModal(slot);
    }
});

// See PAINT_TRIGGER_NAME_PATTERN above for the Hammer-side naming
// convention — the color comes from the trigger's own name, not this
// input's parameter, so any number of differently-colored triggers can
// share this one handler.
Instance.OnScriptInput("melon_paint", ({ caller, activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart || !caller) {
        Debug("melon_paint: activator wasn't a tracked melon, ignoring");
        return;
    }
    const match = PAINT_TRIGGER_NAME_PATTERN.exec(caller.GetEntityName());
    if (!match) {
        Debug(`melon_paint: trigger "${caller.GetEntityName()}" doesn't match paint_trigger_<r>_<g>_<b>, ignoring`);
        return;
    }
    const [, r, g, b] = match.map(Number);
    SetKartPaintColor(kart, { r, g, b, a: 255 });
    Debug(`melon_paint: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} painted (${r}, ${g}, ${b})`);
});

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
        HideHubModal(event.player.GetPlayerSlot());
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
        RespawnKartAtCheckpoint(kart);
        SetUserMenuOpen(slot, kart, false);
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
    } else if (event.buttonId.startsWith("camdist_seg_")) {
        const step = Number(event.buttonId.slice("camdist_seg_".length));
        if (!Number.isInteger(step) || step < 0 || step >= CAMERA_DISTANCE_STEPS) {
            Debug(`camdist_seg_${step}: not a valid distance step, ignoring`);
            return;
        }
        const kart = karts.get(event.player.GetPlayerSlot());
        if (kart) {
            SetCameraDistance(kart, step);
        }
    }
});
