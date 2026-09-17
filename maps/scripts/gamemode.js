import { Instance } from "cs_script/point_script";

// Free-for-all race mode: no team select, no combat, no round interruptions.
// Everyone should be able to connect and start running immediately.

const RACE_TEAM = 3; // CT — arbitrary, just the one team everyone shares.

// Warmup never ends, so there's never a "round start" that freezes/resets
// racers mid-run. mp_warmup_pausetimer keeps the warmup clock from ever
// ticking down to a real match.
Instance.ServerCommand("sv_cheats 1");
Instance.ServerCommand("mp_warmup_enabled 1");
Instance.ServerCommand("mp_warmup_pausetimer 1");
Instance.ServerCommand("mp_autoteambalance 0");
Instance.ServerCommand("mp_limitteams 0");
Instance.ServerCommand("mp_friendlyfire 0");
Instance.ServerCommand("mp_solid_teammates 0"); // don't block each other on the track

function PutPlayerInRaceMode(pawn) {
    if (pawn.GetTeamNumber() !== RACE_TEAM) {
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
    } else if (player.GetTeamNumber() !== RACE_TEAM) {
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
