import { Instance, CSInputs } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { GetJumpChargeFraction } from "./kart-physics.js";
import { GetTrackConfig } from "./track-config.js";
import { IsModerator } from "./kart-registry.js";
import { SPEED_HUD_ENTITY_NAME, UNITS_TO_KMH, JUMP_BAR_SEGMENTS, RacePhase } from "./constants.js";

/** @type {any} */
let speedHud = null;
export function GetSpeedHud() {
    if (!speedHud || !speedHud.IsValid()) {
        speedHud = Instance.FindEntityByName(SPEED_HUD_ENTITY_NAME);
        if (!speedHud) {
            Debug(`GetSpeedHud: no entity named "${SPEED_HUD_ENTITY_NAME}" found — add a custom_hud_layout in Hammer`);
        }
    }
    return speedHud;
}

/** @param {number} slot @param {any} melon */
export function UpdateSpeedHud(slot, melon) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const vel = melon.GetAbsVelocity();
    const kmh = Math.round(Math.hypot(vel.x, vel.y) * UNITS_TO_KMH);
    hud.SetDialogVariableStringForPlayer(slot, "speed_panel", "speed", String(kmh));
}

/** @param {number} slot @param {{ nextJumpTime: number }} kart */
export function UpdateJumpHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const charge = GetJumpChargeFraction(kart);
    const filledSegments = Math.round(charge * JUMP_BAR_SEGMENTS);
    for (let i = 0; i < JUMP_BAR_SEGMENTS; i++) {
        hud.SetHasClassForPlayer(slot, `jump_seg_${i}`, "Filled", i < filledSegments);
    }
    hud.SetHasClassForPlayer(slot, "jump_bar", "Ready", charge >= 1);
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart */
export function UpdateCheckpointHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const trackId = kart.trackId;
    hud.SetHasClassForPlayer(slot, "checkpoint_panel", "Hidden", trackId === undefined);
    if (trackId === undefined) {
        return;
    }
    const config = GetTrackConfig()[trackId];
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "current", String(kart.checkpointIndex));
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "total", config ? String(config.checkpoints) : "?");
    const currentLap = config ? Math.min(kart.lapsCompleted + 1, config.lapsToWin) : kart.lapsCompleted + 1;
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "lap_current", String(currentLap));
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "lap_total", config ? String(config.lapsToWin) : "?");
}

// Kept in sync every tick (see Think in think.js) as well as on hub_enter,
// since a standing-in-hub player's WaitingForOthers/IsModerator state can
// change underneath them — a heat starting/ending elsewhere, or the
// moderator disconnecting and reassigning to whoever's currently in the hub.
// `currentPhase` is passed in rather than imported from race-flow.js so
// this module has no dependency on it (race-flow.js already depends on this
// one, for Show/HideHubModal — an import back the other way would make the
// two modules circular for the sake of a single enum comparison).
/** @param {number} slot @param {typeof RacePhase[keyof typeof RacePhase]} currentPhase */
export function ApplyHubModalState(slot, currentPhase) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "WaitingForOthers", currentPhase !== RacePhase.HUB);
    hud.SetHasClassForPlayer(slot, "hub_modal", "IsModerator", IsModerator(slot));
}

/** @param {number} slot @param {typeof RacePhase[keyof typeof RacePhase]} currentPhase */
export function ShowHubModal(slot, currentPhase) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", false);
    ApplyHubModalState(slot, currentPhase);
    hud.SetInputCaptureEnabled(slot, true);
}

/** @param {number} slot */
export function HideHubModal(slot) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", true);
    hud.SetInputCaptureEnabled(slot, false);
}

// User menu: press USE anywhere (regardless of race phase) to open a small
// panel with actions/settings that aren't tied to any single map trigger —
// currently "respawn at last checkpoint" and a color picker, with room to
// add more rows later (see "usermenu_*" buttonId handling in index.js's
// OnCustomHudClicked). Deliberately independent of kart.locked/breaking so
// it also works as an unstuck button while the melon is frozen.
/** @param {number} slot @param {import("./kart-registry.js").Kart} kart @param {boolean} open */
export function SetUserMenuOpen(slot, kart, open) {
    kart.userMenuOpen = open;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "user_menu", "Hidden", !open);
    // NOTE: like hub_modal above, this blindly sets the whole layout's
    // capture flag rather than combining with hub_modal's own on/off calls.
    // The two modals are opened from unrelated triggers (standing in the
    // hub vs. pressing USE anywhere) and aren't expected to be shown at the
    // same time; if that ever changes, this'll need to track combined state
    // instead of each panel fighting over one shared flag.
    hud.SetInputCaptureEnabled(slot, open);
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart */
export function UpdateUserMenu(slot, kart) {
    if (kart.pawn.WasInputJustPressed(CSInputs.USE)) {
        SetUserMenuOpen(slot, kart, !kart.userMenuOpen);
    }
}
