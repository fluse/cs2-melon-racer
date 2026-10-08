import { Instance } from "cs_script/point_script";
import { IsModerator, karts } from "../../core/kart-registry.js";
import { GetSpeedHud, SyncInputCapture } from "../layout.js";
import { RacePhase, HUB_RACER_ROWS, HUD_RESEND_SECONDS, MAX_TRACKS } from "../../constants/index.js";
import { GetTrackConfig, GetTrackOrder } from "../../race/track-config.js";
import { BuildHubRacerList, BuildHeatCards, HeatsTitle } from "./logic.js";
import { ROUTE_NAMES } from "./routes.js";

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
    UpdateHubLists(hud, slot);
}

/**
 * What the window lists (rules in ./logic.js): the heats the Grand Prix
 * runs, a card per track ("hub_heat_<trackId>": heat number, route name,
 * laps and checkpoints, its route icon), and everyone in the start
 * area right now — the same karts TryStartRace takes along —
 * "hub_racer_<i>" with the viewer's own marked Self. Each value is sent
 * only when it changes, plus everything again every HUD_RESEND_SECONDS (a
 * value sent before the player's HUD had loaded is lost).
 * @param {any} hud @param {number} slot
 */
function UpdateHubLists(hud, slot) {
    const kart = karts.get(slot);
    if (!kart) {
        return;
    }
    const now = Instance.GetGameTime();
    if (kart.hubRacersResendAt === undefined || now >= kart.hubRacersResendAt) {
        kart.hubRacersResendAt = now + HUD_RESEND_SECONDS;
        kart.hubRacersShown = {};
    }
    const shown = (kart.hubRacersShown ??= {});
    /** @param {string} panel @param {string} name @param {string} value */
    const SetText = (panel, name, value) => {
        const key = `${panel}/${name}`;
        if (shown[key] !== value) {
            shown[key] = value;
            hud.SetDialogVariableStringForPlayer(slot, panel, name, value);
        }
    };
    /** @param {string} panel @param {string} cls @param {boolean} on */
    const SetClass = (panel, cls, on) => {
        const key = `${panel}.${cls}`;
        const value = on ? "1" : "";
        if (shown[key] !== value) {
            shown[key] = value;
            hud.SetHasClassForPlayer(slot, panel, cls, on);
        }
    };

    const order = GetTrackOrder();
    const cards = new Map(BuildHeatCards(order, GetTrackConfig(), ROUTE_NAMES).map((card) => [card.trackId, card]));
    SetText("hub_heats", "title", HeatsTitle(order.length));
    for (let trackId = 1; trackId <= MAX_TRACKS; trackId++) {
        const card = cards.get(trackId);
        const id = `hub_heat_${trackId}`;
        SetClass(id, "Unused", !card);
        if (card) {
            SetText(id, "heat", card.heat);
            SetText(id, "name", card.name);
            SetText(id, "info", card.info);
        }
    }

    const inHub = [...karts.entries()]
        .filter(([, other]) => other.inHub && other.melon.IsValid())
        .map(([otherSlot, other]) => ({ key: String(otherSlot), name: other.pawn.GetPlayerController()?.GetPlayerName() ?? "" }));
    const list = BuildHubRacerList(inHub, String(slot), HUB_RACER_ROWS);
    SetText("hub_racers", "title", list.title);
    SetText("hub_racers_more", "more", list.more);
    SetClass("hub_racers_more", "Unused", list.more === "");
    for (let i = 0; i < HUB_RACER_ROWS; i++) {
        const row = list.rows[i];
        const id = `hub_racer_${i}`;
        SetClass(id, "Unused", !row);
        SetClass(id, "Self", Boolean(row?.self));
        if (row) {
            SetText(id, "name", row.name);
        }
    }
}

/** @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {typeof RacePhase[keyof typeof RacePhase]} currentPhase */
export function ShowHubModal(slot, kart, currentPhase) {
    kart.hubModalOpen = true;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", false);
    kart.hubRacersResendAt = undefined; // the whole lists again, now that they're visible
    ApplyHubModalState(slot, currentPhase);
    SyncInputCapture(hud, slot, kart);
}

/** @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart */
export function HideHubModal(slot, kart) {
    kart.hubModalOpen = false;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", true);
    SyncInputCapture(hud, slot, kart);
}
