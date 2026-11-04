// Ghost melons: a see-through melon per station (prop_dynamic
// tutorial_ghost_<id>) driving the move the station teaches, round and round
// along its path (info_targets tutorial_ghost_<id>_1, _2, …) — e.g. into the
// wall at 45° and off it. Moved by the script on its own clock; seen by
// everyone. The path math is in ghost-logic.js.
import { Instance } from "cs_script/point_script";
import { Debug } from "../core/debug.js";
import { GhostPathLength, GhostPositionAt } from "./ghost-logic.js";
import { TUTORIAL_GHOST_NAME_PATTERN, TUTORIAL_GHOST_PATH_PREFIX, TUTORIAL_GHOST_SPEED, TUTORIAL_GHOST_PAUSE, TUTORIAL_GHOST_SCAN_SECONDS, TUTORIAL_GHOST_COLOR } from "../constants/index.js";

/** @type {{ entity: any, path: { x: number, y: number, z: number }[], length: number }[]} */
let ghosts = [];
let nextScanTime = 0;

/** Every tutorial_ghost_<id> with a path of at least two points. */
function FindGhosts() {
    /** @type {typeof ghosts} */
    const found = [];
    for (const entity of Instance.FindEntitiesByClass("prop_dynamic")) {
        const match = TUTORIAL_GHOST_NAME_PATTERN.exec(entity.GetEntityName());
        if (!match) {
            continue;
        }
        const path = [];
        for (let n = 1; ; n++) {
            const point = Instance.FindEntityByName(`${TUTORIAL_GHOST_PATH_PREFIX}${match[1]}_${n}`);
            if (!point) {
                break;
            }
            path.push(point.GetAbsOrigin());
        }
        if (path.length < 2) {
            Debug(`tutorial ghost ${entity.GetEntityName()}: needs ${TUTORIAL_GHOST_PATH_PREFIX}${match[1]}_1 and _2 at least, has ${path.length}`);
            continue;
        }
        entity.SetColor(TUTORIAL_GHOST_COLOR);
        found.push({ entity, path, length: GhostPathLength(path) });
    }
    return found;
}

/** Per tick (core/think.js): every ghost one step further along its path. @param {number} now */
export function UpdateTutorialGhosts(now) {
    if (now >= nextScanTime) {
        nextScanTime = now + TUTORIAL_GHOST_SCAN_SECONDS;
        ghosts = FindGhosts();
    }
    for (const ghost of ghosts) {
        if (!ghost.entity.IsValid()) {
            continue;
        }
        const { position, direction } = GhostPositionAt(ghost.path, ghost.length, now, TUTORIAL_GHOST_SPEED, TUTORIAL_GHOST_PAUSE);
        // Rolling: pitch turns with the distance (a 14-unit melon: ~4 degrees per unit).
        // Move, not Teleport: keeps the client's interpolation, so it glides.
        const yaw = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
        const pitch = (now * TUTORIAL_GHOST_SPEED * 4) % 360;
        ghost.entity.Move({ position, angles: { pitch, yaw, roll: 0 } });
    }
}
