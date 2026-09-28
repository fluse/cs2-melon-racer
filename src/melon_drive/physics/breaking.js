// A melon breaking: BreakMelon (health ran out) / HandleMelonLost (the
// entity vanished), the delay at the crash site, and the respawn after it.
import { Instance } from "cs_script/point_script";
import { Debug } from "../debug.js";
import { karts } from "../kart-registry.js";
import { SpawnMelonAt } from "../kart-spawn.js";
import { FacePlayerView } from "../spawn-points.js";
import { ApplyCameraFollow } from "../camera/index.js";
import { MELON_MAX_HEALTH, BREAK_RESPAWN_DELAY, BREAK_TINT_FALLBACK } from "../constants/index.js";
import { DirectionToAngles, SpawnBreakParticles } from "./break-effects.js";
import { RespawnKartAtCheckpoint } from "./teleport.js";
import { LeaveZones } from "./zones.js";

/**
 * Common tail end of every break, whether it was caught by our own
 * kart.health tracking (BreakMelon) or discovered after the fact because the
 * melon vanished on its own (HandleMelonLost): wait out BREAK_RESPAWN_DELAY,
 * then bring the kart back — reusing the same (hidden) melon where possible,
 * or spawning a brand new one at the checkpoint if the original is actually
 * gone.
 * @param {number} slot @param {import("../kart-registry.js").Kart} kart
 */
function ScheduleRespawnAfterBreak(slot, kart) {
    // Which race-flow teleport this break happened after — see
    // Kart.teleportGen. Compared against, rather than checking
    // kart.racing/locked: those also describe perfectly ordinary states
    // (free-roaming the hub, parked after finishing) in which a broken melon
    // still needs to go back to its checkpoint.
    const teleportGen = kart.teleportGen;
    Instance.Delay(BREAK_RESPAWN_DELAY).then(() => {
        kart.breaking = false;
        kart.breakTime = undefined;
        if (!kart.pawn.IsValid() || karts.get(slot) !== kart) {
            return; // player disconnected, or a fresh kart already replaced this one
        }
        if (!kart.melon.IsValid()) {
            // The melon wasn't just hidden by us — it's genuinely gone (the
            // engine's own physics broke the prop_physics_multiplayer for
            // real on a hard enough hit, see HandleMelonLost) — spawn a fresh
            // one instead of teleporting an entity that no longer exists.
            // Checked before the teleportGen case below, and regardless of
            // racing/locked: otherwise a melon lost outside a heat would never
            // come back, and Think would re-run HandleMelonLost on it forever.
            // checkpointPosition is correct even if the race flow moved on
            // meanwhile — BeginHeat/ReturnAllToHub set it to their own
            // (skipped, since the melon was dead) teleport target.
            RespawnDestroyedMelon(slot, kart);
            return;
        }
        kart.melon.SetColor(kart.paintColor);
        // Back from the pulled-out break camera (ApplyBreakCameraZoom) to the
        // player's normal chase offset.
        ApplyCameraFollow(kart);
        if (kart.teleportGen !== teleportGen) {
            // The race flow moved this kart while it was mid-break (next
            // heat's BeginHeat, or ReturnAllToHub via finish/moderator
            // abort/the player's own "Return to hub" button). That
            // already-current teleport wins — don't stomp it a second later
            // with a now-stale checkpoint.
            kart.health = MELON_MAX_HEALTH;
            return;
        }
        RespawnKartAtCheckpoint(kart);
    });
}

/** @param {number} slot @param {import("../kart-registry.js").Kart} kart */
function RespawnDestroyedMelon(slot, kart) {
    const melon = SpawnMelonAt(kart.checkpointPosition, kart.checkpointAngles);
    if (!melon) {
        // kart.breaking is already cleared, so Think's invalid-melon check
        // runs HandleMelonLost again next tick — that's the retry.
        Debug(`slot ${slot}: could not respawn a melon after it was destroyed, will keep retrying`);
        return;
    }
    kart.melon = melon;
    FacePlayerView(kart.pawn, kart.checkpointAngles.yaw);
    kart.melon.SetColor(kart.paintColor);
    kart.health = MELON_MAX_HEALTH;
    kart.lastVelocity = undefined;
    kart.settled = false;
    kart.speedCap = undefined;
    kart.pendingBounce = undefined;
    LeaveZones(kart); // a new melon entity — the old one's zones never send heal_leave/lift_leave
    ApplyCameraFollow(kart);
}

/** @param {number} slot @param {import("../kart-registry.js").Kart} kart @param {{ x: number, y: number, z: number }} impactDir @param {number} impactSpeed */
export function BreakMelon(slot, kart, impactDir, impactSpeed) {
    if (kart.breaking) {
        return; // already broken and counting down to its respawn
    }
    kart.breaking = true;
    kart.breakTime = Instance.GetGameTime();
    const breakPosition = kart.melon.GetAbsOrigin();
    // Oriented along the velocity change the impact caused, not the melon's
    // own orientation — while rolling, that's an essentially random tumble
    // unrelated to which way it just got hit.
    const breakAngles = DirectionToAngles(impactDir, impactSpeed);
    Debug(`slot ${slot}: melon broke at ${JSON.stringify(breakPosition)} — respawning at checkpoint ${kart.checkpointIndex} in ${BREAK_RESPAWN_DELAY}s`);

    kart.melon.Move({ velocity: { x: 0, y: 0, z: 0 } });
    kart.lastVelocity = undefined;
    kart.settled = false;
    // Hidden entirely when the break particle actually spawned — it reads as
    // the melon shredding apart, which a dark husk just sitting there in one
    // piece doesn't. But without a "melon_break_template" placed in Hammer
    // there's nothing else marking the crash site: the melon would just
    // vanish and silently reappear at the checkpoint BREAK_RESPAWN_DELAY
    // later, which looks like the camera instantly cut to the respawn. Tint
    // it dark and leave it visible instead, so there's always something at
    // the crash site to see while it waits out the respawn delay.
    // kart.paintColor itself is untouched either way, restored in
    // ScheduleRespawnAfterBreak.
    const particlesSpawned = SpawnBreakParticles(breakPosition, breakAngles, kart.paintColor);
    kart.melon.SetColor(particlesSpawned ? { r: 255, g: 255, b: 255, a: 0 } : BREAK_TINT_FALLBACK);

    ScheduleRespawnAfterBreak(slot, kart);
}

/**
 * Recovery path for a melon that broke for real instead of just being hidden
 * by BreakMelon above — the engine's own physics can destroy a
 * prop_physics_multiplayer outright on a hard enough impact, sometimes
 * before our own kart.health tracking even gets a chance to react. Without
 * this, that kart would silently lose its melon with no break particle, no
 * delay, and (since nothing else re-creates it while the player's pawn stays
 * alive — see gamemode/index.js) no way back at all. Runs the same
 * particle + delay + checkpoint-respawn sequence as a script-detected break,
 * using the last position/angles Think() saw the melon at (it's already gone
 * by the time this runs, so it can't be asked directly).
 * @param {number} slot @param {import("../kart-registry.js").Kart} kart
 */
export function HandleMelonLost(slot, kart) {
    if (kart.breaking) {
        return; // already mid-break/respawn over this same loss
    }
    kart.breaking = true;
    kart.health = 0;
    const breakPosition = kart.lastKnownPosition ?? kart.checkpointPosition;
    const breakAngles = kart.lastKnownAngles ?? kart.checkpointAngles;
    Debug(`slot ${slot}: melon was destroyed at ${JSON.stringify(breakPosition)} — respawning at checkpoint ${kart.checkpointIndex} in ${BREAK_RESPAWN_DELAY}s`);
    SpawnBreakParticles(breakPosition, breakAngles, kart.paintColor);
    ScheduleRespawnAfterBreak(slot, kart);
}
