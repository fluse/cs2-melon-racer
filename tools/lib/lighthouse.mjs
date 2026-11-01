// The lighthouse's measures, shared by tools/models/make-lighthouse-model.mjs
// (the tower as a prop) and tools/models/make-parkour-model.mjs (the course
// winding up round it, its inner edge on the tower, onto the gallery). The
// model's origin is on the floor in the shaft's middle (the parkour's
// plateau), the gallery's opening towards +X; the parkour generator prints
// the yaw that turns the opening onto where the course arrives, and checks
// that the door and the windows aren't under its ramp.
// Angles in degrees, counter-clockwise seen from above, 0 = +X (the opening).

/** The shaft: radius at its foot (z 0) and at its top, height up to the gallery's deck (the finish). */
export const SHAFT = { r0: 256, r1: 176, height: 1792 };
/** The gallery round the shaft's top: its deck (top at SHAFT.height), the railing, the gap in it the course comes in through. */
export const GALLERY = { radius: 296, slab: 24, rail: 44, opening: 48 };
/** The door at the foot. */
export const DOOR = { angle: 84, width: 52, height: 104 };
/** The windows up the shaft (where the stairs inside would be): [angle, height of the window's middle]. */
export const WINDOWS = [[110, 303], [110, 660], [110, 1227], [250, 456], [250, 1021], [250, 1529]];
export const WINDOW = { width: 26, height: 52 };

/** The shaft's radius at height z (measured from its foot). */
export const ShaftRadius = z => SHAFT.r0 + ((SHAFT.r1 - SHAFT.r0) * z) / SHAFT.height;
