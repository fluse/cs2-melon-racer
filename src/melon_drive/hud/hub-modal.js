import { IsModerator } from "../core/kart-registry.js";
import { GetSpeedHud, SyncInputCapture } from "./layout.js";
import { RacePhase } from "../constants/index.js";

// Kept in sync every tick (see Think in core/think.js) as well as on hub_enter,
// since a standing-in-hub player's WaitingForOthers/IsModerator state can
// change underneath them — a heat starting/ending elsewhere, or the
// moderator disconnecting and reassigning to whoever's currently in the hub.
// `currentPhase` is passed in rather than imported from race/heat/race-flow.js so
// this module has no dependency on it (race/heat/race-flow.js already depends on this
// one, for Show/HideHubModal — an import back the other way would make the
// two modules circular for the sake of a single enum comparison).
/** @param {number} slot @param {typeof RacePhase[keyof typeof RacePhase]} currentPhase */
export function ApplyHubModalState(slot, currentPhase) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "WaitingForOthers", currentPhase !== RacePhase.HUB);
    hud.SetHasClassForPlayer(slot, "hub_modal", "IsModerator", IsModerator(slot));
}

/** @param {number} slot @param {import("../core/kart-registry.js").Kart} kart @param {typeof RacePhase[keyof typeof RacePhase]} currentPhase */
export function ShowHubModal(slot, kart, currentPhase) {
    kart.hubModalOpen = true;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", false);
    ApplyHubModalState(slot, currentPhase);
    SyncInputCapture(hud, slot, kart);
}

/** @param {number} slot @param {import("../core/kart-registry.js").Kart} kart */
export function HideHubModal(slot, kart) {
    kart.hubModalOpen = false;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", true);
    SyncInputCapture(hud, slot, kart);
}
