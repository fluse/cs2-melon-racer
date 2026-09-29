import { Instance, PointTemplate, CSMoveType, CustomCameraMode } from "cs_script/point_script";
import { Debug } from "./debug.js";
import { karts, moderatorSlot, SetModeratorSlot } from "./kart-registry.js";
import { ApplyCameraFollow } from "./camera/index.js";
import { FacePlayerView, GetIntroSpawnPoint } from "./spawn-points.js";
import { GetSpeedHud } from "./hud.js";
import { ShowMelonPaint } from "./melon-look.js";
import {
    MELON_TEMPLATE_NAME,
    PAWN_DRIFT_TOLERANCE,
    MELON_MAX_HEALTH,
    MELON_ENGINE_HEALTH,
    INTRO_LOGO_SECONDS,
} from "./constants/index.js";

// Spawn flow, in one sentence: a player without a kart gets a new one at the
// spawn point the caller picks (the intro on join); a player who already has
// one keeps it as-is — a lost melon is brought back by the break/respawn
// logic in physics/breaking.js, never here, so the two can't race each other.
// A new player's kart comes only from EnsurePlayerKarts (every tick): once
// they've picked a team it shows the Melon Racer logo for
// INTRO_LOGO_SECONDS, then spawns their melon at the intro. OnPlayerReset
// only re-sets-up a player who already has a kart; EnsurePlayerKarts also
// catches a pawn that lost its chase camera — e.g. the engine finishing a
// team-join spawn after that callback ran.

/** Game time each new player's intro logo ends, by slot — see EnsurePlayerKarts. @type {Map<number, number>} */
const introLogoEnd = new Map();

/**
 * Spawns a fresh melon from the melon_template point_template — shared by
 * CreateKart below and physics/breaking.js's respawn of a destroyed melon.
 * @param {{ x: number, y: number, z: number }} position @param {{ pitch: number, yaw: number, roll: number }} angles
 */
export function SpawnMelonAt(position, angles) {
    const template = Instance.FindEntityByName(MELON_TEMPLATE_NAME);
    if (!(template instanceof PointTemplate)) {
        Debug(`SpawnMelonAt: no point_template named "${MELON_TEMPLATE_NAME}" found`);
        return undefined;
    }
    const spawned = template.ForceSpawn(position, angles);
    if (!spawned || spawned.length === 0) {
        Debug(`SpawnMelonAt: ForceSpawn() returned nothing — check the point_template's Template entries in Hammer`);
        return undefined;
    }
    // ForceSpawn keeps the melon's offset from the template's own origin in
    // Hammer, so it lands somewhere near `position`, not on it — put it
    // exactly there.
    const melon = spawned[0];
    melon.Teleport({ position, angles, velocity: { x: 0, y: 0, z: 0 } });
    Debug(`SpawnMelonAt: spawned ${melon.GetClassName()} at ${JSON.stringify(position)}, engine health was ${melon.GetHealth()}/${melon.GetMaxHealth()}`);
    MakeUnbreakableByEngine(melon);
    return melon;
}

/**
 * Gives the melon so much engine health that the engine's own physics
 * damage can never break it — whatever its Hammer health/damage settings
 * are. Breaking is our job: kart.health, see physics/.
 * @param {any} melon
 */
function MakeUnbreakableByEngine(melon) {
    melon.SetMaxHealth(MELON_ENGINE_HEALTH);
    melon.SetHealth(MELON_ENGINE_HEALTH);
}

/**
 * Takes the player's own body out of the game: non-solid (NOCLIP — NONE
 * would leave its hitbox solid for the melon to crash into), invisible, and
 * standing still wherever it spawned — the map's player spawns sit away from
 * the tracks, so it's out of the way there. Safe to call repeatedly.
 * @param {any} pawn
 */
function FreezePawn(pawn) {
    pawn.SetMoveType(CSMoveType.NOCLIP);
    pawn.SetColor({ r: 255, g: 255, b: 255, a: 0 });
    pawn.Teleport({ velocity: { x: 0, y: 0, z: 0 } });
}

/**
 * Keeps a frozen pawn at `kart.pawnAnchor`: WASD still flies a NOCLIP pawn
 * around (it's the melon's input too), so without this it would drift off
 * across the map while the player drives. Also takes away any weapon it got
 * back (see below). Called every tick.
 * @param {import("./kart-registry.js").Kart} kart
 */
export function HoldPawn(kart) {
    // No weapons either: the engine hands the pawn a knife again after the
    // gamemode's DestroyWeapons on spawn, and every knife swing (attack)
    // shoved the melon ~140 u/s forward — a free boost that skipped the
    // attack boost's health cost (ATTACK_BOOST_*).
    if (kart.pawn.GetActiveWeapon()) {
        kart.pawn.DestroyWeapons();
    }
    const anchor = kart.pawnAnchor;
    const at = kart.pawn.GetAbsOrigin();
    if (!anchor || Math.hypot(at.x - anchor.x, at.y - anchor.y, at.z - anchor.z) <= PAWN_DRIFT_TOLERANCE) {
        return;
    }
    kart.pawn.Teleport({ position: anchor, velocity: { x: 0, y: 0, z: 0 } });
}

/**
 * A fresh kart record whose respawn point is where its melon just appeared.
 * @param {any} pawn @param {any} melon @param {import("./spawn-points.js").SpawnPoint} spawnPoint
 * @returns {import("./kart-registry.js").Kart}
 */
function NewKartRecord(pawn, melon, spawnPoint) {
    return {
        pawn,
        melon,
        wallJumpCharge: 1,
        health: MELON_MAX_HEALTH,
        lastVelocity: undefined,
        trackId: undefined,
        checkpointIndex: 0,
        checkpointPosition: spawnPoint.position,
        checkpointAngles: spawnPoint.angles,
        lapsCompleted: 0,
        inHub: false,
        racing: false,
        finished: false,
        locked: false,
        breaking: false,
        settled: false,
        teleportGen: 0,
        paintColor: { r: 255, g: 255, b: 255, a: 255 },
        userMenuOpen: false,
        hubModalOpen: false,
        jumpDebug: false,
        predictionLine: false,
        melonGlow: true,
        pawnAnchor: pawn.GetAbsOrigin(),
        lastKnownPosition: undefined,
        lastKnownAngles: undefined,
    };
}

/**
 * New kart for `slot`, its melon spawned at `spawnPoint`. The pawn is
 * frozen (non-solid) first, so the melon can't collide with it.
 * @param {any} pawn @param {number} slot @param {import("./spawn-points.js").SpawnPoint} spawnPoint
 */
function CreateKart(pawn, slot, spawnPoint) {
    FreezePawn(pawn);
    const melon = SpawnMelonAt(spawnPoint.position, spawnPoint.angles);
    if (!melon) {
        return undefined;
    }
    FacePlayerView(pawn, spawnPoint.angles.yaw);
    const kart = NewKartRecord(pawn, melon, spawnPoint);
    ShowMelonPaint(kart);
    karts.set(slot, kart);
    if (moderatorSlot === undefined) {
        SetModeratorSlot(slot);
        Debug(`CreateKart: slot ${slot} is the first player on the map, assigned as moderator`);
    }
    Debug(`CreateKart: slot ${slot} got a new kart`);
    return kart;
}

/**
 * Everything a (re)spawned player pawn needs: its kart — created at
 * `newKartSpawnPoint` only if the player has none yet — plus a frozen,
 * hidden pawn and the chase camera on the melon.
 * @param {any} pawn @param {import("./spawn-points.js").SpawnPoint | undefined} newKartSpawnPoint
 */
export function SetUpPlayerKart(pawn, newKartSpawnPoint) {
    const slot = pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot === undefined) {
        Debug("SetUpPlayerKart: pawn has no player controller/slot, aborting");
        return undefined;
    }
    let kart = karts.get(slot);
    if (!kart) {
        if (!newKartSpawnPoint) {
            return undefined; // already logged by the spawn point lookup
        }
        kart = CreateKart(pawn, slot, newKartSpawnPoint);
        if (!kart) {
            return undefined;
        }
    }
    kart.pawn = pawn;
    FreezePawn(pawn);
    kart.pawnAnchor = pawn.GetAbsOrigin();
    if (kart.melon.IsValid()) {
        ApplyCameraFollow(kart); // a lost melon gets the camera once physics/breaking.js respawns it
    }
    return kart;
}

/**
 * Every tick: makes sure each player standing on a team has a melon and is
 * looking through its chase camera. A player without a kart first sees the
 * Melon Racer logo (their own body frozen and hidden meanwhile), then gets a
 * melon at the intro. One whose pawn changed or whose camera got reset is
 * set up again on the pawn they have now — OnPlayerReset alone left a
 * player who had just picked a team stuck in their invisible, frozen body.
 */
export function EnsurePlayerKarts() {
    for (const controller of Instance.GetAllPlayerControllers()) {
        if (!controller.IsConnected()) {
            continue;
        }
        const pawn = controller.GetPlayerPawn();
        if (!pawn?.IsValid() || !pawn.IsAlive() || !IsOnPlayingTeam(pawn)) {
            continue; // spectating, picking a team, or dead (waiting to respawn)
        }
        const slot = controller.GetPlayerSlot();
        const kart = karts.get(slot);
        if (!kart) {
            ShowIntroLogoThenSpawn(slot, pawn);
        } else if (kart.pawn !== pawn) {
            Debug(`EnsurePlayerKarts: slot ${slot} got a new pawn, moving the kart over`);
            SetUpPlayerKart(pawn, undefined);
        } else if (kart.melon.IsValid() && !kart.breaking && pawn.GetCustomCamera().GetMode() !== CustomCameraMode.FOLLOW_POSITION) {
            Debug(`EnsurePlayerKarts: slot ${slot} lost the chase camera, re-attaching`);
            SetUpPlayerKart(pawn, undefined);
        }
    }
}

/**
 * A new player's first INTRO_LOGO_SECONDS on a team: the logo, then their
 * melon at the intro. Retried a second later if the melon can't spawn.
 * @param {number} slot @param {any} pawn
 */
function ShowIntroLogoThenSpawn(slot, pawn) {
    const now = Instance.GetGameTime();
    const end = introLogoEnd.get(slot);
    if (end === undefined) {
        Debug(`EnsurePlayerKarts: slot ${slot} joined a team, showing the logo before spawning at the intro`);
        FreezePawn(pawn);
        SetIntroLogoVisible(slot, true);
        introLogoEnd.set(slot, now + INTRO_LOGO_SECONDS);
        return;
    }
    if (now < end) {
        return;
    }
    if (SetUpPlayerKart(pawn, GetIntroSpawnPoint())) {
        SetIntroLogoVisible(slot, false);
        introLogoEnd.delete(slot);
    } else {
        introLogoEnd.set(slot, now + 1);
    }
}

/** @param {number} slot @param {boolean} visible */
function SetIntroLogoVisible(slot, visible) {
    GetSpeedHud()?.SetHasClassForPlayer(slot, "intro_logo", "Hidden", !visible);
}

/**
 * Forgets a disconnecting player's logo state and hides the logo, so a
 * reconnect (a first join again) shows it from the start.
 * @param {number} slot
 */
export function ForgetIntroLogo(slot) {
    if (introLogoEnd.delete(slot)) {
        SetIntroLogoVisible(slot, false);
    }
}

/** T (2) or CT (3) — not unassigned (0) or spectator (1). @param {any} pawn */
function IsOnPlayingTeam(pawn) {
    const team = pawn.GetTeamNumber();
    return team === 2 || team === 3;
}
