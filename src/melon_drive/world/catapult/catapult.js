// Catapults (see world/catapult/constants.js): each base (a prop_physics) is
// paired with the arm (a prop_dynamic) standing at it; the script keeps the
// arm on its base, plays its animations, rolls the base when it's bumped
// (world/catapult/roll.js), seats a melon that comes
// into the bucket and — on its jump — carries it along the arm's swing and
// throws it (HoldInCatapult, from UpdateKart).
import { Instance, Console, CSInputs } from "cs_script/point_script";
import {
    CATAPULT_BASE_CLASSES,
    CATAPULT_ARM_CLASS,
    CATAPULT_PAIR_DISTANCE,
    CATAPULT_SCAN_SECONDS,
    CATAPULT_SEAT_SETTLE_SECONDS,
} from "../../constants/index.js";
import { karts } from "../../core/kart-registry.js";
import { Debug } from "../../core/debug.js";
import { KartMaxSpeed } from "../../movement/momentum/logic.js";
import { RollBase } from "./roll.js";
import {
    IsCatapultBaseModel,
    IsCatapultArmModel,
    CatapultLaunchFromName,
    ArmAngle,
    NextPhase,
    ArmInputs,
    RELEASE_SECONDS,
    SeatOffset,
    ToWorld,
    ToLocal,
    IsInBucket,
    LaunchVelocity,
    Distance,
} from "./logic.js";

/** @typedef {import("cs_script/point_script").Entity} Entity */
/** @typedef {import("../../core/kart-registry.js").Kart} Kart */
/**
 * @typedef {{
 *   arm?: Entity, // its throwing arm, once paired
 *   phase: import("./logic.js").CatapultPhase, phaseTime: number, // what it's doing, since when
 *   rider?: Kart, // the melon in its bucket (loaded, firing)
 *   lastRoll: import("./roll.js").RollTick | null, // the base's last tick of rolling (RollBase)
 * }} Catapult
 */

/** Every catapult base found. @type {Map<Entity, Catapult>} */
export const catapults = new Map();
let nextScanTime = -Infinity;

/** Forgets every catapult, to be found again on the next tick. */
export function ResetCatapults() {
    catapults.clear();
    nextScanTime = -Infinity;
}

/** Sends an arm the inputs for a phase change. @param {Catapult} catapult @param {import("./logic.js").CatapultPhase | undefined} previous */
function Animate(catapult, previous) {
    if (!catapult.arm?.IsValid()) return;
    for (const [input, value] of ArmInputs(previous, catapult.phase)) {
        Instance.EntFireAtTarget({ target: catapult.arm, input, value });
    }
}

/** Adds the bases not known yet and pairs every arm without a base with the nearest one. */
function ScanCatapults() {
    let found = 0;
    for (const className of CATAPULT_BASE_CLASSES) {
        for (const entity of Instance.FindEntitiesByClass(className)) {
            if (!catapults.has(entity) && IsCatapultBaseModel(/** @type {any} */ (entity).GetModelName?.() ?? "")) {
                catapults.set(entity, { phase: "ready", phaseTime: 0, lastRoll: null });
                found++;
            }
        }
    }
    const paired = new Set([...catapults.values()].map(c => c.arm).filter(Boolean));
    for (const arm of Instance.FindEntitiesByClass(CATAPULT_ARM_CLASS)) {
        if (paired.has(arm) || !IsCatapultArmModel(/** @type {any} */ (arm).GetModelName?.() ?? "")) continue;
        const at = arm.GetAbsOrigin();
        let best, bestDistance = CATAPULT_PAIR_DISTANCE;
        for (const [base, catapult] of catapults) {
            const d = Distance(base.GetAbsOrigin(), at);
            if (!catapult.arm?.IsValid() && d <= bestDistance) {
                best = catapult;
                bestDistance = d;
            }
        }
        if (best) {
            best.arm = arm;
            Animate(best, undefined);
        } else {
            Console.Log(`[melon_drive] catapults: an arm at ${at.x.toFixed(0)} ${at.y.toFixed(0)} ${at.z.toFixed(0)} has no catapult base within ${CATAPULT_PAIR_DISTANCE}\n`);
        }
    }
    if (found) {
        const armless = [...catapults.values()].filter(c => !c.arm).length;
        Console.Log(`[melon_drive] catapults: ${found} new, ${catapults.size} in all${armless ? `, ${armless} without an arm` : ""}\n`);
    }
}

/** Whether a kart can get into a catapult now. @param {Kart} kart */
function CanSit(kart) {
    return !kart.catapult && !kart.locked && !kart.breaking && !kart.freeLook && !kart.watching && !kart.podium
        && kart.padFlight === undefined && kart.melon.IsValid();
}

/** Every tick: new catapults, arms on their bases, rolling, the clock of each throw, melons getting in. @param {number} now @param {number} dt */
export function UpdateCatapults(now, dt) {
    if (now >= nextScanTime) {
        nextScanTime = now + CATAPULT_SCAN_SECONDS;
        ScanCatapults();
    }
    for (const [base, catapult] of catapults) {
        if (!base.IsValid()) {
            if (catapult.rider?.catapult?.base === base) catapult.rider.catapult = undefined;
            catapults.delete(base);
            continue;
        }
        // Rolling and upright.
        catapult.lastRoll = RollBase(base, catapult.lastRoll, dt);
        const origin = base.GetAbsOrigin(), angles = base.GetAbsAngles();
        if (catapult.arm?.IsValid()) {
            catapult.arm.Move({ position: origin, angles });
        }
        // Its rider got out another way (respawn, hub, a break): the bucket's free.
        if (catapult.rider && catapult.rider.catapult?.base !== base) {
            catapult.rider = undefined;
            if (catapult.phase === "loaded") catapult.phase = "ready";
        }
        const previous = catapult.phase;
        const next = NextPhase(catapult.phase, now - catapult.phaseTime);
        if (next.phase !== catapult.phase) {
            catapult.phase = next.phase;
            catapult.phaseTime = now - next.t;
            Animate(catapult, previous);
        }
        // Getting in: a melon inside the bucket of a ready catapult.
        if (catapult.phase === "ready") {
            for (const [slot, kart] of karts) {
                if (CanSit(kart) && IsInBucket(ToLocal(origin, angles, kart.melon.GetAbsOrigin()))) {
                    kart.catapult = { base, seatedTime: now };
                    catapult.rider = kart;
                    catapult.phase = "loaded";
                    catapult.phaseTime = now;
                    Debug(`catapult: slot ${slot} got in`);
                    break;
                }
            }
        }
    }
}

/**
 * From UpdateKart, while the melon sits in a catapult: holds it in the
 * bucket (carried along the arm's swing while it throws), fires on a jump
 * press, and throws it when the arm passes the release angle — the throw
 * protected from damage like a jump pad launch (kart.padFlight).
 * @param {number} slot @param {Kart} kart @param {number} now
 * @returns {boolean} whether this tick is taken care of — held, or just thrown
 * (the throw's velocity mustn't get the driving's friction on top)
 */
export function HoldInCatapult(slot, kart, now) {
    const base = kart.catapult?.base;
    const catapult = base && catapults.get(base);
    if (!catapult || !base.IsValid() || catapult.rider !== kart) {
        kart.catapult = undefined;
        return false;
    }
    if (catapult.phase === "loaded" && now - kart.catapult.seatedTime >= CATAPULT_SEAT_SETTLE_SECONDS
        && kart.pawn.WasInputJustPressed(CSInputs.JUMP)) {
        catapult.phase = "firing";
        catapult.phaseTime = now;
        Animate(catapult, "loaded");
        Debug(`catapult: slot ${slot} fired`);
    }
    const origin = base.GetAbsOrigin(), angles = base.GetAbsAngles(), baseVelocity = base.GetAbsVelocity();
    const t = now - catapult.phaseTime;
    if (catapult.phase === "firing" && t >= RELEASE_SECONDS) {
        const velocity = LaunchVelocity(angles, CatapultLaunchFromName(base.GetEntityName()), baseVelocity);
        kart.melon.Move({ position: ToWorld(origin, angles, SeatOffset(ArmAngle("firing", RELEASE_SECONDS))), velocity });
        kart.catapult = undefined;
        catapult.rider = undefined;
        kart.padFlight = { launchTime: now }; // no damage until shortly after landing, like a jump pad launch
        kart.lastJumpTime = now; // a jump: the next ground jump needs a landing first
        kart.lastVelocity = undefined; // our own throw, not an impact
        kart.settled = false;
        kart.speedCap = Math.max(kart.speedCap ?? KartMaxSpeed(kart), Math.hypot(velocity.x, velocity.y));
        Debug(`catapult: slot ${slot} thrown (${Math.hypot(velocity.x, velocity.y).toFixed(0)} u/s forward, ${velocity.z.toFixed(0)} up)`);
        return true;
    }
    // In the bucket: there, moving with the catapult, no driving.
    kart.melon.Move({
        position: ToWorld(origin, angles, SeatOffset(ArmAngle(catapult.phase, t))),
        velocity: baseVelocity,
        angularVelocity: { x: 0, y: 0, z: 0 },
    });
    kart.lastVelocity = undefined;
    kart.settled = false;
    kart.attackBoosting = false;
    kart.momentum = undefined;
    return true;
}
