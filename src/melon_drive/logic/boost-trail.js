// When the boost trail is on (see constants/boost-trail.js). Pure rule, no
// engine import — tested in test/boost-trail.test.mjs.
import { MAX_SPEED } from "../constants/driving.js";
import { BOOST_TRAIL_START_MARGIN, BOOST_TRAIL_STOP_MARGIN } from "../constants/boost-trail.js";

/**
 * Whether the trail should show this tick. Starts above MAX_SPEED +
 * BOOST_TRAIL_START_MARGIN, then keeps going down to MAX_SPEED +
 * BOOST_TRAIL_STOP_MARGIN (hysteresis, so it doesn't flicker). Never while
 * `blocked` (the melon is broken or race-locked).
 * @param {boolean} showing whether it's on right now
 * @param {number} horizSpeed the melon's horizontal speed, units/sec
 * @param {boolean} blocked
 */
export function ShouldShowBoostTrail(showing, horizSpeed, blocked) {
    if (blocked) {
        return false;
    }
    const margin = showing ? BOOST_TRAIL_STOP_MARGIN : BOOST_TRAIL_START_MARGIN;
    return horizSpeed > MAX_SPEED + margin;
}
