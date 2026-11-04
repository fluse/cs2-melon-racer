import { Instance } from "cs_script/point_script";
import { GetSpeedHud } from "../layout.js";
import { BoardPlayers } from "../scoreboard/scoreboard.js";
import { ROUTE_NAMES } from "../hub-modal/routes.js";
import { GetTrackOrder } from "../../race/track-config.js";
import { GetTrackBestTimes } from "../../race/time-trial/time-trial.js";
import { GetStatTotals } from "../../race/stats/stats.js";
import { BuildLeaderboard, LeaderboardTab, LeaderboardTabs, LeaderboardTrack, StepLeaderboardTrack } from "./logic.js";
import { LEADERBOARD_ROWS, LEADERBOARD_TIMES_TAB, LEADERBOARD_UPDATE_SECONDS, HUD_RESEND_SECONDS } from "../../constants/index.js";

const PAGE = "usermenu_leaderboards_page";

/**
 * The user menu's leaderboards page (usermenu_leaderboards_page in
 * melon_racer.xml, opened from ACTIONS): one leaderboard at a time, picked
 * by its button ("lb_tab_<tab>", the current one Selected) — the best times on
 * one track (◀ ▶ page through the tracks, shown with Paging) or a player
 * stat. Up to LEADERBOARD_ROWS players ("lb_row_<i>", one column), the
 * viewer's own row marked Self (it takes the last row if they're further
 * down). Title, subtitle and value column header are dialog variables on
 * the page. Rebuilt every LEADERBOARD_UPDATE_SECONDS while the page is open
 * (UpdateUserMenu), each value sent only when it changes, plus everything
 * again every HUD_RESEND_SECONDS. Rules: hud/leaderboards/logic.js.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart
 */
export function UpdateLeaderboardsHud(slot, kart) {
    const now = Instance.GetGameTime();
    if (kart.leaderboardNextUpdate !== undefined && now < kart.leaderboardNextUpdate) {
        return;
    }
    kart.leaderboardNextUpdate = now + LEADERBOARD_UPDATE_SECONDS;
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    if (kart.leaderboardResendAt === undefined || now >= kart.leaderboardResendAt) {
        kart.leaderboardResendAt = now + HUD_RESEND_SECONDS;
        kart.leaderboardShown = {};
    }
    const shown = (kart.leaderboardShown ??= {});
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

    const tab = LeaderboardTab(kart.leaderboardTab);
    const trackOrder = GetTrackOrder();
    const trackId = LeaderboardTrack(trackOrder, kart.leaderboardTrack, kart.trackId);
    const timesTab = tab === LEADERBOARD_TIMES_TAB;
    const { players, self } = BoardPlayers(kart);
    const board = BuildLeaderboard({
        tab,
        trackOrder,
        trackId,
        bestTimes: timesTab && trackId !== undefined ? GetTrackBestTimes(trackId) : {},
        statTotals: timesTab ? {} : GetStatTotals(tab),
        players,
        self,
        maxRows: LEADERBOARD_ROWS,
        routeNames: ROUTE_NAMES,
    });
    for (const other of LeaderboardTabs()) {
        SetClass(`lb_tab_${other}`, "Selected", other === tab);
    }
    SetClass(PAGE, "Paging", timesTab && trackOrder.length > 1);
    SetText(PAGE, "lb_title", board.title);
    SetText(PAGE, "lb_subtitle", board.subtitle);
    SetText(PAGE, "lb_column", board.column);
    for (let i = 0; i < LEADERBOARD_ROWS; i++) {
        const row = board.rows[i];
        const id = `lb_row_${i}`;
        SetClass(id, "Unused", !row);
        SetClass(id, "Self", Boolean(row?.self));
        if (row) {
            SetText(id, "rank", row.rank);
            SetText(id, "name", row.name);
            SetText(id, "value", row.value);
        }
    }
}

/**
 * Fills the page in right away, everything sent again — on opening it
 * (USER_MENU_PAGES in hud/user-menu.js), on a tab click and after paging.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart
 */
export function RefreshLeaderboardsHud(slot, kart) {
    kart.leaderboardNextUpdate = undefined;
    kart.leaderboardResendAt = undefined;
    UpdateLeaderboardsHud(slot, kart);
}

/**
 * A tab button ("lb_tab_<tab>"): shows that leaderboard. Kept while the
 * player is connected, so the page reopens on it.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {string} tab
 * @returns {boolean} whether it's a tab
 */
export function SelectLeaderboardTab(slot, kart, tab) {
    if (!LeaderboardTabs().includes(tab)) {
        return false;
    }
    kart.leaderboardTab = tab;
    RefreshLeaderboardsHud(slot, kart);
    return true;
}

/**
 * The best times' ◀ / ▶ (direction -1 / +1): the previous/next track,
 * wrapping around. Kept while the player is connected, like the tab.
 * @param {number} slot @param {import("../../core/kart-registry.js").Kart} kart @param {number} direction
 */
export function StepLeaderboardsTrack(slot, kart, direction) {
    const trackOrder = GetTrackOrder();
    kart.leaderboardTrack = StepLeaderboardTrack(trackOrder, LeaderboardTrack(trackOrder, kart.leaderboardTrack, kart.trackId), direction);
    RefreshLeaderboardsHud(slot, kart);
}
