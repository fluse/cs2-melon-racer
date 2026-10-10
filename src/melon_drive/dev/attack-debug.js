// Diagnostics for the attack button (DEBUG only, console). Found with it: the
// engine gave the pawn a knife back after spawn, and each knife swing shoved
// the melon ~140 u/s even with the attack boost off — HoldPawn now takes
// weapons away every tick. Kept in case anything else reacts to attack. These logs show
// what's going on: per kart while attack is held, how much speed physics
// added on top of what the script commanded last tick, and which weapon the
// pawn holds; plus every gun shot and bullet impact (knife attacks are
// logged by movement/attack-boost/knife-guard.js, which owns OnKnifeAttack).
import { Instance } from "cs_script/point_script";
import { DEBUG, Debug } from "../core/debug.js";
import { FindKartByMelon } from "../core/kart-registry.js";

const ATTACK_DEBUG_INTERVAL = 0.25; // seconds between two per-kart lines while attack is held

/** @param {any} entity */
function Describe(entity) {
    if (!entity?.IsValid?.()) {
        return "none";
    }
    const name = entity.GetEntityName?.();
    return `${entity.GetClassName()}${name ? ` "${name}"` : ""}`;
}

/**
 * Called by UpdateKart every tick attack is held.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart
 * @param {{ x: number, y: number, z: number }} currentVelocity @param {boolean} boosting
 */
export function LogAttackHeld(slot, kart, currentVelocity, boosting) {
    const now = Instance.GetGameTime();
    if (!DEBUG || now < (kart.nextAttackDebugTime ?? 0)) {
        return;
    }
    kart.nextAttackDebugTime = now + ATTACK_DEBUG_INTERVAL;
    const actual = Math.hypot(currentVelocity.x, currentVelocity.y);
    const commanded = kart.lastVelocity ? Math.hypot(kart.lastVelocity.x, kart.lastVelocity.y) : undefined;
    const added = commanded === undefined ? "?" : (actual - commanded).toFixed(1);
    Debug(
        `[attack debug] slot ${slot}: health ${kart.health.toFixed(1)}, boost ${boosting ? "ON" : "off"}, ` +
        `speed commanded ${commanded?.toFixed(0) ?? "?"} -> now ${actual.toFixed(0)} (physics added ${added} u/s this tick), ` +
        `weapon ${Describe(kart.pawn.GetActiveWeapon?.())}`
    );
}

/** Registers the engine-event logs. Called once from index.js. */
export function RegisterAttackDebug() {
    if (!DEBUG) {
        return;
    }
    Instance.OnGunFire(({ weapon }) => {
        Debug(`[attack debug] gun fired: ${Describe(weapon)}`);
    });
    Instance.OnBulletImpact(({ weapon, position, hitEntity }) => {
        const melonKart = hitEntity ? FindKartByMelon(hitEntity) : undefined;
        Debug(
            `[attack debug] bullet from ${Describe(weapon)} hit ${Describe(hitEntity)}` +
            `${melonKart ? " — A MELON" : ""} at (${position.x.toFixed(0)}, ${position.y.toFixed(0)}, ${position.z.toFixed(0)})`
        );
    });
}
