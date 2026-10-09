// The user menu's physics tuning: the values themselves — server-wide, the
// same for every melon — and the rules applying them. No cs_script import,
// so the driving rules (movement/) can read the factors and Node can test
// them (test/dev/physics-tuning.test.mjs). physics-tuning.js next to it
// drives the page; the scale itself is tuning-scale-logic.js. The values are
// module state: they survive a tools-mode script reload, not a map restart.

/** @typedef {"maxSpeed" | "accel" | "jump" | "boost" | "gravity"} PhysicsTuningKey */
/** The page's rows, top to bottom. @type {PhysicsTuningKey[]} */
export const PHYSICS_TUNING_KEYS = ["maxSpeed", "accel", "jump", "boost", "gravity"];

/** Each value in percent of its default; a missing one is 100. @type {Partial<Record<PhysicsTuningKey, number>>} */
let tuning = {};

/** One value in percent of its default (100 = unchanged). @param {PhysicsTuningKey} key */
export function PhysicsPercent(key) {
    return tuning[key] ?? 100;
}

/** Sets one value, for every melon. @param {PhysicsTuningKey} key @param {number} percent */
export function SetPhysicsPercent(key, percent) {
    tuning = { ...tuning, [key]: percent };
}

/** Every value back to 100 %. */
export function ResetPhysicsTuning() {
    tuning = {};
}

/** The factor a value scales its default with: its percent / 100. @param {PhysicsTuningKey} key */
export function PhysicsFactor(key) {
    return PhysicsPercent(key) / 100;
}

/**
 * The extra vertical velocity change this tick for a gravity factor: the
 * engine pulls with `gravity` anyway, the script adds the rest (factor 2:
 * as much again downwards; 0: cancels it — the melon floats).
 * @param {number} factor @param {number} gravity the engine's pull (GRAVITY) @param {number} dt
 */
export function ExtraGravityDelta(factor, gravity, dt) {
    return -(factor - 1) * gravity * dt;
}

/**
 * The attack boost's speed cap for a kart's factors: the top speed plus the
 * boost's headroom above it (ATTACK_BOOST_MAX_SPEED − MAX_SPEED), both
 * scaled — so a faster melon still boosts above its own top speed.
 * @param {number} topSpeed the kart's top speed (scaled) @param {number} headroom @param {number} boostFactor
 */
export function BoostMaxSpeed(topSpeed, headroom, boostFactor) {
    return topSpeed + headroom * boostFactor;
}
