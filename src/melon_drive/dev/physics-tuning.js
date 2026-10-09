// Physics tuning: the user menu's "Physics Settings" page (DEVELOPER column)
// scales the melon physics — top speed, acceleration, jump, attack boost,
// gravity — each in percent of its default, for every melon on the server
// (the values live in physics-tuning-logic.js, read through PhysicsFactor by
// movement/). Anyone can change them; everyone with the page open sees the
// change. To try out values in-game: not saved (gone on a map restart),
// every change logged to the console with who made it and the resulting
// value, ready to copy into the constants. The scale is the shared one
// (tuning-scale-logic.js); opening/closing the page is SetUserMenuPage in
// hud/user-menu.js.
import { Instance } from "cs_script/point_script";
import { karts } from "../core/kart-registry.js";
import { GetSpeedHud } from "../hud/layout.js";
import { PHYSICS_TUNING_KEYS, PhysicsFactor, PhysicsPercent, SetPhysicsPercent, ResetPhysicsTuning } from "./physics-tuning-logic.js";
import { PHYSICS_TUNING_SCALE, ParseTuningButton, TunedValue } from "./tuning-scale-logic.js";
import { UpdateTuningScaleHud } from "./tuning-scale.js";
import { MAX_SPEED, FORWARD_ACCEL, JUMP_SPEED, ATTACK_BOOST_ACCEL, GRAVITY } from "../constants/index.js";

/** @typedef {import("./physics-tuning-logic.js").PhysicsTuningKey} PhysicsTuningKey */

/**
 * Per row: its id part in speedometer.xml (phytune_<id>_…), and the
 * constant it scales with its default — shown next to the percent.
 * @type {Record<PhysicsTuningKey, { id: string, constant: string, base: number, unit: string }>}
 */
const ROWS = {
    maxSpeed: { id: "maxspeed", constant: "MAX_SPEED", base: MAX_SPEED, unit: "u/s" },
    accel: { id: "accel", constant: "FORWARD_ACCEL", base: FORWARD_ACCEL, unit: "u/s²" },
    jump: { id: "jump", constant: "JUMP_SPEED", base: JUMP_SPEED, unit: "u/s" },
    boost: { id: "boost", constant: "ATTACK_BOOST_ACCEL", base: ATTACK_BOOST_ACCEL, unit: "u/s²" },
    gravity: { id: "gravity", constant: "GRAVITY", base: GRAVITY, unit: "u/s²" },
};

/** Who changed it, for the log. @param {number} slot */
function PlayerName(slot) {
    return karts.get(slot)?.pawn.GetPlayerController()?.GetPlayerName() ?? `slot ${slot}`;
}

/** Everyone who has the physics page open sees the new values. */
function RefreshOpenPages() {
    for (const [slot, kart] of karts) {
        if (kart.userMenuOpen && kart.userMenuPage === "physics") {
            UpdatePhysicsTuningHud(slot);
        }
    }
}

/**
 * The physics page's numbers ("130 % · 845 u/s") and its scales, filled up
 * to the values, for the player in `slot`.
 * @param {number} slot
 */
export function UpdatePhysicsTuningHud(slot) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_physics_page", "phytune_step", `${PHYSICS_TUNING_SCALE.step}`);
    hud.SetDialogVariableStringForPlayer(slot, "usermenu_physics_page", "phytune_fine_step", `${PHYSICS_TUNING_SCALE.fineStep}`);
    for (const key of PHYSICS_TUNING_KEYS) {
        const row = ROWS[key];
        const percent = PhysicsPercent(key);
        const value = Math.round(row.base * PhysicsFactor(key));
        hud.SetDialogVariableStringForPlayer(slot, "usermenu_physics_page", `phytune_${row.id}`, `${percent} % · ${value} ${row.unit}`);
        hud.SetDialogVariableStringForPlayer(slot, "usermenu_physics_page", `phytune_${row.id}_default`, `${row.base} ${row.unit}`);
        UpdateTuningScaleHud(hud, slot, `phytune_${row.id}_`, PHYSICS_TUNING_SCALE, percent);
    }
}

/**
 * A click on the physics page's controls (button ids "phytune_…"): reset,
 * or − / + (big or fine step) or a segment on a row — for every melon.
 * @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {string} buttonId
 * @returns {boolean} whether it was one of them
 */
export function HandlePhysicsTuningClick(slot, kart, buttonId) {
    if (buttonId === "phytune_reset_button") {
        ResetPhysicsTuning();
        Instance.Msg(`[physics tuning] ${PlayerName(slot)}: everything back to 100 % (all melons)`);
        RefreshOpenPages();
        return true;
    }
    const button = ParseTuningButton("phytune_", buttonId);
    const key = PHYSICS_TUNING_KEYS.find((k) => ROWS[k].id === button?.row);
    if (!button || !key) {
        return false;
    }
    SetPhysicsPercent(key, TunedValue(PHYSICS_TUNING_SCALE, PhysicsPercent(key), button));
    const row = ROWS[key];
    Instance.Msg(`[physics tuning] ${PlayerName(slot)}: ${key} ${PhysicsPercent(key)} % = ${row.constant} ${Math.round(row.base * PhysicsFactor(key))} (all melons)`);
    RefreshOpenPages();
    return true;
}
