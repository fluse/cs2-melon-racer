import { Instance } from "cs_script/point_script";

// Free-for-all race mode: no team select, no combat, no round interruptions.
// Everyone should be able to connect and start running immediately.

const RACE_TEAM = 3; // CT — arbitrary, where players without a team are put.

// T or CT both work for racing — only unassigned/spectators get moved.
// Forcing everyone onto RACE_TEAM switched a player who had just picked T
// straight over to CT, killing and respawning the pawn they'd just been
// given its melon on.
/** @param {number} team */
function IsPlayingTeam(team) {
    return team === 2 || team === 3;
}

// Warmup never ends, so there's never a "round start" that freezes/resets
// racers mid-run. mp_warmup_pausetimer keeps the warmup clock from ever
// ticking down to a real match.
Instance.ServerCommand("sv_cheats 1");
// Instance.ServerCommand("mp_warmup_enabled 1");
// mp_warmup_enabled alone isn't reliable on a local/offline listen server
// (the usual way this map gets tested) — mp_warmup_offline_enabled is the
// cvar CS2 actually checks there. Setting both covers dedicated servers too.
// Instance.ServerCommand("mp_warmup_offline_enabled 1");
// Instance.ServerCommand("mp_warmup_pausetimer 1");
Instance.ServerCommand("mp_warmup_end");
Instance.ServerCommand("mp_roundtime 60");
Instance.ServerCommand("mp_autoteambalance 0");
Instance.ServerCommand("mp_roundtime_defuse 60");
Instance.ServerCommand("mp_roundtime_hostage 60");
Instance.ServerCommand("mp_limitteams 0");
Instance.ServerCommand("mp_friendlyfire 0");
Instance.ServerCommand("mp_solid_teammates 0"); // don't block each other on the track
Instance.ServerCommand("mp_ignore_round_win_conditions 1");

function PutPlayerInRaceMode(pawn) {
    if (!IsPlayingTeam(pawn.GetTeamNumber())) {
        pawn.GetPlayerController()?.JoinTeam(RACE_TEAM);
    }
    pawn.DestroyWeapons();
}

// Default CS HUD (ammo, health, money, radar, buy prompt, round timer) has
// nothing to show in a race — only our own speedometer (custom_hud_layout,
// see melon_drive.js) should be on screen. cl_drawhud is a leftover from the
// old vgui HUD and no longer affects CS2's Panorama HUD; cl_draw_only_deathnotices
// is the one broadcast/demo tools actually use to strip the Panorama HUD down
// to (basically) nothing, so use that instead.
/** @param {number} playerSlot */
function HideDefaultHud(playerSlot) {
    Instance.ClientCommand(playerSlot, "cl_draw_only_deathnotices 1");
}

Instance.OnPlayerActivate(({ player }) => {
    HideDefaultHud(player.GetPlayerSlot());
    if (player.GetPlayerPawn()) {
        PutPlayerInRaceMode(player.GetPlayerPawn());
    } else if (!IsPlayingTeam(player.GetTeamNumber())) {
        player.JoinTeam(RACE_TEAM);
    }
});

// Covers respawns and round restarts too, not just the initial join.
Instance.OnPlayerReset(({ player }) => {
    PutPlayerInRaceMode(player);
    const slot = player.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        HideDefaultHud(slot);
    }
});

// Pure racing: no weapon/fall/any damage at all.
Instance.OnModifyPlayerDamage(() => {
    return { abort: true };
});
