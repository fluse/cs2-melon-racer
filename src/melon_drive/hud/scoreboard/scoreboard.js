import { Instance, CSInputs } from "cs_script/point_script";
import { karts } from "../../core/kart-registry.js";
import { GetSpeedHud } from "../layout.js";
import { ScoreboardView, BuildScoreboard, StepTrack } from "./logic.js";
import { ROUTE_NAMES } from "../hub-modal/routes.js";
import { grandPrix, PlayerKey } from "../../race/grand-prix/grand-prix.js";
import { activeTrackId } from "../../race/heat/race-flow.js";
import { GetTrackOrder } from "../../race/track-config.js";
import { GetTrackBestTimes } from "../../race/time-trial/time-trial.js";
import { SCOREBOARD_ROWS, SCOREBOARD_UPDATE_SECONDS, HUD_RESEND_SECONDS } from "../../constants/index.js";

/**
 * The scoreboard (#scoreboard in speedometer.xml), in place of CS2's own:
 * the CSS shows it while the engine's HUD_SCOREBOARD_VISIBLE class is set
 * (Tab held), covering the default one. This only fills it in — the Grand
 * Prix standings or a track's best times (hud/scoreboard/logic.js), a row
 * per player ("score_row_<i>", SCOREBOARD_ROWS of them), the viewer's own
 * row marked Self. Rebuilt every SCOREBOARD_UPDATE_SECONDS whether it's
 * open or not (script can't tell), each value sent only when it changes,
 * plus everything again every HUD_RESEND_SECONDS (a value sent before the
 * player's HUD had loaded is lost).
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart
 */
export function UpdateScoreboardHud(slot, kart) {
    const now = Instance.GetGameTime();
    if (kart.scoreboardNextUpdate !== undefined && now < kart.scoreboardNextUpdate) {
        return;
    }
    kart.scoreboardNextUpdate = now + SCOREBOARD_UPDATE_SECONDS;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    if (kart.scoreboardResendAt === undefined || now >= kart.scoreboardResendAt) {
        kart.scoreboardResendAt = now + HUD_RESEND_SECONDS;
        kart.scoreboardShown = {};
    }
    const shown = (kart.scoreboardShown ??= {});
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

    const trackOrder = GetTrackOrder();
    const { grandPrixMode, boardTrackId } = ScoreboardView({ grandPrix, activeTrackId, kartTrackId: kart.trackId, trackOrder, pickedTrackId: kart.scoreboardPick });
    const players = [...karts.values()].map((other) => ({ key: PlayerKey(other), name: other.pawn.GetPlayerController()?.GetPlayerName() ?? "" }));
    const board = BuildScoreboard({
        grandPrix,
        grandPrixMode,
        boardTrackId,
        players,
        self: { key: PlayerKey(kart), name: kart.pawn.GetPlayerController()?.GetPlayerName() ?? "" },
        bestTimes: boardTrackId !== undefined ? GetTrackBestTimes(boardTrackId) : {},
        maxRows: SCOREBOARD_ROWS,
        trackOrder,
        routeNames: ROUTE_NAMES,
    });

    SetClass("scoreboard", "TimeTrial", !board.grandPrixMode);
    SetText("scoreboard", "title", board.title);
    SetText("scoreboard", "subtitle", board.subtitle);
    SetText("scoreboard", "best_header", board.bestHeader);
    SetText("score_switch", "switcher", board.switcher);
    SetClass("score_switch", "Unused", board.switcher === "");
    for (let i = 0; i < SCOREBOARD_ROWS; i++) {
        const row = board.rows[i];
        const id = `score_row_${i}`;
        SetClass(id, "Unused", !row);
        SetClass(id, "Self", Boolean(row?.self));
        if (row) {
            SetText(id, "rank", row.rank);
            SetText(id, "name", row.name);
            SetText(id, "points", row.points);
            SetText(id, "heat", row.heat);
            SetText(id, "best", row.best);
        }
    }
}

/**
 * Paging the time trial board through the tracks: while the scoreboard is
 * open (Tab held, SHOW_SCORES), A shows the previous track's best times and
 * D the next one's, wrapping around. Every opening starts on the viewer's
 * own track again (the pick is dropped when Tab is let go). Per tick, from
 * core/think.js — a tap is only seen on the tick it happens.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function UpdateScoreboardInput(kart) {
    const pawn = kart.pawn;
    if (!pawn.IsInputPressed(CSInputs.SHOW_SCORES)) {
        kart.scoreboardPick = undefined;
        return;
    }
    const direction = (pawn.WasInputJustPressed(CSInputs.RIGHT) ? 1 : 0) - (pawn.WasInputJustPressed(CSInputs.LEFT) ? 1 : 0);
    if (direction === 0) {
        return;
    }
    const trackOrder = GetTrackOrder();
    const { grandPrixMode, boardTrackId } = ScoreboardView({ grandPrix, activeTrackId, kartTrackId: kart.trackId, trackOrder, pickedTrackId: kart.scoreboardPick });
    if (grandPrixMode) {
        return;
    }
    kart.scoreboardPick = StepTrack(trackOrder, boardTrackId, direction);
    kart.scoreboardNextUpdate = undefined; // show it now, not on the next rebuild
}
