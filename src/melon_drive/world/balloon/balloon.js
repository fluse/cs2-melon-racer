// Balloon balls (see world/balloon/constants.js): every physics ball with
// the ball model floats — each tick its velocity gets air drag and the
// engine's gravity taken back out but for a slow sinking (BalloonVelocity).
// The map is searched for new balls every BALLOON_SCAN_SECONDS, so spawned
// ones (world/ball-spawner/) and respawned ones are found too.
import { Instance } from "cs_script/point_script";
import { BALLOON_CLASSES, BALLOON_SCAN_SECONDS, GRAVITY } from "../../constants/index.js";
import { IsBalloonModel, BalloonVelocity } from "./logic.js";

/** @typedef {import("cs_script/point_script").Entity} Entity */

/** Every balloon ball found. @type {Set<Entity>} */
export const balloons = new Set();
let nextScanTime = -Infinity;

/** Adds the balloon balls not known yet. */
function ScanBalloons() {
    for (const className of BALLOON_CLASSES) {
        for (const entity of Instance.FindEntitiesByClass(className)) {
            if (!balloons.has(entity) && IsBalloonModel(/** @type {any} */ (entity).GetModelName?.() ?? "")) {
                balloons.add(entity);
            }
        }
    }
}

/** Every tick: now and then a look for new balls; every ball floats. @param {number} now @param {number} dt */
export function UpdateBalloons(now, dt) {
    if (now >= nextScanTime) {
        nextScanTime = now + BALLOON_SCAN_SECONDS;
        ScanBalloons();
    }
    if (dt <= 0 || dt > 0.5) {
        return; // a stall or a reload: no tick worth of gravity to undo
    }
    for (const ball of balloons) {
        if (!ball.IsValid()) {
            balloons.delete(ball);
            continue;
        }
        ball.Move({ velocity: BalloonVelocity(ball.GetAbsVelocity(), dt, GRAVITY) });
    }
}
