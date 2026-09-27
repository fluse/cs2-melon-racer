import { Instance } from "cs_script/point_script";

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
// logic in the sibling modules below — see constants/ for tunables,
// kart-registry.js for the kart/moderator bookkeeping, race-flow.js for the
// hub/countdown/racing/break state machine, kart-spawn.js / physics/ for
// melon spawning and per-tick movement, jumping, damage and breaking, hud.js/camera.js for the
// speedometer/HUD and chase camera, checkpoints.js for lap tracking, and
// think.js for the per-tick driver.

import { Debug } from "./debug.js";
import { PAINT_TRIGGER_NAME_PATTERN, COLOR_PRESETS, CAMERA_DISTANCE_STEPS, CAMERA_HEIGHT_STEPS, HUB_TRIGGER_NAME, TELEPORT_UP_OFFSET } from "./constants/index.js";
import { karts, EnsureModerator, IsModerator, FindKartByMelon, moderatorSlot, SetModeratorSlot, DropKart } from "./kart-registry.js";
import { SetUpPlayerKart, ForgetIntroLogo } from "./kart-spawn.js";
import { Lifted, LevelAngles } from "./spawn-points.js";
import { ParseTeleportTrigger, TeleportExitVelocity } from "./logic/teleport.js";
import { HealZoneRate } from "./logic/health.js";
import { RespawnKartAtCheckpoint, SetKartPaintColor, TeleportKartTo, IsJumpDebugOn, SetJumpDebug } from "./physics/index.js";
import { GetSpeedHud, ShowHubModal, HideHubModal, SetUserMenuOpen, UpdateJumpDebugHud } from "./hud.js";
import { SetCameraDistance, SetCameraHeight } from "./camera.js";
import { phase, activeTrackId, phaseEndTime, TryStartRace, TryAbortRace, ReturnAllToHub, SendKartToTutorial, RestoreRaceFlowSnapshot } from "./race-flow.js";
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

// A reset keeps an existing kart where it is and just re-attaches it to the
// pawn. A player without one gets it from EnsurePlayerKarts (think.js):
// the logo first, then a melon in the tutorial (intro_spawn).
Instance.OnPlayerReset(({ player }) => {
    Debug(`OnPlayerReset: slot=${player.GetPlayerController()?.GetPlayerSlot()}`);
    SetUpPlayerKart(player, undefined);
});

Instance.OnPlayerDisconnect(({ playerSlot }) => {
    ForgetIntroLogo(playerSlot);
    const kart = karts.get(playerSlot);
    if (kart) {
        DropKart(playerSlot, kart);
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
Instance.OnScriptInput("hub_enter", ({ caller, activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart) {
        Debug("hub_enter: activator wasn't a tracked melon, ignoring");
        return;
    }
    // Only the hub's own start area may open the start modal. A trigger
    // elsewhere wired to hub_enter by mistake (the intro's pass-through to
    // the hub was — that should be hub_teleport) showed "start race" to
    // players just driving through, and without a matching hub_leave it
    // never closed again. test/map-io.test.mjs catches this in the .vmap.
    // trim(): Hammer happily keeps a stray trailing space in a name (the map's
    // hub trigger had one), which would otherwise reject the real trigger.
    const callerName = caller?.GetEntityName().trim();
    if (callerName !== HUB_TRIGGER_NAME) {
        Instance.Msg(`[melon_drive] hub_enter fired by "${callerName ?? "?"}", not "${HUB_TRIGGER_NAME}" — ignoring. To send melons to the hub, use RunScriptInput hub_teleport instead.`);
        return;
    }
    kart.inHub = true;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        ShowHubModal(slot, kart, phase);
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
        HideHubModal(slot, kart);
    }
});

// Hub teleporter: any trigger_multiple (filtered to prop_physics) whose
// OnStartTouch calls RunScriptInput "hub_teleport" on this point_script sends
// the touching melon back to the hub — same single-kart path as the user
// menu's hub button, so a racer who rolls over it also leaves the heat.
Instance.OnScriptInput("hub_teleport", ({ activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart) {
        Debug("hub_teleport: activator wasn't a tracked melon, ignoring");
        return;
    }
    Debug(`hub_teleport: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} returning to hub (racing=${kart.racing}, phase=${phase})`);
    ReturnAllToHub([kart]);
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

// Generic teleporter — see TELEPORT_TRIGGER_NAME_PATTERN for the Hammer
// convention: the destination comes from the touched trigger's own name
// (teleport_to_<destination>), so every teleporter shares this handler.
// Msg, not Debug, for wiring mistakes: a teleporter that silently does
// nothing is hard to spot otherwise.
Instance.OnScriptInput("melon_teleport", ({ caller, activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart || !caller) {
        Debug("melon_teleport: activator wasn't a tracked melon, ignoring");
        return;
    }
    if (kart.breaking || kart.locked) {
        return; // broken (about to respawn) or parked by the race flow — leave it where it is
    }
    const triggerName = caller.GetEntityName();
    const parsed = ParseTeleportTrigger(triggerName);
    if (!parsed) {
        Instance.Msg(`[melon_drive] melon_teleport: trigger "${triggerName}" isn't named teleport_[stop_|keep_]to_<destination>, ignoring`);
        return;
    }
    const destinationName = parsed.destination;
    const destination = Instance.FindEntityByName(destinationName);
    if (!destination) {
        Instance.Msg(`[melon_drive] melon_teleport: trigger "${triggerName}" points at "${destinationName}", but no entity has that name`);
        return;
    }
    const yaw = destination.GetAbsAngles().yaw;
    // Lifted like the race-flow teleports: a destination placed on (or
    // sunk into) the floor would otherwise embed the melon in it.
    TeleportKartTo(
        kart,
        Lifted(destination.GetAbsOrigin(), TELEPORT_UP_OFFSET),
        LevelAngles(yaw),
        TeleportExitVelocity(kart.melon.GetAbsVelocity(), yaw, parsed.keepSpeed)
    );
    Debug(`melon_teleport: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} -> "${destinationName}"`);
});

// Heal zones — see HEAL_ZONE_RATE for the Hammer convention: OnStartTouch ->
// "heal_enter", OnEndTouch -> "heal_leave". The trigger itself (caller) is
// remembered, so overlapping zones and their leaves are tracked separately;
// its name may set the rate (heal_zone_<rate>). Healing happens per tick in
// ApplyHealing (physics/heal.js).
Instance.OnScriptInput("heal_enter", ({ caller, activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart || !caller) {
        Debug("heal_enter: activator wasn't a tracked melon, ignoring");
        return;
    }
    const rate = HealZoneRate(caller.GetEntityName());
    (kart.healZones ??= new Map()).set(caller, rate);
    Debug(`heal_enter: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} in "${caller.GetEntityName()}" (${rate}/s)`);
});

Instance.OnScriptInput("heal_leave", ({ caller, activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart || !caller) {
        return;
    }
    kart.healZones?.delete(caller);
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
    } else if (event.buttonId === "usermenu_jumpdebug_button") {
        // Per player: only this player's melon is drawn/logged (debug
        // draws themselves only show in tools mode).
        const slot = event.player.GetPlayerSlot();
        const kart = karts.get(slot);
        if (kart) {
            SetJumpDebug(kart, !IsJumpDebugOn(kart));
            UpdateJumpDebugHud(slot, kart);
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
    } else if (event.buttonId.startsWith("camheight_seg_")) {
        const step = Number(event.buttonId.slice("camheight_seg_".length));
        if (!Number.isInteger(step) || step < 0 || step >= CAMERA_HEIGHT_STEPS) {
            Debug(`camheight_seg_${step}: not a valid height step, ignoring`);
            return;
        }
        const kart = karts.get(event.player.GetPlayerSlot());
        if (kart) {
            SetCameraHeight(kart, step);
        }
    }
});
