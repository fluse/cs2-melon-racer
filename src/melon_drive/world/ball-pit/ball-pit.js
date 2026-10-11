// Keeping the balls in their ball pits (see world/ball-pit/constants.js):
// every ball that left its pit trigger is steered back every tick until it's
// in again (ball_pit_enter), or dropped back in over the middle after
// BALL_PIT_DROP_SECONDS.
import { Instance } from "cs_script/point_script";
import { BALL_PIT_DROP_SECONDS } from "../../constants/index.js";
import { Debug } from "../../core/debug.js";
import { FindKartByMelon } from "../../core/kart-registry.js";
import { BallReturnVelocity, BallDropPosition } from "./logic.js";

/** @typedef {import("cs_script/point_script").Entity} Entity */

/** ball outside its pit -> the pit trigger it left and when. @type {Map<Entity, { pit: Entity, since: number }>} */
export const ballsOutside = new Map();

/** Whether `entity` is a ball a pit keeps: a physics prop that isn't a melon. @param {Entity | undefined} entity */
function IsBall(entity) {
    return !!entity && entity.IsValid() && entity.GetClassName().startsWith("prop_physics") && !FindKartByMelon(entity);
}

/** ball_pit_leave: `ball` left the pit trigger `pit`. @param {Entity | undefined} ball @param {Entity | undefined} pit */
export function BallLeftPit(ball, pit) {
    if (!IsBall(ball) || !pit) {
        return;
    }
    ballsOutside.set(/** @type {Entity} */ (ball), { pit, since: Instance.GetGameTime() });
}

/** ball_pit_enter: `ball` is in a pit (again). @param {Entity | undefined} ball */
export function BallEnteredPit(ball) {
    if (ball) {
        ballsOutside.delete(ball);
    }
}

/** Every tick: the balls outside steered back, or dropped back in. @param {number} now */
export function UpdateBallPits(now) {
    for (const [ball, { pit, since }] of ballsOutside) {
        if (!ball.IsValid() || !pit.IsValid()) {
            ballsOutside.delete(ball);
            continue;
        }
        const center = pit.GetAbsOrigin();
        if (now - since >= BALL_PIT_DROP_SECONDS) {
            ball.Teleport({ position: BallDropPosition(center, Math.random(), Math.random()), velocity: { x: 0, y: 0, z: 0 } });
            ballsOutside.delete(ball);
            Debug(`UpdateBallPits: a ball didn't make it back into ${pit.GetEntityName() || "its pit"}, dropped back in`);
            continue;
        }
        ball.Teleport({ velocity: BallReturnVelocity(ball.GetAbsOrigin(), ball.GetAbsVelocity(), center) });
    }
}
