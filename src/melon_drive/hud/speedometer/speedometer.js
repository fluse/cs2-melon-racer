// The speed panel, bottom center: km/h, the health bar under it and the
// wall-jump dots next to it.
import { Instance } from "cs_script/point_script";
// Straight from jump.js, not movement/index.js: the HUD is imported by
// camera/, which the movement files import — going through the index would make a cycle.
import { GetWallJumpCharges } from "../../movement/jump/jump.js";
import { JumpDotFills } from "./logic.js";
import { HealthBarState } from "../../health/damage/logic.js";
import { MomentumMaxSpeed } from "../../movement/momentum/logic.js";
import { GetSpeedHud } from "../layout.js";
import { UNITS_TO_KMH, JUMP_DOT_FILL_STEPS, WALL_JUMP_CHARGES, HEALTH_BAR_SEGMENTS, HUD_RESEND_SECONDS, PERFECT_BOUNCE_FLASH_SECONDS, PERFECT_BOUNCE_ANGLE_FACTOR } from "../../constants/index.js";

/** @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart */
export function UpdateSpeedHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const vel = kart.melon.GetAbsVelocity();
    const horizSpeed = Math.hypot(vel.x, vel.y);
    const kmh = Math.round(horizSpeed * UNITS_TO_KMH);
    hud.SetDialogVariableStringForPlayer(slot, "speed_panel", "speed", String(kmh));
    // Wall-bounce feedback: Boosted while a bounce has the melon above its
    // normal top speed (momentum included — that's earned, not a boost), PerfectBounce as a short flash after a bounce that
    // was clean enough to cost (almost) no health.
    hud.SetHasClassForPlayer(slot, "speed_panel", "Boosted", horizSpeed > MomentumMaxSpeed(kart.momentum) + 1);
    const info = kart.lastBounceInfo;
    const perfectFlash =
        info !== undefined &&
        info.angleFactor >= PERFECT_BOUNCE_ANGLE_FACTOR &&
        kart.lastBounceTime !== undefined &&
        Instance.GetGameTime() - kart.lastBounceTime < PERFECT_BOUNCE_FLASH_SECONDS;
    hud.SetHasClassForPlayer(slot, "speed_panel", "PerfectBounce", perfectFlash);
}

/**
 * Whether `key`'s whole HUD state is due to be sent again (every
 * HUD_RESEND_SECONDS, and on the first call) — in between only changes are.
 * @param {import("../../core/kart-registry.js").Kart} kart @param {"health" | "jump"} key
 */
function HudResendDue(kart, key) {
    const now = Instance.GetGameTime();
    const due = (kart.hudResendAt ??= {});
    if (due[key] !== undefined && now < due[key]) {
        return false;
    }
    due[key] = now + HUD_RESEND_SECONDS;
    return true;
}

/**
 * Jump dots = the wall-jump charges (see GetWallJumpCharges, JumpDotFills):
 * a dot's fill ("jump_dot_<i>") is transparent by default and shown with
 * "On" while that charge is ready — nothing while it refills. Sent when a
 * dot changed (kart.hudJumpReady), and every dot again every
 * HUD_RESEND_SECONDS. One class per panel: several classes toggled on one
 * panel every tick never showed in-game.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart
 */
export function UpdateJumpHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const ready = JumpDotFills(GetWallJumpCharges(kart), WALL_JUMP_CHARGES).map((fill) => fill === JUMP_DOT_FILL_STEPS);
    const shown = HudResendDue(kart, "jump") ? undefined : kart.hudJumpReady;
    for (let i = 0; i < ready.length; i++) {
        if (shown === undefined || shown[i] !== ready[i]) {
            hud.SetHasClassForPlayer(slot, `jump_dot_${i}`, "On", ready[i]);
        }
    }
    kart.hudJumpReady = ready;
}

/**
 * Health bar under the km/h: HEALTH_BAR_SEGMENTS pieces, transparent by
 * default, the ones up to the health left shown with "On". Sent when the
 * count changed (kart.hudHealthSegments), and all of it again every
 * HUD_RESEND_SECONDS (see UpdateJumpHud).
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart
 */
export function UpdateHealthHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const filled = HealthBarState(kart.health).filledSegments;
    if (!HudResendDue(kart, "health") && filled === kart.hudHealthSegments) {
        return;
    }
    for (let i = 0; i < HEALTH_BAR_SEGMENTS; i++) {
        hud.SetHasClassForPlayer(slot, `health_seg_${i}`, "On", i < filled);
    }
    kart.hudHealthSegments = filled;
}
