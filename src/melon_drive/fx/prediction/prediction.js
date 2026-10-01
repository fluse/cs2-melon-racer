import { Instance, PointTemplate } from "cs_script/point_script";
import { Debug } from "../../core/debug.js";
import { WallAngleFactor, GetBounceRating } from "../../movement/wall-bounce/logic.js";
import { TraceLine, predictionDotSet } from "../../core/trace.js";
import {
    PREDICTION_ENABLED,
    PREDICTION_RENDER_MODE,
    PREDICTION_DOT_TEMPLATE_NAME,
    PREDICTION_LENGTH,
    PREDICTION_REFLECT_LENGTH,
    PREDICTION_DOTS_IN,
    PREDICTION_DOTS_OUT,
    PREDICTION_START_OFFSET,
    PREDICTION_MIN_SPEED,
    PREDICTION_NEUTRAL_COLOR,
    WALL_NORMAL_MAX_Z,
} from "../../constants/index.js";

// Wall-bounce prediction line — see PREDICTION_* in fx/prediction/constants.js for the
// design. Recomputed every tick from the melon's actual velocity (the same
// direction the bounce itself measures its angle from), and its angle
// rating comes from the same WallAngleFactor/GetBounceRating the bounce
// uses, so the line's color always matches the rating the hit would get.

const HIDDEN_COLOR = { r: 255, g: 255, b: 255, a: 0 };
// Only warn about a missing template once, not every tick.
let warnedMissingTemplate = false;

/**
 * @param {import("../../core/kart-registry.js").Kart} kart
 * @returns {any[] | null} this kart's dot entities, spawning them on first use; null if the map has no template
 */
function GetDots(kart) {
    const total = PREDICTION_DOTS_IN + PREDICTION_DOTS_OUT;
    const existing = (kart.predictionDots ?? []).filter((d) => d.IsValid());
    // Re-registered every call rather than only on spawn: a tools-mode hot
    // reload rebuilds core/trace.js's Set empty while karts (and their dots) persist.
    for (const dot of existing) {
        predictionDotSet.add(dot);
    }
    if (existing.length >= total) {
        kart.predictionDots = existing;
        return existing;
    }
    const template = Instance.FindEntityByName(PREDICTION_DOT_TEMPLATE_NAME);
    if (!(template instanceof PointTemplate)) {
        if (!warnedMissingTemplate) {
            warnedMissingTemplate = true;
            Debug(
                `prediction: no point_template named "${PREDICTION_DOT_TEMPLATE_NAME}" — falling back to DebugLine ` +
                `(dev environments only, real players won't see it)`
            );
        }
        return null;
    }
    const origin = kart.melon.GetAbsOrigin();
    while (existing.length < total) {
        const spawned = template.ForceSpawn(origin, { pitch: 0, yaw: 0, roll: 0 });
        if (!spawned || spawned.length === 0) {
            Debug(`prediction: ForceSpawn of "${PREDICTION_DOT_TEMPLATE_NAME}" returned nothing — check its Template entries`);
            break;
        }
        existing.push(spawned[0]);
        predictionDotSet.add(spawned[0]);
    }
    Debug(`prediction: kart has ${existing.length}/${total} dots, class ${existing[0]?.GetClassName() ?? "-"}`);
    kart.predictionDots = existing;
    return existing;
}

/** @param {any} dot @param {{ r: number, g: number, b: number, a: number }} color */
function SetDotColor(dot, color) {
    // Entity variables are reference-stable, so the last applied color can
    // be cached on the dot itself — skips re-sending an unchanged color
    // every tick.
    const key = `${color.r},${color.g},${color.b},${color.a}`;
    if (dot.predictionColorKey !== key && typeof dot.SetColor === "function") {
        dot.SetColor(color);
        dot.predictionColorKey = key;
    }
}

/** @param {import("../../core/kart-registry.js").Kart} kart */
export function HidePrediction(kart) {
    for (const dot of kart.predictionDots ?? []) {
        if (dot.IsValid()) {
            SetDotColor(dot, HIDDEN_COLOR);
        }
    }
}

/**
 * @param {any} from @param {{ x: number, y: number }} dir @param {number} length
 * @param {any[]} ignoreEntity
 */
function TraceAhead(from, dir, length, ignoreEntity) {
    return TraceLine({
        start: from,
        end: { x: from.x + dir.x * length, y: from.y + dir.y * length, z: from.z },
        ignoreEntity,
        ignorePlayers: true,
    });
}

/** @param {any} trace */
function IsWallHit(trace) {
    if (!trace.didHit || trace.startedInSolid || Math.abs(trace.normal.z) > WALL_NORMAL_MAX_Z) {
        return false;
    }
    const hit = trace.hitEntity;
    // Same rule as the bounce's DetectWallNormal: other physics props aren't walls.
    return !(hit && !hit.IsWorld() && hit.GetClassName().startsWith("prop_physics"));
}

/**
 * Evenly spaced points from `a` to `b`, `count` of them (b included).
 * @param {any} a @param {any} b @param {number} count
 */
function PointsAlong(a, b, count) {
    const points = [];
    for (let i = 1; i <= count; i++) {
        const t = i / count;
        points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
    return points;
}

/**
 * Whether this kart's player has the line switched on (user menu toggle,
 * off by default — see UpdatePredictionHud in hud/).
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function IsPredictionOn(kart) {
    return Boolean(kart.predictionLine);
}

/** Turns the line on/off for this kart's player. @param {import("../../core/kart-registry.js").Kart} kart @param {boolean} on */
export function SetPrediction(kart, on) {
    kart.predictionLine = on;
    if (!on) {
        HidePrediction(kart);
    }
}

/** @param {import("../../core/kart-registry.js").Kart} kart @param {number} dt */
export function UpdatePrediction(kart, dt) {
    if (PREDICTION_RENDER_MODE !== "dots") {
        HidePrediction(kart); // switched away from dots at runtime (hot reload) — don't leave them standing
    }
    if (!PREDICTION_ENABLED || !IsPredictionOn(kart) || kart.locked || kart.breaking || !kart.melon.IsValid()) {
        HidePrediction(kart);
        return;
    }
    const vel = kart.melon.GetAbsVelocity();
    const speed = Math.hypot(vel.x, vel.y);
    if (speed < PREDICTION_MIN_SPEED) {
        HidePrediction(kart);
        return;
    }
    const dir = { x: vel.x / speed, y: vel.y / speed };
    const center = kart.melon.GetAbsOrigin();
    const start = {
        x: center.x + dir.x * PREDICTION_START_OFFSET,
        y: center.y + dir.y * PREDICTION_START_OFFSET,
        z: center.z,
    };
    const ignoreEntity = [kart.melon, kart.pawn];

    const ahead = TraceAhead(center, dir, PREDICTION_LENGTH, ignoreEntity);
    const wallHit = IsWallHit(ahead);
    const end = ahead.didHit ? ahead.end : { x: center.x + dir.x * PREDICTION_LENGTH, y: center.y + dir.y * PREDICTION_LENGTH, z: center.z };

    let color = PREDICTION_NEUTRAL_COLOR;
    /** @type {any[]} */
    let outPoints = [];
    if (wallHit) {
        const nLen = Math.hypot(ahead.normal.x, ahead.normal.y) || 1;
        const n = { x: ahead.normal.x / nLen, y: ahead.normal.y / nLen };
        const into = -(dir.x * n.x + dir.y * n.y);
        if (into > 0) {
            const angle = (Math.acos(Math.min(1, into)) * 180) / Math.PI;
            color = GetBounceRating(WallAngleFactor(angle)).color;
            // Continue along the reflected direction, stopping at whatever
            // it would run into next.
            const out = { x: dir.x + 2 * into * n.x, y: dir.y + 2 * into * n.y };
            const back = TraceAhead(end, out, PREDICTION_REFLECT_LENGTH, ignoreEntity);
            const outEnd = back.didHit
                ? back.end
                : { x: end.x + out.x * PREDICTION_REFLECT_LENGTH, y: end.y + out.y * PREDICTION_REFLECT_LENGTH, z: end.z };
            outPoints = PointsAlong(end, outEnd, PREDICTION_DOTS_OUT);
        }
    }
    // The first leg starts at `start`, not the melon's center — skip the
    // leg entirely if the wall is closer than that.
    const firstLegLength = Math.hypot(end.x - center.x, end.y - center.y);
    const inPoints = firstLegLength > PREDICTION_START_OFFSET ? [start, ...PointsAlong(start, end, PREDICTION_DOTS_IN - 1)] : [];

    const dots = PREDICTION_RENDER_MODE === "dots" ? GetDots(kart) : null;
    if (!dots) {
        DrawDebugPrediction(start, end, inPoints.length > 0, outPoints, color, dt);
        return;
    }
    const inDots = dots.slice(0, PREDICTION_DOTS_IN);
    const outDots = dots.slice(PREDICTION_DOTS_IN);
    PlaceDots(inDots, inPoints, color);
    PlaceDots(outDots, outPoints, color);
}

/** @param {any[]} dots @param {any[]} points @param {{ r: number, g: number, b: number, a: number }} color */
function PlaceDots(dots, points, color) {
    for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        if (i < points.length) {
            dot.Teleport({ position: points[i] });
            SetDotColor(dot, color);
        } else {
            SetDotColor(dot, HIDDEN_COLOR);
        }
    }
}

/**
 * Fallback when the map has no dot template — only visible in dev
 * environments (tools mode), see PREDICTION_DOT_TEMPLATE_NAME.
 * @param {any} start @param {any} end @param {boolean} drawFirstLeg @param {any[]} outPoints
 * @param {{ r: number, g: number, b: number, a: number }} color @param {number} dt
 */
function DrawDebugPrediction(start, end, drawFirstLeg, outPoints, color, dt) {
    // Slightly longer than one tick so the line doesn't flicker between
    // redraws, short enough not to leave a visible trail.
    const duration = Math.max(0.02, dt * 1.5);
    if (drawFirstLeg) {
        Instance.DebugLine({ start, end, duration, color });
    }
    if (outPoints.length > 0) {
        Instance.DebugLine({ start: end, end: outPoints[outPoints.length - 1], duration, color });
    }
}
