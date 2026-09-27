import { Instance, CSInputs } from "cs_script/point_script";
import { Debug } from "./debug.js";
// Straight from jump.js, not physics/index.js: hud.js is imported by camera.js,
// which the physics files import — going through the index would make a cycle.
import { GetJumpChargeFraction } from "./physics/jump.js";
import { GetBounceRating } from "./logic/wall-bounce.js";
import { HealthBarState } from "./logic/health.js";
import { GetTrackConfig } from "./track-config.js";
import { IsModerator } from "./kart-registry.js";
import {
    SPEED_HUD_ENTITY_NAME,
    UNITS_TO_KMH,
    JUMP_BAR_SEGMENTS,
    HEALTH_BAR_SEGMENTS,
    MAX_SPEED,
    PERFECT_BOUNCE_FLASH_SECONDS,
    PERFECT_BOUNCE_ANGLE_FACTOR,
    BOUNCE_HUD_SECONDS,
    BOUNCE_ANGLE_SEGMENTS,
    BOUNCE_JUMP_SEGMENTS,
    BOUNCE_RATINGS,
    RacePhase,
} from "./constants.js";

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

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart */
export function UpdateSpeedHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const vel = kart.melon.GetAbsVelocity();
    const horizSpeed = Math.hypot(vel.x, vel.y);
    const kmh = Math.round(horizSpeed * UNITS_TO_KMH);
    hud.SetDialogVariableStringForPlayer(slot, "speed_panel", "speed", String(kmh));
    // Wall-bounce feedback: Boosted while a bounce has the melon above the
    // normal top speed, PerfectBounce as a short flash after a bounce that
    // was clean enough to cost (almost) no health.
    hud.SetHasClassForPlayer(slot, "speed_panel", "Boosted", horizSpeed > MAX_SPEED + 1);
    const info = kart.lastBounceInfo;
    const perfectFlash =
        info !== undefined &&
        info.angleFactor >= PERFECT_BOUNCE_ANGLE_FACTOR &&
        kart.lastBounceTime !== undefined &&
        Instance.GetGameTime() - kart.lastBounceTime < PERFECT_BOUNCE_FLASH_SECONDS;
    hud.SetHasClassForPlayer(slot, "speed_panel", "PerfectBounce", perfectFlash);
}

/**
 * Wall-bounce feedback panel (bounce_panel in speedometer.xml), shown for
 * BOUNCE_HUD_SECONDS after each bounce: a rating word, the exact angle hit,
 * an angle scale with the hit's segment marked against the 45° target, and
 * how well the jump was timed. Reads kart.lastBounceInfo live, so a jump just
 * *after* the hit still updates the timing bar while the panel is up.
 * @param {number} slot @param {import("./kart-registry.js").Kart} kart
 */
export function UpdateBounceHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const info = kart.lastBounceInfo;
    const visible =
        info !== undefined &&
        kart.lastBounceTime !== undefined &&
        Instance.GetGameTime() - kart.lastBounceTime < BOUNCE_HUD_SECONDS;
    hud.SetHasClassForPlayer(slot, "bounce_panel", "Hidden", !visible);
    if (!visible || !info) {
        return;
    }

    const rating = GetBounceRating(info.angleFactor);
    for (const r of BOUNCE_RATINGS) {
        hud.SetHasClassForPlayer(slot, "bounce_panel", r.cssClass, r === rating);
    }
    hud.SetDialogVariableStringForPlayer(slot, "bounce_panel", "bounce_rating", rating.label);
    hud.SetDialogVariableStringForPlayer(slot, "bounce_panel", "bounce_angle", String(Math.round(info.angle)));

    const hitSegment = Math.min(BOUNCE_ANGLE_SEGMENTS - 1, Math.floor((info.angle / 90) * BOUNCE_ANGLE_SEGMENTS));
    for (let i = 0; i < BOUNCE_ANGLE_SEGMENTS; i++) {
        hud.SetHasClassForPlayer(slot, `bounce_angle_seg_${i}`, "Hit", i === hitSegment);
    }
    const jumpFilled = Math.round(info.jumpFactor * BOUNCE_JUMP_SEGMENTS);
    for (let i = 0; i < BOUNCE_JUMP_SEGMENTS; i++) {
        hud.SetHasClassForPlayer(slot, `bounce_jump_seg_${i}`, "Filled", i < jumpFilled);
    }
}

/** Jump bar = the wall-jump charge (see GetJumpChargeFraction). @param {number} slot @param {{ wallJumpCharge?: number }} kart */
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
export function UpdateHealthHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const bar = HealthBarState(kart.health);
    for (let i = 0; i < HEALTH_BAR_SEGMENTS; i++) {
        hud.SetHasClassForPlayer(slot, `health_seg_${i}`, "Filled", i < bar.filledSegments);
    }
    hud.SetHasClassForPlayer(slot, "health_bar", "Low", bar.low);
    hud.SetHasClassForPlayer(slot, "health_bar", "Critical", bar.critical);
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

/**
 * The layout has a single input-capture flag per player, but two independent
 * modals want it (hub_modal while standing in the hub, user_menu via USE
 * anywhere) and can be open at the same time. Derived from both instead of
 * each modal blindly setting it — otherwise closing either one (e.g. the
 * user menu while standing in the hub, or leaving the hub with the user menu
 * open) left the other one on screen without a mouse to click it with.
 * @param {any} hud @param {number} slot @param {import("./kart-registry.js").Kart} kart
 */
function SyncInputCapture(hud, slot, kart) {
    hud.SetInputCaptureEnabled(slot, Boolean(kart.hubModalOpen || kart.userMenuOpen));
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart @param {typeof RacePhase[keyof typeof RacePhase]} currentPhase */
export function ShowHubModal(slot, kart, currentPhase) {
    kart.hubModalOpen = true;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", false);
    ApplyHubModalState(slot, currentPhase);
    SyncInputCapture(hud, slot, kart);
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart */
export function HideHubModal(slot, kart) {
    kart.hubModalOpen = false;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", true);
    SyncInputCapture(hud, slot, kart);
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
    SyncInputCapture(hud, slot, kart);
}

/** @param {number} slot @param {import("./kart-registry.js").Kart} kart */
export function UpdateUserMenu(slot, kart) {
    if (kart.pawn.WasInputJustPressed(CSInputs.USE)) {
        SetUserMenuOpen(slot, kart, !kart.userMenuOpen);
    }
}
