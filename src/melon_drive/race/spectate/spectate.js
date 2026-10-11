// Spectating a Grand Prix: the chase camera on someone else's melon. Two
// ways in (rules in logic.js, SpectateMode):
// - a racer who finished, while the others still have the finish window
//   (FINISH_GRACE_SECONDS) — on its own, SPECTATE_AFTER_FINISH_SECONDS
//   after crossing the line;
// - a player outside the Grand Prix, by "Watch Grand Prix" (user menu, hub
//   window) — for as long as it runs. Their own melon waits frozen
//   meanwhile, like in free look.
// Mouse1 / D next, Mouse2 / A previous (SpectateCandidates' order: the one
// furthest ahead first); the mouse turns the view around the watched melon
// as around one's own. R leaves: a watcher stops watching, a finished racer
// goes back to their own melon for the rest of the heat. The camera itself is camera/follow/'s, pointed at
// kart.spectateSlot's melon.
import { Instance, CSInputs, CustomCameraMode } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { karts } from "../../core/kart-registry.js";
import { GetSpeedHud } from "../../hud/layout.js";
import { ApplyCameraFollow } from "../../camera/index.js";
import { SetFreeLook } from "../../dev/free-look.js";
import { HUD_RESEND_SECONDS } from "../../constants/index.js";
import { IsHeatPhase, SpectateMode, SpectateCandidates, StepSpectateTarget } from "./logic.js";

/** @typedef {import("../../core/kart-registry.js").Kart} Kart */

/**
 * Whether this player may start watching the Grand Prix now: one runs and
 * they aren't in it, their melon is whole and on the map.
 * @param {Kart} kart @param {string} phase
 */
export function CanWatch(kart, phase) {
    return IsHeatPhase(phase) && !kart.racing && !kart.breaking && kart.melon.IsValid();
}

/**
 * "Watch Grand Prix" on/off for a player outside it. On: free look off,
 * the melon frozen where it is (physics motion off, like free look) — the
 * camera moves over to the racers on the next UpdateSpectating. Returns
 * whether they watch now.
 * @param {Kart} kart @param {boolean} on @param {string} phase
 */
export function SetWatching(kart, on, phase) {
    if (!on) {
        StopSpectating(kart);
        return false;
    }
    if (kart.watching) {
        return true;
    }
    if (!CanWatch(kart, phase)) {
        Debug(`SetWatching: slot ${SlotOf(kart)} can't watch now (phase=${phase}, racing=${kart.racing}, breaking=${kart.breaking})`);
        return false;
    }
    SetFreeLook(kart, false);
    kart.watching = true;
    kart.melon.Move({ velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } });
    Instance.EntFireAtTarget({ target: kart.melon, input: "DisableMotion" });
    kart.lastVelocity = undefined;
    kart.settled = false;
    Debug(`SetWatching: slot ${SlotOf(kart)} watches the Grand Prix`);
    return true;
}

/**
 * Back to the own melon, from either kind of spectating: a watcher's melon
 * let go again, the camera back on it (not in free look or mid-break, which
 * own the camera), and a finished racer's FINISH image up again. Every path
 * that sends a melon somewhere (hub, tutorial, respawn, a new heat) calls it.
 * @param {Kart} kart
 */
export function StopSpectating(kart) {
    if (kart.watching) {
        kart.watching = false;
        if (kart.melon.IsValid() && !kart.freeLook) {
            Instance.EntFireAtTarget({ target: kart.melon, input: "EnableMotion" });
        }
        kart.lastVelocity = undefined;
        kart.settled = false;
        Debug(`StopSpectating: slot ${SlotOf(kart)} stops watching`);
    }
    EndSpectateView(kart);
}

/**
 * Per tick, after the race flow: who spectates whom, the next/previous
 * buttons, and the spectate HUD; plus the user menu's "Watch Grand Prix"
 * row. Watchers drop out once the Grand Prix is over (or they're in a heat,
 * breaking, in free look).
 * @param {number} now @param {string} phase
 */
export function UpdateSpectating(now, phase) {
    const racers = [...karts.entries()].filter(([, kart]) => kart.racing);
    for (const [slot, kart] of karts) {
        if (kart.watching && (!IsHeatPhase(phase) || kart.racing || kart.breaking || kart.freeLook || !kart.melon.IsValid())) {
            StopSpectating(kart);
        }
        UpdateWatchRow(slot, kart, phase);
        if (kart.spectateSlot !== undefined && kart.pawn.IsValid() && kart.pawn.WasInputJustPressed(CSInputs.RELOAD)) {
            Debug(`UpdateSpectating: slot ${slot} pressed R, back to the own melon`);
            if (kart.racing) {
                kart.spectateDismissed = true;
            }
            StopSpectating(kart);
            continue;
        }
        const othersDriving = racers.some(([, other]) => other !== kart && !other.finished);
        const mode = SpectateMode(kart, phase, now, othersDriving);
        const candidates = mode === undefined ? [] : SpectateCandidates(
            racers
                .filter(([, other]) => other !== kart && other.melon.IsValid())
                .map(([key, other]) => ({ key, laps: other.lapsCompleted, checkpoint: other.checkpointIndex, finished: other.finished })),
            mode === "watcher",
        );
        const target = StepSpectateTarget(candidates, kart.spectateSlot, SpectateInput(kart));
        if (target === undefined) {
            EndSpectateView(kart);
            continue;
        }
        if (kart.spectateSlot === undefined) {
            BeginSpectateView(slot, kart);
        }
        if (target !== kart.spectateSlot) {
            kart.spectateSlot = target;
            kart.cameraWallScale = undefined; // the wall pull-in starts over at the new melon
            kart.appliedFollowKey = undefined;
            Debug(`UpdateSpectating: slot ${slot} (${mode}) watches slot ${target}`);
        }
        const name = karts.get(target)?.pawn.GetPlayerController()?.GetPlayerName() ?? "";
        SetSpectateHud(slot, kart, `${mode}|${name}`, now);
    }
}

/**
 * This tick's next (1) / previous (-1) press: Mouse1 or D / Mouse2 or A.
 * Not while Tab holds the scoreboard (A/D page it) or a menu has the mouse.
 * @param {Kart} kart
 */
function SpectateInput(kart) {
    const pawn = kart.pawn;
    if (!pawn.IsValid() || pawn.IsInputPressed(CSInputs.SHOW_SCORES) || kart.userMenuOpen || kart.hubModalOpen) {
        return 0;
    }
    if (pawn.WasInputJustPressed(CSInputs.ATTACK) || pawn.WasInputJustPressed(CSInputs.RIGHT)) {
        return 1;
    }
    if (pawn.WasInputJustPressed(CSInputs.ATTACK2) || pawn.WasInputJustPressed(CSInputs.LEFT)) {
        return -1;
    }
    return 0;
}

/**
 * The camera leaves the own melon: a side view the own melon had is dropped
 * (the follow camera takes over), a finished racer's FINISH image hidden —
 * it would cover the watched melon.
 * @param {number} slot @param {Kart} kart
 */
function BeginSpectateView(slot, kart) {
    if ((kart.sideViewBlend ?? 0) > 0) {
        kart.sideViewBlend = 0;
        kart.sideViewZone = undefined;
        kart.sideViewLast = undefined;
        kart.pawn.GetCustomCamera().SetMode(CustomCameraMode.FOLLOW_POSITION);
    }
    const hud = GetSpeedHud();
    hud?.SetHasClassForPlayer(slot, "finish_image", "Hidden", true);
    hud?.SetHasClassForPlayer(slot, "finish_place", "Hidden", true);
}

/** Back to the own melon's camera and HUD (see StopSpectating). @param {Kart} kart */
function EndSpectateView(kart) {
    if (kart.spectateSlot === undefined) {
        return;
    }
    kart.spectateSlot = undefined;
    const slot = SlotOf(kart);
    if (kart.melon.IsValid() && !kart.breaking && !kart.freeLook && kart.pawn.IsValid()) {
        ApplyCameraFollow(kart);
    }
    kart.spectateResendAt = undefined;
    SetSpectateHud(slot, kart, undefined, Instance.GetGameTime());
    if (slot !== undefined && kart.racing && kart.finished) {
        // FINISH again (TIME UP has no image) — up until the next heat or the hub.
        GetSpeedHud()?.SetHasClassForPlayer(slot, "finish_image", "Hidden", Boolean(kart.timedOut));
        GetSpeedHud()?.SetHasClassForPlayer(slot, "finish_place", "Hidden", false);
    }
}

/**
 * The spectate panel: "mode|name" — who's watched (mode "watcher" or
 * "racer", the panel's Watching class) — or hidden with undefined. Sent on change and again every
 * HUD_RESEND_SECONDS.
 * @param {number | undefined} slot @param {Kart} kart @param {string | undefined} value @param {number} now
 */
function SetSpectateHud(slot, kart, value, now) {
    if (value === kart.spectateShown && now < (kart.spectateResendAt ?? 0)) {
        return;
    }
    kart.spectateShown = value;
    kart.spectateResendAt = now + HUD_RESEND_SECONDS;
    const hud = GetSpeedHud();
    if (slot === undefined || !hud) {
        return;
    }
    const [mode, name] = value?.split("|") ?? [];
    if (name !== undefined) {
        hud.SetDialogVariableStringForPlayer(slot, "spectate_panel", "name", name);
    }
    hud.SetHasClassForPlayer(slot, "spectate_panel", "Watching", mode === "watcher");
    hud.SetHasClassForPlayer(slot, "spectate_panel", "Hidden", value === undefined);
}

/**
 * The user menu's "Watch Grand Prix" / "Stop Watching" row: only while a
 * Grand Prix runs that the player isn't in. Sent on change.
 * @param {number} slot @param {Kart} kart @param {string} phase
 */
function UpdateWatchRow(slot, kart, phase) {
    const key = kart.watching ? "stop" : CanWatch(kart, phase) ? "watch" : "";
    if (key === kart.watchRowShown) {
        return;
    }
    kart.watchRowShown = key;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    if (key !== "") {
        hud.SetDialogVariableStringForPlayer(slot, "usermenu_watch_button", "watch_label", key === "stop" ? "Stop Watching" : "Watch Grand Prix");
    }
    hud.SetHasClassForPlayer(slot, "usermenu_watch_row", "Hidden", key === "");
}

/**
 * Clicked "Watch Grand Prix" / "Stop Watching" (the user menu's row):
 * toggles watching. Returns whether anything changed.
 * @param {Kart} kart @param {string} phase
 */
export function ToggleWatching(kart, phase) {
    const was = Boolean(kart.watching);
    const now = SetWatching(kart, !was, phase);
    kart.watchRowShown = undefined; // the label changes right away
    return now !== was;
}

/** @param {Kart} kart */
function SlotOf(kart) {
    return kart.pawn.IsValid() ? kart.pawn.GetPlayerController()?.GetPlayerSlot() : undefined;
}
