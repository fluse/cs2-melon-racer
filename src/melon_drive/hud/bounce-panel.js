import { Instance } from "cs_script/point_script";
import { GetBounceRating } from "../movement/wall-bounce/logic.js";
import { GetSpeedHud } from "./layout.js";
import { BOUNCE_HUD_SECONDS, BOUNCE_ANGLE_SEGMENTS, BOUNCE_JUMP_SEGMENTS, BOUNCE_RATINGS } from "../constants/index.js";

/**
 * Wall-bounce feedback panel (bounce_panel in speedometer.xml), shown for
 * BOUNCE_HUD_SECONDS after each bounce: a rating word, the exact angle hit,
 * an angle scale with the hit's segment marked against the 45° target, and
 * how well the jump was timed. Reads kart.lastBounceInfo live, so a jump just
 * *after* the hit still updates the timing bar while the panel is up.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
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
