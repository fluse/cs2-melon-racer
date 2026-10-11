import { Instance, CSInputs } from "cs_script/point_script";
import { karts } from "../../core/kart-registry.js";
import { GetSpeedHud } from "../layout.js";
import { ScoreboardView, BuildScoreboard, BuildStatBoard, ScoreboardPages, CurrentPage, StatSlideOf, StepPage, PageSwitcher } from "./logic.js";
import { ROUTE_NAMES } from "../hub-modal/routes.js";
import { grandPrix, PlayerKey } from "../../race/grand-prix/grand-prix.js";
import { activeTrackId } from "../../race/heat/race-flow.js";
import { GetTrackOrder } from "../../race/track-config.js";
import { GetTrackBestTimes } from "../../race/time-trial/time-trial.js";
import { GetStatTotals } from "../../race/stats/stats.js";
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

    const { pages, page, grandPrixMode, boardTrackId } = ScoreboardPage(kart);
    const { players, self } = BoardPlayers(kart);
    const slide = StatSlideOf(page);
    const board = slide
        ? BuildStatBoard({ slide, totals: GetStatTotals(slide.key), players, self, maxRows: SCOREBOARD_ROWS })
        : BuildScoreboard({
            grandPrix,
            grandPrixMode,
            boardTrackId,
            players,
            self,
            bestTimes: boardTrackId !== undefined ? GetTrackBestTimes(boardTrackId) : {},
            maxRows: SCOREBOARD_ROWS,
            routeNames: ROUTE_NAMES,
        });
    const switcher = PageSwitcher(pages, page);

    SetClass("scoreboard", "TimeTrial", !board.grandPrixMode);
    SetText("scoreboard", "title", board.title);
    SetText("scoreboard", "subtitle", board.subtitle);
    SetText("scoreboard", "best_header", board.bestHeader);
    SetText("score_switch", "switcher", switcher);
    SetClass("score_switch", "Unused", switcher === "");
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
 * Everyone on the map and the viewer, as the boards' rules want them (also
 * the user menu's leaderboards page, hud/leaderboards/).
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function BoardPlayers(kart) {
    /** @param {import("../../core/kart-registry.js").Kart} k */
    const Player = (k) => ({ key: PlayerKey(k), name: k.pawn.GetPlayerController()?.GetPlayerName() ?? "" });
    return { players: [...karts.values()].map(Player), self: Player(kart) };
}

/**
 * Which page the viewer's scoreboard is on (hud/scoreboard/logic.js), and
 * every page there is.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
function ScoreboardPage(kart) {
    const trackOrder = GetTrackOrder();
    const { grandPrixMode, boardTrackId } = ScoreboardView({ grandPrix, activeTrackId, kartTrackId: kart.trackId, trackOrder, pickedTrackId: kart.scoreboardPick });
    return {
        pages: ScoreboardPages(grandPrixMode, trackOrder),
        page: CurrentPage(grandPrixMode, boardTrackId, kart.scoreboardStat),
        grandPrixMode,
        boardTrackId,
    };
}

/**
 * Paging the scoreboard: while it's open (Tab held, SHOW_SCORES), A shows
 * the previous page and D the next one, wrapping around — the Grand Prix
 * standings or every track's best times, then the players' stats
 * (ScoreboardPages). Every opening starts on the viewer's own board again
 * (the pick is dropped when Tab is let go). Per tick, from core/think.js —
 * a tap is only seen on the tick it happens.
 * @param {import("../../core/kart-registry.js").Kart} kart
 */
export function UpdateScoreboardInput(kart) {
    const pawn = kart.pawn;
    if (!pawn.IsInputPressed(CSInputs.SHOW_SCORES)) {
        kart.scoreboardPick = undefined;
        kart.scoreboardStat = undefined;
        return;
    }
    const direction = (pawn.WasInputJustPressed(CSInputs.RIGHT) ? 1 : 0) - (pawn.WasInputJustPressed(CSInputs.LEFT) ? 1 : 0);
    if (direction === 0) {
        return;
    }
    const { pages, page } = ScoreboardPage(kart);
    const next = StepPage(pages, page, direction);
    const [kind, id] = next.split(":");
    kart.scoreboardStat = kind === "stat" ? id : undefined;
    if (kind === "track" && id !== "") {
        kart.scoreboardPick = Number(id);
    }
    kart.scoreboardNextUpdate = undefined; // show it now, not on the next rebuild
}
