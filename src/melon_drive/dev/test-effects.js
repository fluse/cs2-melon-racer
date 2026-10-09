// The user menu's test triggers for effects (DEVELOPER → "Test Triggers"):
// a break, a PERFECT wall bounce's feedback and the heal effect, on the
// clicking player's own melon, without crashing, hitting a wall at 45° or
// finding a heal zone. Each uses the same code the real thing runs. Not
// while racing (a heat's melon isn't for testing) or with the melon broken.
import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { BreakMelon } from "../health/breaking/breaking.js";
import { PlayHealEffect, RestoreFullHealth } from "../health/heal/index.js";
import { PlayPerfectSpark } from "../movement/wall-bounce/wall-bounce.js";
import { SetFreeLook } from "./free-look.js";
import { WALL_BOUNCE_OPTIMAL_ANGLE } from "../constants/index.js";

/**
 * Whether a test effect may play on this kart's melon now.
 * @param {import("../core/kart-registry.js").Kart} kart @param {string} what for the log
 */
function CanTestEffect(kart, what) {
    if (kart.racing || kart.breaking || kart.locked || !kart.melon.IsValid()) {
        Debug(`${what}: not now (racing=${kart.racing}, breaking=${kart.breaking}, locked=${kart.locked})`);
        return false;
    }
    return true;
}

/**
 * "Test Break": the melon breaks where it is — break effects and pieces,
 * break camera, and after BREAK_RESPAWN_DELAY the respawn at its respawn
 * point, like any break. Ends free look first (the break camera needs the
 * chase camera). Returns whether it broke.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 */
export function TestBreak(slot, kart) {
    if (!CanTestEffect(kart, "TestBreak")) {
        return false;
    }
    SetFreeLook(kart, false);
    const v = kart.melon.GetAbsVelocity();
    const speed = Math.hypot(v.x, v.y, v.z);
    // Standing still the pieces still need a direction to fly out along.
    BreakMelon(slot, kart, speed > 1 ? v : { x: 1, y: 0, z: 0 }, Math.max(speed, 1));
    return true;
}

/**
 * "Test Perfect Bounce": what a PERFECT wall bounce shows — the spark, the
 * bounce panel (45°, perfectly timed) and the speedometer's flash. Only the
 * feedback: no speed, no kick. Returns whether it played.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function TestPerfectBounce(kart) {
    if (!CanTestEffect(kart, "TestPerfectBounce")) {
        return false;
    }
    PlayPerfectSpark(kart);
    kart.lastBounceTime = Instance.GetGameTime();
    kart.lastBounceInfo = { angle: WALL_BOUNCE_OPTIMAL_ANGLE, angleFactor: 1, jumpFactor: 1 };
    return true;
}

/**
 * "Test Heal": the heal zone's effect on the melon, and its health refilled
 * (so the health bar shows it). Returns whether it played.
 * @param {import("../core/kart-registry.js").Kart} kart
 */
export function TestHeal(kart) {
    if (!CanTestEffect(kart, "TestHeal")) {
        return false;
    }
    PlayHealEffect(kart);
    RestoreFullHealth(kart);
    return true;
}
