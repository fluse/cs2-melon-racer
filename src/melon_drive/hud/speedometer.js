// The bottom-right cluster: speed, jump charge bar and health bar.
import { Instance } from "cs_script/point_script";
// Straight from jump.js, not movement/index.js: the HUD is imported by
// camera/, which the movement files import — going through the index would make a cycle.
import { GetJumpChargeFraction } from "../movement/jump/jump.js";
import { HealthBarState } from "../health/damage/logic.js";
import { MomentumMaxSpeed } from "../movement/momentum/logic.js";
import { GetSpeedHud } from "./layout.js";
import { UNITS_TO_KMH, JUMP_BAR_SEGMENTS, HEALTH_BAR_SEGMENTS, PERFECT_BOUNCE_FLASH_SECONDS, PERFECT_BOUNCE_ANGLE_FACTOR } from "../constants/index.js";

/** @param {number} slot @param {import("../core/kart-registry.js").Kart} kart */
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

/** @param {number} slot @param {import("../core/kart-registry.js").Kart} kart */
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
