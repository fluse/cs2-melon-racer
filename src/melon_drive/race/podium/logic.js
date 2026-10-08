// Pure podium rules — no cs_script import, so they're unit-testable in Node
// (see test/race/podium.test.mjs). race/podium/podium.js puts the melons
// there; movement/driving/drive.js holds them.
import { PODIUM_PLACES, PODIUM_PULL, PODIUM_PULL_MAX_SPEED } from "../../constants/index.js";

/**
 * A melon held on the podium: the spot it's pulled back over, and until when.
 * @typedef {{ place: number, spot: { x: number, y: number, z: number }, until: number }} PodiumHold
 */

/**
 * Who stands where: the first PODIUM_PLACES of the final standings (leader
 * first, see SortedStandings), as long as they're still among `presentKeys`
 * — a place whose racer has left stays empty, nobody moves up.
 * @param {string[]} rankedKeys player keys, leader first
 * @param {Set<string>} presentKeys player keys of the racers still on the map
 * @returns {Map<string, number>} player key -> place (1 = winner)
 */
export function PodiumPlaces(rankedKeys, presentKeys) {
    /** @type {Map<string, number>} */
    const places = new Map();
    rankedKeys.slice(0, PODIUM_PLACES).forEach((key, i) => {
        if (presentKeys.has(key)) {
            places.set(key, i + 1);
        }
    });
    return places;
}

/** Whether `hold` still holds the melon at `now`. @param {PodiumHold | undefined} hold @param {number} now */
export function PodiumHoldActive(hold, now) {
    return hold !== undefined && now < hold.until;
}

/**
 * The horizontal velocity that keeps a held melon over its spot: straight
 * back towards it, PODIUM_PULL per unit it's off, at most
 * PODIUM_PULL_MAX_SPEED. Zero right on it.
 * @param {{ x: number, y: number }} origin @param {{ x: number, y: number }} spot
 */
export function PodiumHoldVelocity(origin, spot) {
    const dx = spot.x - origin.x;
    const dy = spot.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) {
        return { x: 0, y: 0 };
    }
    const speed = Math.min(distance * PODIUM_PULL, PODIUM_PULL_MAX_SPEED);
    return { x: (dx / distance) * speed, y: (dy / distance) * speed };
}
