// Water zones (WATER_* in zones/water/constants.js). Pure rules, no cs_script
// import; zones/water/water.js applies them (test/zones/water.test.mjs).
import { WATER_ENTRY_SPEED_KEEP } from "./constants.js";

/**
 * What's left of a velocity (or spin) when the melon lands in water: every
 * axis scaled by WATER_ENTRY_SPEED_KEEP.
 * @param {{ x: number, y: number, z: number }} v
 */
export function WaterEntryVelocity(v) {
    return { x: v.x * WATER_ENTRY_SPEED_KEEP, y: v.y * WATER_ENTRY_SPEED_KEEP, z: v.z * WATER_ENTRY_SPEED_KEEP };
}
