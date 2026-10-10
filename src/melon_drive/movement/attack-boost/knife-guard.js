// Knife swings near other melons. The engine keeps handing pawns a knife
// back (see HoldPawn), and a swing shoves whatever melon it reaches — not
// just the swinger's own (that one is covered by the attack guard in
// UpdateKart). A free-looking pawn (dev/free-look.js) can fly right up to
// someone else's melon and knife it: the shove read as an impact and broke
// it. So after any knife attack anywhere, every melon gets the same guard
// for ATTACK_PUSH_GUARD_SECONDS: no speed from engine pushes, no impact
// from them. The swinger loses their weapons at once, too.
import { Instance } from "cs_script/point_script";
import { ATTACK_PUSH_GUARD_SECONDS } from "../../constants/index.js";
import { Debug } from "../../core/debug.js";

let lastKnifeAttackTime = -Infinity;

/** Whether a knife attack happened within ATTACK_PUSH_GUARD_SECONDS. @param {number} now */
export function KnifeGuardActive(now) {
    return now - lastKnifeAttackTime <= ATTACK_PUSH_GUARD_SECONDS;
}

/**
 * OnKnifeAttack: starts the guard and takes the swinger's weapons away.
 * @param {{ weapon: any, attackType: number }} event
 */
export function OnKnifeAttack({ weapon, attackType }) {
    lastKnifeAttackTime = Instance.GetGameTime();
    const owner = weapon?.GetOwner();
    Debug(`[attack debug] knife attack: ${weapon?.GetClassName?.() ?? "?"} (type ${attackType}), every melon guarded`);
    if (owner?.IsValid()) {
        owner.DestroyWeapons();
    }
}
