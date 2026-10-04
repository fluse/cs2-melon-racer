// Jump recharge zones: a trigger_multiple (filtered to prop_physics like the
// other triggers) with OnStartTouch -> RunScriptInput "jump_recharge_enter"
// and OnEndTouch -> "jump_recharge_leave". While the melon is inside, its
// wall-jump charges (WALL_JUMP_CHARGES) are full at once and kept full — the
// first wall jump after leaving starts from a full set. Pure rule, no
// cs_script import; applied by movement/driving/drive.js
// (test/zones/jump-recharge.test.mjs).
import { WALL_JUMP_CHARGES } from "../../constants/index.js";

/**
 * The wall-jump charge after this tick's refill (RechargeWallJump): full
 * inside a jump recharge zone, unchanged outside one.
 * @param {number} charge @param {boolean} inZone
 */
export function ChargeInRechargeZone(charge, inZone) {
    return inZone ? WALL_JUMP_CHARGES : charge;
}
