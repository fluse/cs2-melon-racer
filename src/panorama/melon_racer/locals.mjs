// The values the speedometer layout's parts are built with (build-panorama.mjs):
// every constant of the script by its own name ({{ SCOREBOARD_ROWS }},
// <each loop="slide in STAT_SLIDES">), so the panels the script fills in
// always match its counts and lists, plus a few helpers shaped for the
// layout. Only pure files (constants, logic), like the tests load.

import * as constants from "../../melon_drive/constants/index.js";
import { CAMERA_TUNING_SCALE, PHYSICS_TUNING_SCALE, ScaleSegmentCount } from "../../melon_drive/dev/tuning-scale-logic.js";

const { MELON_SKINS, MELON_SKIN_NAMES, MELON_SKINS_PER_PAGE, COLOR_PRESETS, STAT_SLIDES, BOUNCE_ANGLE_SEGMENTS, WALL_BOUNCE_OPTIMAL_ANGLE } = constants;

/** 0 .. n-1, for <each loop="i in range(n)">. @param {number} n */
const range = n => [...Array(n).keys()];

/** @template T @param {T[]} items @param {number} size @returns {T[][]} */
const Chunks = (items, size) => range(Math.ceil(items.length / size)).map(i => items.slice(i * size, (i + 1) * size));

const SKIN_GRID_COLUMNS = 3;

/** Every skin in MELON_SKINS order, with the name the grid shows. */
const skins = Object.keys(MELON_SKINS).map(key => ({ key, name: MELON_SKIN_NAMES[key] }));

/**
 * The skin grid's pages (MELON_SKINS_PER_PAGE each), in rows of
 * SKIN_GRID_COLUMNS; the free places of the last page null — every page
 * keeps all its places so the menu doesn't change height.
 */
const skinPages = Chunks(skins, MELON_SKINS_PER_PAGE).map(page => Chunks(
    range(MELON_SKINS_PER_PAGE).map(i => page[i] ?? null), SKIN_GRID_COLUMNS));

export default {
    ...constants,
    range,
    skins,
    skinPages,
    /** The glow color swatches, COLOR_PRESETS keys with their CSS class's suffix (red -> Red). */
    colors: Object.keys(COLOR_PRESETS).map(key => ({ key, suffix: key[0].toUpperCase() + key.slice(1) })),
    /** The profile's stat tiles, two per row. */
    statRows: Chunks(STAT_SLIDES, 2),
    /** Segments on the developer pages' scales. */
    cameraSegments: ScaleSegmentCount(CAMERA_TUNING_SCALE),
    physicsSegments: ScaleSegmentCount(PHYSICS_TUNING_SCALE),
    /** The bounce panel's angle segment holding the optimal angle (outlined as the target). */
    bounceTargetSegment: Math.floor(WALL_BOUNCE_OPTIMAL_ANGLE / (90 / BOUNCE_ANGLE_SEGMENTS)),
};
