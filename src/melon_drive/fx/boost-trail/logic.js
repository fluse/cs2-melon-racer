// When the boost trail is on (see fx/boost-trail/constants.js). Pure rule, no
// engine import — tested in test/fx/boost-trail.test.mjs.
import { MAX_SPEED } from "../../movement/driving/constants.js";
import { BOOST_TRAIL_START_MARGIN, BOOST_TRAIL_STOP_MARGIN } from "./constants.js";

/**
 * Whether the trail should show this tick. Starts above MAX_SPEED +
 * BOOST_TRAIL_START_MARGIN, then keeps going down to MAX_SPEED +
 * BOOST_TRAIL_STOP_MARGIN (hysteresis, so it doesn't flicker). Always while
 * the attack boost is on (like Rocket League's boost: pressing it shows the
 * trail at once, whatever the speed). Not for speed a PERFECT wall bounce
 * gave — that one shows only its perfect-hit spark. Never while `blocked`
 * (the melon is broken or race-locked).
 * @param {boolean} showing whether it's on right now
 * @param {number} horizSpeed the melon's horizontal speed, units/sec
 * @param {boolean} blocked
 * @param {boolean} [attackBoosting] the attack boost is on this tick
 * @param {boolean} [perfectBounceBoost] the speed above MAX_SPEED is from a PERFECT bounce
 * @param {number} [normalMax] the melon's own top speed the margins count from — above MAX_SPEED with momentum (movement/momentum/logic.js)
 */
export function ShouldShowBoostTrail(showing, horizSpeed, blocked, attackBoosting = false, perfectBounceBoost = false, normalMax = MAX_SPEED) {
    if (blocked) {
        return false;
    }
    if (attackBoosting) {
        return true;
    }
    if (perfectBounceBoost) {
        return false;
    }
    const margin = showing ? BOOST_TRAIL_STOP_MARGIN : BOOST_TRAIL_START_MARGIN;
    return horizSpeed > normalMax + margin;
}
